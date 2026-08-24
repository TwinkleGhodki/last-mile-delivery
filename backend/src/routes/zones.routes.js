const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// List zones (any authenticated user - needed for order creation forms)
router.get('/', authenticate, (req, res) => {
  const zones = db.prepare('SELECT * FROM zones ORDER BY name').all();
  const areas = db.prepare('SELECT * FROM zone_areas ORDER BY area_code').all();
  const withAreas = zones.map((z) => ({
    ...z,
    areas: areas.filter((a) => a.zone_id === z.id),
  }));
  res.json(withAreas);
});

// Create zone (admin only)
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { name, center_lat, center_lng } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = uuid();
  db.prepare('INSERT INTO zones (id, name, center_lat, center_lng) VALUES (?,?,?,?)')
    .run(id, name, center_lat ?? null, center_lng ?? null);
  res.status(201).json(db.prepare('SELECT * FROM zones WHERE id = ?').get(id));
});

// Assign an area code (pincode/locality) to a zone (admin only)
router.post('/:zoneId/areas', authenticate, authorize('admin'), (req, res) => {
  const { zoneId } = req.params;
  const { area_code, label } = req.body;
  if (!area_code) return res.status(400).json({ error: 'area_code is required' });

  const zone = db.prepare('SELECT * FROM zones WHERE id = ?').get(zoneId);
  if (!zone) return res.status(404).json({ error: 'Zone not found' });

  const existing = db.prepare('SELECT * FROM zone_areas WHERE area_code = ?').get(area_code);
  if (existing) {
    db.prepare('UPDATE zone_areas SET zone_id = ?, label = ? WHERE area_code = ?').run(zoneId, label || null, area_code);
  } else {
    db.prepare('INSERT INTO zone_areas (id, zone_id, area_code, label) VALUES (?,?,?,?)')
      .run(uuid(), zoneId, area_code, label || null);
  }
  res.status(201).json(db.prepare('SELECT * FROM zone_areas WHERE area_code = ?').get(area_code));
});

router.delete('/areas/:areaCode', authenticate, authorize('admin'), (req, res) => {
  db.prepare('DELETE FROM zone_areas WHERE area_code = ?').run(req.params.areaCode);
  res.status(204).send();
});

module.exports = router;
