# Last-Mile Delivery Tracker

A delivery management platform: customers place orders with auto-calculated
charges, admins manage zones/rate cards and assign agents (manually or
automatically), agents update delivery status, and customers get emailed
at every step and can track and reschedule failed deliveries.

**Stack:** Node.js + Express + SQLite (`better-sqlite3`) backend · React
(Vite) frontend · JWT role-based auth (customer / agent / admin).

SQLite was chosen deliberately for this assignment: zero external setup,
runs identically on your laptop and on Render/Railway's free tiers, and the
schema is plain SQL so swapping to Postgres later only means changing the
`db.js` driver, not the data model.

---

## 1. Project structure

```
delivery-tracker/
├── backend/
│   ├── src/
│   │   ├── db/            # schema.sql, db.js (connection + auto-migrate), seed.js
│   │   ├── middleware/     # auth.js (JWT verify + role guard)
│   │   ├── routes/         # auth, orders, zones, rate-cards, agents
│   │   ├── utils/          # rateEngine.js, zoneDetection.js, assignment.js, notify.js
│   │   └── server.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/           # Login, Register, Customer/Agent/Admin dashboards, OrderDetail
│   │   ├── pages/admin/      # AdminOrders, AdminZones, AdminRateCards, AdminAgents
│   │   ├── components/       # NavBar, OrderForm, OrderList, ProtectedRoute
│   │   ├── context/AuthContext.jsx
│   │   └── api/client.js
│   ├── package.json
│   └── .env.example
├── SYSTEM_DESIGN.md
└── README.md
```

## 2. Local setup

### Prerequisites
Node.js 18+ and npm.

### Backend

```bash
cd backend
cp .env.example .env      # edit JWT_SECRET at minimum
npm install
npm run seed               # creates data.sqlite + demo zones/rate cards/users
npm run start               # http://localhost:4000
```

Seeded logins (all created by `npm run seed`):

| Role     | Email                     | Password    |
|----------|---------------------------|-------------|
| Admin    | admin@example.com         | admin123    |
| Customer | customer@example.com      | customer123 |
| Agent    | agent.north@example.com   | agent123    |
| Agent    | agent.south@example.com   | agent123    |
| Agent    | agent.west@example.com    | agent123    |

Seed data also includes 3 zones (North/South/West) with sample pincodes
(600001, 600002 → North; 600020, 600041 → South; 600095, 600056 → West),
B2B/B2C rate cards, and COD surcharge config — enough to place orders and
see INTRA vs INTER pricing immediately.

### Frontend

```bash
cd frontend
cp .env.example .env       # VITE_API_URL, defaults to http://localhost:4000/api
npm install
npm run dev                  # http://localhost:5173
```

Open http://localhost:5173, log in with one of the seeded accounts above.

### Email / SMS (optional)

No credentials are required to run or demo the app — if `SMTP_HOST` /
`SMTP_USER` / `SMTP_PASS` are not set in `backend/.env`, every notification
is logged to the backend console **and** still written to the
`notifications` table, so the full notification history is visible and
demoable without signing up for anything.

To send real emails on a free tier, set in `backend/.env`:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=<a Gmail App Password, not your account password>
SMTP_FROM=you@gmail.com
```
(Any SMTP provider works the same way — Brevo/Sendinblue and Mailtrap both
have generous free tiers if you'd rather not use Gmail.)

SMS is mocked the same way by default. To wire up Twilio's free trial,
`npm install twilio` in `backend/`, then set `SMS_PROVIDER=twilio`,
`TWILIO_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` in `.env`.

---

## 3. Deploying (Render / Railway / Vercel)

**Backend (Render or Railway):**
1. Push this repo to GitHub.
2. New Web Service → point at `/backend` as the root directory.
3. Build command: `npm install`. Start command: `npm run seed && npm start`
   (runs the idempotent seed once, then starts the API — seed skips
   anything already inserted, so it's safe to include in every deploy).
4. Add the environment variables from `.env.example` (set a real
   `JWT_SECRET`; add SMTP vars if you want real emails).
5. Note the deployed URL, e.g. `https://your-app.onrender.com`.

**Frontend (Vercel or Render Static Site):**
1. New project → point at `/frontend` as the root directory.
2. Build command: `npm run build`. Output directory: `dist`.
3. Set `VITE_API_URL=https://your-app.onrender.com/api` as an environment
   variable (must be set at build time for Vite).
4. Deploy — you'll get a URL like `https://your-app.vercel.app`.

Note on SQLite + hosting: Render/Railway's free web-service disks are
ephemeral on redeploy. That's fine for a demo/assignment; for a persistent
production database, either use Render's persistent disk add-on or point
`db.js` at a hosted Postgres/MySQL instance instead — the schema in
`schema.sql` is plain SQL and translates directly.

---

## 4. Rate calculation engine (logic explanation)

All numbers below are read live from the database on every request — the
engine (`backend/src/utils/rateEngine.js`) never hardcodes a price. Admins
change rate cards / COD config through the API (and the Admin UI) and the
change applies to the very next quote.

**Step 1 — Zone detection** (`utils/zoneDetection.js`)
Every order supplies a `pickup_area_code` and `drop_area_code` (e.g. a
pincode). Admins map area codes to zones via the `zone_areas` table
(many area codes → one zone). The engine looks up both codes; if either
is unmapped, order creation fails with a clear error asking the admin to
map that area first.

**Step 2 — Volumetric weight**
```
volumetric_weight_kg = (length_cm * breadth_cm * height_cm) / 5000
```
5000 is the standard courier-industry volumetric divisor, defined as a
named constant (`VOLUMETRIC_DIVISOR`) so it's a one-line change if a
different divisor is ever needed.

**Step 3 — Billable weight**
```
billable_weight_kg = max(actual_weight_kg, volumetric_weight_kg)
```

**Step 4 — Rate type**
```
rate_type = 'INTRA' if pickup_zone_id == drop_zone_id else 'INTER'
```

**Step 5 — Rate card lookup**
The engine looks up the single `rate_cards` row matching
`(order_type, rate_type)` — e.g. `(B2C, INTER)`. Each rate card has:
- `base_fee` — flat charge
- `min_weight_kg` — weight already covered by the base fee
- `per_kg_rate` — charge per kg beyond `min_weight_kg`

```
chargeable_extra_weight = max(0, billable_weight_kg - min_weight_kg)
base_charge = base_fee + chargeable_extra_weight * per_kg_rate
```

**Step 6 — COD surcharge**
If `payment_type == 'COD'`, the engine looks up `cod_surcharge_config`
for that `order_type`:
```
cod_surcharge = flat_fee + (percent_of_value / 100) * declared_value
```
Admins can use either a flat fee, a percentage of the declared shipment
value, or both together.

**Step 7 — Total**
```
total_charge = base_charge + cod_surcharge
```

This entire breakdown is returned by `POST /api/orders/quote` **before**
the customer confirms, and the same function is called again (against
whatever the rate cards say *at that moment*) when the order is actually
created via `POST /api/orders`, so the confirmed order always matches
current admin-configured rates.

---

## 5. Auto-assignment logic

`backend/src/utils/assignment.js`:

1. Pull every agent with `role = 'agent'` and `is_available = 1`.
2. Agents whose `zone_id` equals the order's pickup zone are always
   preferred (a large negative score offset guarantees they rank first).
3. Among agents in the same tier, rank by Haversine distance from the
   agent's live `(current_lat, current_lng)` — or their home zone's
   centroid if they haven't reported a live location — to the pickup
   zone's centroid.
4. The best-ranked agent is assigned; if no agent is available anywhere,
   the API returns `409` so the admin can retry later or add capacity.

Admins can bypass this at any time via `POST /orders/:id/assign` with an
explicit `agent_id` for manual assignment.

When an order reaches `DELIVERED` or `FAILED`, the assigned agent is
automatically marked `is_available = 1` again.

---

## 6. Order status lifecycle & immutable history

Status flow: `CREATED → ASSIGNED → PICKED_UP → IN_TRANSIT →
OUT_FOR_DELIVERY → DELIVERED`, with `FAILED` reachable from any
in-progress state and `RESCHEDULED → ASSIGNED` restarting the cycle.

- Agents can only move an order through the *allowed* forward transitions
  for their own assigned order (enforced server-side in
  `orders.routes.js`); anything else returns `400`.
- Admins can override to **any** status at any time (per spec), bypassing
  the transition table.
- Every transition — including the initial `CREATED` — is appended to
  `order_status_history` with `from_status`, `to_status`, `actor_id`,
  `actor_role`, and a timestamp. Rows are **never updated or deleted**,
  so `GET /orders/:id` always returns the full, tamper-evident tracking
  timeline shown to the customer.

## 7. Failed delivery → reschedule flow

1. Agent (or admin) sets status to `FAILED` with a required
   `failure_reason`.
2. The customer is emailed automatically (see Section 4/notification
   list below).
3. Customer calls `POST /orders/:id/reschedule` with a new
   `reschedule_date`. This clears the previous `assigned_agent_id` and
   moves the order to `RESCHEDULED`.
4. Admin re-assigns (manually or via auto-assign) exactly as with a new
   order — `RESCHEDULED` is a valid source state for `POST
   /orders/:id/assign`, which moves it back to `ASSIGNED`.

---

## 8. Database schema

See `backend/src/db/schema.sql` for the authoritative, commented DDL.
Summary of tables:

| Table | Purpose |
|---|---|
| `users` | Single table for customer/agent/admin, discriminated by `role`. Agent-only columns: `zone_id`, `is_available`, `current_lat/lng`. |
| `zones` | Admin-defined delivery zones with an optional centroid (used by auto-assignment distance ranking). |
| `zone_areas` | Maps one area code (pincode/locality) to exactly one zone. |
| `rate_cards` | One row per `(order_type, rate_type)` — `base_fee`, `per_kg_rate`, `min_weight_kg`. |
| `cod_surcharge_config` | One row per `order_type` — `flat_fee`, `percent_of_value`. |
| `orders` | Full order record: addresses, dimensions, computed weights, computed charge breakdown, current `status`, `assigned_agent_id`, reschedule/failure fields. |
| `order_status_history` | Append-only audit trail of every status transition (see Section 6). |
| `notifications` | Log of every email/SMS sent (or mocked), for auditability and for the "notified at every step" requirement to be verifiable. |

---

## 9. API reference

Base URL: `/api`. All endpoints except `/auth/register` and `/auth/login`
require `Authorization: Bearer <token>`.

### Auth
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/auth/register` | public | Customer self-registration |
| POST | `/auth/login` | public | Returns `{ token, user }` |

### Orders
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/orders/quote` | any | Charge preview (no order created) |
| POST | `/orders` | customer, admin | Create order (admin must pass `customer_id`) |
| GET | `/orders` | any | List — own orders (customer), assigned orders (agent), all + `?status=&zone_id=&agent_id=` filters (admin) |
| GET | `/orders/:id` | any (owner-checked) | Order + full tracking timeline |
| POST | `/orders/:id/assign` | admin | Body `{ agent_id? }` — manual if given, else nearest-available auto-assign |
| PATCH | `/orders/:id/status` | agent, admin | Body `{ status, failure_reason?, note? }` — agents restricted to valid forward transitions on their own order; admin can override to anything |
| POST | `/orders/:id/reschedule` | customer, admin | Body `{ reschedule_date }` — only valid from `FAILED` |

### Zones (admin manages; any role can read for order forms)
| Method | Path | Role |
|---|---|---|
| GET | `/zones` | any |
| POST | `/zones` | admin |
| POST | `/zones/:zoneId/areas` | admin |
| DELETE | `/zones/areas/:areaCode` | admin |

### Rate cards
| Method | Path | Role |
|---|---|---|
| GET | `/rate-cards` | any |
| PUT | `/rate-cards` | admin — body `{ order_type, rate_type, base_fee, per_kg_rate, min_weight_kg }` |
| PUT | `/rate-cards/cod-surcharge` | admin — body `{ order_type, flat_fee, percent_of_value }` |

### Agents
| Method | Path | Role |
|---|---|---|
| GET | `/agents` | admin |
| POST | `/agents` | admin — create an agent account |
| PATCH | `/agents/:id/status` | agent (self) or admin — body `{ is_available?, current_lat?, current_lng? }` |
| GET | `/agents/me/orders` | agent |

---

## 10. What's intentionally out of scope

- Payment gateway integration (COD/Prepaid are recorded as a field; no
  actual payment capture, per the assignment's stated scope).
- Live map / GPS tracking UI — agents can report `current_lat/lng` via
  the API (used by auto-assignment), but there's no map widget in the
  frontend.
- Push notifications — email (+ SMS scaffold) only, as specified.
