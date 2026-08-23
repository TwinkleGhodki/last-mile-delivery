const express = require('express');
const { v4: uuid } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// List agents (admin only) - shows availability + zone, used for manual assignment UI
router.get('/', authenticate, authorize('admin'), (req, res) => {
  const agents = db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.zone_id, z.name as zone_name,
           u.is_available, u.current_lat, u.current_lng
    FROM users u LEFT JOIN zones z ON z.id = u.zone_id
    WHERE u.role = 'agent'
    ORDER BY u.name
  `).all();
  res.json(agents);
});

// Admin creates a new agent account
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { name, email, password, phone, zone_id } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id = uuid();
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, phone, zone_id, is_available)
    VALUES (?,?,?,?,?,?,?,1)
  `).run(id, name, email, bcrypt.hashSync(password, 10), 'agent', phone || null, zone_id || null);

  res.status(201).json(db.prepare('SELECT id, name, email, phone, zone_id, is_available FROM users WHERE id = ?').get(id));
});

// Agent (self) or admin updates availability / current location
router.patch('/:id/status', authenticate, (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Cannot update another agent' });
  }
  const { is_available, current_lat, current_lng } = req.body;
  const agent = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(id, 'agent');
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  db.prepare(`
    UPDATE users SET
      is_available = COALESCE(?, is_available),
      current_lat = COALESCE(?, current_lat),
      current_lng = COALESCE(?, current_lng)
    WHERE id = ?
  `).run(
    is_available === undefined ? null : (is_available ? 1 : 0),
    current_lat ?? null,
    current_lng ?? null,
    id
  );
  res.json(db.prepare('SELECT id, name, email, is_available, current_lat, current_lng FROM users WHERE id = ?').get(id));
});

// Orders assigned to the logged-in agent
router.get('/me/orders', authenticate, authorize('agent'), (req, res) => {
  const orders = db.prepare(`
    SELECT * FROM orders WHERE assigned_agent_id = ? ORDER BY created_at DESC
  `).all(req.user.id);
  res.json(orders);
});

module.exports = router;
