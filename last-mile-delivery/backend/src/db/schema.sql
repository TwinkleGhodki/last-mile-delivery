-- ============================================================
-- Last-Mile Delivery Tracker - Database Schema (SQLite)
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- USERS ----------
-- Single users table with a role column. Agents get extra fields
-- (zone_id, current lat/lng, availability) used by auto-assignment.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('customer','agent','admin')),
  phone         TEXT,
  -- agent-only fields
  zone_id       TEXT REFERENCES zones(id),
  is_available  INTEGER DEFAULT 1,        -- 1 = free to accept a new order
  current_lat   REAL,
  current_lng   REAL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- ZONES ----------
-- Admin-defined delivery zones. Areas (pincodes/localities) are
-- mapped to a zone via zone_areas. Zone rate lookup (intra vs inter)
-- is derived at order time by comparing pickup_zone_id vs drop_zone_id.
CREATE TABLE IF NOT EXISTS zones (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  -- optional centroid, used as a fallback for auto-assignment distance
  -- when an agent has no live lat/lng
  center_lat  REAL,
  center_lng  REAL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- ZONE AREAS ----------
-- Maps a pincode/area-code string to exactly one zone.
CREATE TABLE IF NOT EXISTS zone_areas (
  id       TEXT PRIMARY KEY,
  zone_id  TEXT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  area_code TEXT NOT NULL UNIQUE,   -- e.g. pincode "600001" or locality slug
  label     TEXT
);

-- ---------- RATE CARDS ----------
-- One row per (order_type, rate_type) combination, admin-configurable.
-- order_type: B2B | B2C
-- rate_type : INTRA (pickup zone == drop zone) | INTER (different zones)
-- Charge = base_fee + (per_kg_rate * billable_weight_kg) + (per_km_rate * distance_km, optional)
CREATE TABLE IF NOT EXISTS rate_cards (
  id            TEXT PRIMARY KEY,
  order_type    TEXT NOT NULL CHECK (order_type IN ('B2B','B2C')),
  rate_type     TEXT NOT NULL CHECK (rate_type IN ('INTRA','INTER')),
  base_fee      REAL NOT NULL DEFAULT 0,
  per_kg_rate   REAL NOT NULL DEFAULT 0,
  min_weight_kg REAL NOT NULL DEFAULT 0,   -- weight included in base_fee
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(order_type, rate_type)
);

-- ---------- COD SURCHARGE CONFIG ----------
-- Admin-configurable COD surcharge per order type.
-- surcharge = flat_fee + (percent_of_value * declared_value / 100), whichever combination admin sets.
CREATE TABLE IF NOT EXISTS cod_surcharge_config (
  id                TEXT PRIMARY KEY,
  order_type        TEXT NOT NULL UNIQUE CHECK (order_type IN ('B2B','B2C')),
  flat_fee          REAL NOT NULL DEFAULT 0,
  percent_of_value  REAL NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- ORDERS ----------
CREATE TABLE IF NOT EXISTS orders (
  id                  TEXT PRIMARY KEY,
  customer_id         TEXT NOT NULL REFERENCES users(id),
  created_by          TEXT NOT NULL REFERENCES users(id), -- customer or admin (on behalf of)
  pickup_address      TEXT NOT NULL,
  pickup_area_code    TEXT NOT NULL,
  pickup_zone_id      TEXT REFERENCES zones(id),
  drop_address        TEXT NOT NULL,
  drop_area_code      TEXT NOT NULL,
  drop_zone_id        TEXT REFERENCES zones(id),
  length_cm           REAL NOT NULL,
  breadth_cm          REAL NOT NULL,
  height_cm           REAL NOT NULL,
  actual_weight_kg    REAL NOT NULL,
  volumetric_weight_kg REAL NOT NULL,
  billable_weight_kg  REAL NOT NULL,
  order_type          TEXT NOT NULL CHECK (order_type IN ('B2B','B2C')),
  payment_type        TEXT NOT NULL CHECK (payment_type IN ('PREPAID','COD')),
  declared_value      REAL DEFAULT 0,           -- used for COD % surcharge
  rate_type           TEXT NOT NULL CHECK (rate_type IN ('INTRA','INTER')),
  base_charge         REAL NOT NULL,
  cod_surcharge       REAL NOT NULL DEFAULT 0,
  total_charge        REAL NOT NULL,
  status              TEXT NOT NULL DEFAULT 'CREATED'
                        CHECK (status IN ('CREATED','ASSIGNED','PICKED_UP','IN_TRANSIT',
                                           'OUT_FOR_DELIVERY','DELIVERED','FAILED','RESCHEDULED')),
  assigned_agent_id   TEXT REFERENCES users(id),
  reschedule_date     TEXT,
  failure_reason      TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- ORDER STATUS HISTORY (immutable audit trail) ----------
-- Every status transition is appended here and never edited/deleted.
CREATE TABLE IF NOT EXISTS order_status_history (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_id    TEXT REFERENCES users(id),
  actor_role  TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- NOTIFICATIONS LOG ----------
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL CHECK (channel IN ('EMAIL','SMS')),
  recipient   TEXT NOT NULL,
  subject     TEXT,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'SENT',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_agent ON orders(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_zone ON orders(pickup_zone_id);
CREATE INDEX IF NOT EXISTS idx_orders_drop_zone ON orders(drop_zone_id);
CREATE INDEX IF NOT EXISTS idx_history_order ON order_status_history(order_id);
