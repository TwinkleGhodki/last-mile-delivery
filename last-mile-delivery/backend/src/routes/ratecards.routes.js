const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// List all rate cards + COD config (any authenticated user, e.g. to preview pricing rules)
router.get('/', authenticate, (req, res) => {
  const rateCards = db.prepare('SELECT * FROM rate_cards ORDER BY order_type, rate_type').all();
  const codConfig = db.prepare('SELECT * FROM cod_surcharge_config ORDER BY order_type').all();
  res.json({ rateCards, codConfig });
});

// Upsert a rate card (admin only)
router.put('/', authenticate, authorize('admin'), (req, res) => {
  const { order_type, rate_type, base_fee, per_kg_rate, min_weight_kg } = req.body;
  if (!order_type || !rate_type) {
    return res.status(400).json({ error: 'order_type and rate_type are required' });
  }
  const existing = db.prepare('SELECT * FROM rate_cards WHERE order_type=? AND rate_type=?').get(order_type, rate_type);
  if (existing) {
    db.prepare(`
      UPDATE rate_cards SET base_fee=?, per_kg_rate=?, min_weight_kg=?, updated_at=datetime('now')
      WHERE id = ?
    `).run(base_fee ?? existing.base_fee, per_kg_rate ?? existing.per_kg_rate, min_weight_kg ?? existing.min_weight_kg, existing.id);
  } else {
    db.prepare(`
      INSERT INTO rate_cards (id, order_type, rate_type, base_fee, per_kg_rate, min_weight_kg)
      VALUES (?,?,?,?,?,?)
    `).run(uuid(), order_type, rate_type, base_fee || 0, per_kg_rate || 0, min_weight_kg || 0);
  }
  res.json(db.prepare('SELECT * FROM rate_cards WHERE order_type=? AND rate_type=?').get(order_type, rate_type));
});

// Upsert COD surcharge config (admin only)
router.put('/cod-surcharge', authenticate, authorize('admin'), (req, res) => {
  const { order_type, flat_fee, percent_of_value } = req.body;
  if (!order_type) return res.status(400).json({ error: 'order_type is required' });

  const existing = db.prepare('SELECT * FROM cod_surcharge_config WHERE order_type = ?').get(order_type);
  if (existing) {
    db.prepare(`
      UPDATE cod_surcharge_config SET flat_fee=?, percent_of_value=?, updated_at=datetime('now')
      WHERE id = ?
    `).run(flat_fee ?? existing.flat_fee, percent_of_value ?? existing.percent_of_value, existing.id);
  } else {
    db.prepare(`
      INSERT INTO cod_surcharge_config (id, order_type, flat_fee, percent_of_value)
      VALUES (?,?,?,?)
    `).run(uuid(), order_type, flat_fee || 0, percent_of_value || 0);
  }
  res.json(db.prepare('SELECT * FROM cod_surcharge_config WHERE order_type = ?').get(order_type));
});

module.exports = router;
