require('dotenv').config();
const { v4: uuid } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('./db');

function upsertUser({ name, email, password, role, phone, zone_id }) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return existing.id;
  const id = uuid();
  const password_hash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, phone, zone_id, is_available)
    VALUES (?,?,?,?,?,?,?,1)
  `).run(id, name, email, password_hash, role, phone || null, zone_id || null);
  return id;
}

function upsertZone(name, lat, lng) {
  const existing = db.prepare('SELECT id FROM zones WHERE name = ?').get(name);
  if (existing) return existing.id;
  const id = uuid();
  db.prepare('INSERT INTO zones (id, name, center_lat, center_lng) VALUES (?,?,?,?)').run(id, name, lat, lng);
  return id;
}

function upsertArea(area_code, zone_id, label) {
  const existing = db.prepare('SELECT id FROM zone_areas WHERE area_code = ?').get(area_code);
  if (existing) return;
  db.prepare('INSERT INTO zone_areas (id, zone_id, area_code, label) VALUES (?,?,?,?)')
    .run(uuid(), zone_id, area_code, label || null);
}

function upsertRateCard(order_type, rate_type, base_fee, per_kg_rate, min_weight_kg) {
  const existing = db.prepare('SELECT id FROM rate_cards WHERE order_type=? AND rate_type=?').get(order_type, rate_type);
  if (existing) return;
  db.prepare(`
    INSERT INTO rate_cards (id, order_type, rate_type, base_fee, per_kg_rate, min_weight_kg)
    VALUES (?,?,?,?,?,?)
  `).run(uuid(), order_type, rate_type, base_fee, per_kg_rate, min_weight_kg);
}

function upsertCOD(order_type, flat_fee, percent_of_value) {
  const existing = db.prepare('SELECT id FROM cod_surcharge_config WHERE order_type=?').get(order_type);
  if (existing) return;
  db.prepare(`
    INSERT INTO cod_surcharge_config (id, order_type, flat_fee, percent_of_value)
    VALUES (?,?,?,?)
  `).run(uuid(), order_type, flat_fee, percent_of_value);
}

// --- Zones (Chennai-area example) ---
const north = upsertZone('North Zone', 13.09, 80.27);
const south = upsertZone('South Zone', 12.92, 80.13);
const west = upsertZone('West Zone', 13.02, 80.14);

upsertArea('600001', north, 'George Town');
upsertArea('600002', north, 'Anna Salai');
upsertArea('600020', south, 'Adyar');
upsertArea('600041', south, 'Thiruvanmiyur');
upsertArea('600095', west, 'Poonamallee');
upsertArea('600056', west, 'Iyappanthangal');

// --- Rate cards ---
upsertRateCard('B2C', 'INTRA', 30, 15, 0.5);
upsertRateCard('B2C', 'INTER', 50, 20, 0.5);
upsertRateCard('B2B', 'INTRA', 40, 12, 1);
upsertRateCard('B2B', 'INTER', 70, 16, 1);

// --- COD surcharge config ---
upsertCOD('B2C', 20, 1.0);
upsertCOD('B2B', 15, 0.5);

// --- Default users ---
const adminId = upsertUser({ name: 'Admin', email: 'admin@example.com', password: 'admin123', role: 'admin' });
const custId = upsertUser({ name: 'Test Customer', email: 'customer@example.com', password: 'customer123', role: 'customer', phone: '9000000001' });
const agent1 = upsertUser({ name: 'Agent North', email: 'agent.north@example.com', password: 'agent123', role: 'agent', phone: '9000000002', zone_id: north });
const agent2 = upsertUser({ name: 'Agent South', email: 'agent.south@example.com', password: 'agent123', role: 'agent', phone: '9000000003', zone_id: south });
const agent3 = upsertUser({ name: 'Agent West', email: 'agent.west@example.com', password: 'agent123', role: 'agent', phone: '9000000004', zone_id: west });

console.log('Seed complete.');
console.log('Admin login   : admin@example.com / admin123');
console.log('Customer login: customer@example.com / customer123');
console.log('Agent logins  : agent.north@example.com / agent123 (and .south / .west)');
