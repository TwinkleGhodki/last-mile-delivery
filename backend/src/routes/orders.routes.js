const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');
const { calculateCharge } = require('../utils/rateEngine');
const { findNearestAvailableAgent } = require('../utils/assignment');
const { notifyStatusChange } = require('../utils/notify');

const router = express.Router();

const AGENT_UPDATABLE_STATUSES = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'];
const ALL_STATUSES = ['CREATED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RESCHEDULED'];

// Valid forward transitions for non-admin actors. Admin can override to any status.
const ALLOWED_TRANSITIONS = {
  CREATED: ['ASSIGNED'],
  ASSIGNED: ['PICKED_UP', 'FAILED'],
  PICKED_UP: ['IN_TRANSIT', 'FAILED'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'FAILED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
  FAILED: ['RESCHEDULED'],
  RESCHEDULED: ['ASSIGNED'],
  DELIVERED: [],
};

function logHistory(orderId, fromStatus, toStatus, actor, note) {
  db.prepare(`
    INSERT INTO order_status_history (id, order_id, from_status, to_status, actor_id, actor_role, note)
    VALUES (?,?,?,?,?,?,?)
  `).run(uuid(), orderId, fromStatus, toStatus, actor?.id || null, actor?.role || null, note || null);
}

function getOrder(id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

async function transitionOrder(order, newStatus, actor, { note, failureReason, rescheduleDate } = {}) {
  db.prepare(`
    UPDATE orders SET status = ?, failure_reason = COALESCE(?, failure_reason),
      reschedule_date = COALESCE(?, reschedule_date), updated_at = datetime('now')
    WHERE id = ?
  `).run(newStatus, failureReason || null, rescheduleDate || null, order.id);

  logHistory(order.id, order.status, newStatus, actor, note);

  const updated = getOrder(order.id);
  const customer = db.prepare('SELECT email FROM users WHERE id = ?').get(updated.customer_id);
  if (customer) {
    await notifyStatusChange(updated, customer.email).catch((e) => console.error('notify error', e.message));
  }
  return updated;
}

// ---------- QUOTE (charge preview before order confirmation) ----------
router.post('/quote', authenticate, (req, res) => {
  try {
    const charge = calculateCharge(mapChargeInput(req.body));
    res.json(charge);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function mapChargeInput(body) {
  return {
    pickupAreaCode: body.pickup_area_code,
    dropAreaCode: body.drop_area_code,
    lengthCm: Number(body.length_cm),
    breadthCm: Number(body.breadth_cm),
    heightCm: Number(body.height_cm),
    actualWeightKg: Number(body.actual_weight_kg),
    orderType: body.order_type,
    paymentType: body.payment_type,
    declaredValue: Number(body.declared_value || 0),
  };
}

// ---------- CREATE ORDER ----------
// Customers create their own orders. Admin can create on behalf of any customer
// by passing customer_id (and customer_email/name to auto-create the customer if new).
router.post('/', authenticate, authorize('customer', 'admin'), async (req, res) => {
  try {
    const body = req.body;
    let customerId = req.user.id;

    if (req.user.role === 'admin') {
      if (!body.customer_id) return res.status(400).json({ error: 'admin must supply customer_id' });
      const cust = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(body.customer_id, 'customer');
      if (!cust) return res.status(404).json({ error: 'Customer not found' });
      customerId = cust.id;
    }

    const charge = calculateCharge(mapChargeInput(body));

    const id = uuid();
    db.prepare(`
      INSERT INTO orders (
        id, customer_id, created_by, pickup_address, pickup_area_code, pickup_zone_id,
        drop_address, drop_area_code, drop_zone_id, length_cm, breadth_cm, height_cm,
        actual_weight_kg, volumetric_weight_kg, billable_weight_kg, order_type, payment_type,
        declared_value, rate_type, base_charge, cod_surcharge, total_charge, status
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'CREATED')
    `).run(
      id, customerId, req.user.id,
      body.pickup_address, body.pickup_area_code, charge.pickupZone.id,
      body.drop_address, body.drop_area_code, charge.dropZone.id,
      Number(body.length_cm), Number(body.breadth_cm), Number(body.height_cm),
      Number(body.actual_weight_kg), charge.volumetricWeight, charge.billableWeight,
      body.order_type, body.payment_type, Number(body.declared_value || 0),
      charge.rateType, charge.baseCharge, charge.codSurcharge, charge.totalCharge
    );

    logHistory(id, null, 'CREATED', req.user, 'Order created');

    const order = getOrder(id);
    const customer = db.prepare('SELECT email FROM users WHERE id = ?').get(customerId);
    await notifyStatusChange(order, customer.email).catch((e) => console.error('notify error', e.message));

    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- LIST ORDERS ----------
// Customer: own orders. Agent: assigned orders. Admin: all orders + filters.
router.get('/', authenticate, (req, res) => {
  if (req.user.role === 'customer') {
    const orders = db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC').all(req.user.id);
    return res.json(orders);
  }
  if (req.user.role === 'agent') {
    const orders = db.prepare('SELECT * FROM orders WHERE assigned_agent_id = ? ORDER BY created_at DESC').all(req.user.id);
    return res.json(orders);
  }
  // admin: filter by status/zone/agent
  const { status, zone_id, agent_id } = req.query;
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (zone_id) { sql += ' AND (pickup_zone_id = ? OR drop_zone_id = ?)'; params.push(zone_id, zone_id); }
  if (agent_id) { sql += ' AND assigned_agent_id = ?'; params.push(agent_id); }
  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// ---------- GET ONE ORDER + TRACKING TIMELINE ----------
router.get('/:id', authenticate, (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (req.user.role === 'customer' && order.customer_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (req.user.role === 'agent' && order.assigned_agent_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const timeline = db.prepare(`
    SELECT h.*, u.name as actor_name FROM order_status_history h
    LEFT JOIN users u ON u.id = h.actor_id
    WHERE order_id = ? ORDER BY created_at ASC
  `).all(order.id);

  res.json({ ...order, timeline });
});

// ---------- MANUAL / AUTO ASSIGNMENT (admin) ----------
router.post('/:id/assign', authenticate, authorize('admin'), async (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['CREATED', 'RESCHEDULED'].includes(order.status)) {
    return res.status(400).json({ error: `Cannot assign an order in status ${order.status}` });
  }

  let agentId = req.body.agent_id;
  if (!agentId) {
    const agent = findNearestAvailableAgent(order.pickup_zone_id);
    if (!agent) return res.status(409).json({ error: 'No available agents found for auto-assignment' });
    agentId = agent.id;
  } else {
    const agent = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(agentId, 'agent');
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
  }

  db.prepare('UPDATE orders SET assigned_agent_id = ? WHERE id = ?').run(agentId, order.id);
  db.prepare('UPDATE users SET is_available = 0 WHERE id = ?').run(agentId);

  const updated = await transitionOrder(getOrder(order.id), 'ASSIGNED', req.user, { note: `Assigned to agent ${agentId}` });
  res.json(updated);
});

// ---------- STATUS UPDATE (agent updates own order; admin can override to any status) ----------
router.patch('/:id/status', authenticate, authorize('agent', 'admin'), async (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { status, failure_reason, note } = req.body;
  if (!ALL_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  if (req.user.role === 'agent') {
    if (order.assigned_agent_id !== req.user.id) return res.status(403).json({ error: 'Not your order' });
    if (!AGENT_UPDATABLE_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Agents can only move status forward through the delivery lifecycle' });
    }
    const allowed = ALLOWED_TRANSITIONS[order.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Cannot move from ${order.status} to ${status}` });
    }
  }
  // admin: allowed to override to any status (per spec) - no transition check

  if (status === 'FAILED' && !failure_reason) {
    return res.status(400).json({ error: 'failure_reason is required when marking a delivery FAILED' });
  }

  // Freeing the agent up again on terminal/failed states
  if (['DELIVERED', 'FAILED'].includes(status) && order.assigned_agent_id) {
    db.prepare('UPDATE users SET is_available = 1 WHERE id = ?').run(order.assigned_agent_id);
  }

  const updated = await transitionOrder(order, status, req.user, { note, failureReason: failure_reason });
  res.json(updated);
});

// ---------- RESCHEDULE (customer, after a FAILED delivery) ----------
router.post('/:id/reschedule', authenticate, authorize('customer', 'admin'), async (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (req.user.role === 'customer' && order.customer_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (order.status !== 'FAILED') {
    return res.status(400).json({ error: 'Only a FAILED order can be rescheduled' });
  }
  const { reschedule_date } = req.body;
  if (!reschedule_date) return res.status(400).json({ error: 'reschedule_date is required' });

  // Reschedule clears the previous agent assignment; a fresh assignment
  // (manual or auto) is required for the new attempt.
  db.prepare('UPDATE orders SET assigned_agent_id = NULL WHERE id = ?').run(order.id);

  const updated = await transitionOrder(order, 'RESCHEDULED', req.user, {
    note: `Rescheduled for ${reschedule_date}`,
    rescheduleDate: reschedule_date,
  });
  res.json(updated);
});

module.exports = router;
