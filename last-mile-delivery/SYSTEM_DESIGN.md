# System Design — Last-Mile Delivery Tracker

## Rate Calculation Engine

The engine (`utils/rateEngine.js`) is a pure function chain that reads
every configurable number from the database at request time — nothing is
hardcoded, so an admin changing a rate card affects the very next quote
with no deploy.

Given pickup/drop area codes, dimensions, actual weight, order type, and
payment type, it runs six steps: (1) resolve both area codes to zones,
(2) compute `volumetric_weight = L*B*H / 5000`, (3) take
`billable_weight = max(actual, volumetric)`, (4) classify the shipment as
`INTRA` (same zone) or `INTER` (different zones), (5) look up the single
`rate_cards` row for `(order_type, rate_type)` and compute
`base_charge = base_fee + max(0, billable_weight - min_weight_kg) * per_kg_rate`,
and (6) if payment is COD, add
`cod_surcharge = flat_fee + percent_of_value% * declared_value` from
`cod_surcharge_config`. The same function backs both `POST
/orders/quote` (a pure preview, no side effects) and `POST /orders`
(the confirmed order), so what the customer sees before confirming is
guaranteed to match what gets billed — there's no separate "estimate"
code path that can drift from the "actual" one. Keeping rate cards keyed
by `(order_type, rate_type)` rather than a single flat table means B2B
and B2C, and intra/inter, are fully independent and can be tuned without
touching code.

## Zone Detection Approach

Zones are admin-defined records with an optional lat/lng centroid; areas
(pincodes or locality codes) are mapped many-to-one into a zone via a
separate `zone_areas` table. This indirection is deliberate: real
delivery networks redraw zone boundaries far more often than they
redefine what a "zone" fundamentally is, so area-to-zone reassignment is
a data change (`POST /zones/:id/areas`), not a code or schema change. At
order time, the engine looks up `pickup_area_code` and `drop_area_code`
independently against `zone_areas`; if either is unmapped, order
creation fails fast with a message telling the admin exactly which code
needs mapping, rather than silently guessing a zone or defaulting to a
possibly-wrong rate. Comparing the resolved zone IDs (not the raw area
codes) determines INTRA vs INTER, so two different pincodes that happen
to fall in the same admin-defined zone are correctly billed as intra-zone.

## Auto-Assignment Logic

Agent availability is modelled directly on the `users` table for agent
rows: `is_available` (boolean), `zone_id` (home/base zone), and optional
live `current_lat/current_lng`. This keeps the model simple — no separate
"agent state machine" table — while still supporting both a pure
zone-based fallback (most agents, most of the time) and live-location
refinement when an agent's app reports GPS.

`findNearestAvailableAgent(pickupZoneId)` first filters to agents with
`is_available = 1`, then ranks them: agents whose home `zone_id` matches
the order's pickup zone get a large negative score offset so they always
sort first (a delivery agent based in the destination zone should almost
always beat someone geographically closer but based elsewhere, since
they know the area and are already positioned for zone-local pickups).
Within that tier, Haversine distance from the agent's live location (or
their zone centroid, if no live location has been reported) to the
pickup zone's centroid breaks ties. If no agent is available anywhere,
the endpoint returns `409 Conflict` so the admin sees the gap immediately
rather than an order silently sitting unassigned. Manual assignment
(`POST /orders/:id/assign` with an explicit `agent_id`) is always
available as an override, and either path marks the agent unavailable
immediately to prevent a race where two orders get assigned to the same
agent before the first is picked up.

## Failed Delivery Handling

`FAILED` is reachable as a transition from any in-progress state
(`ASSIGNED` through `OUT_FOR_DELIVERY`) and requires a `failure_reason`
in the same request — the API rejects a `FAILED` update with no reason,
so the audit trail never has an unexplained failure. The status change
triggers the same notification pipeline as every other transition,
telling the customer the attempt failed and that they can reschedule.
`POST /orders/:id/reschedule` is only valid from `FAILED`; it clears
`assigned_agent_id` and moves the order to `RESCHEDULED` with the new
date. Because `RESCHEDULED` is a valid source state for
`/orders/:id/assign` (both manual and auto), the reschedule flow reuses
the exact same assignment logic as a brand-new order rather than a
special-cased "re-assign" code path — the second attempt gets a fresh
nearest-available-agent lookup, since the original agent may no longer
be free or may not be the best choice for the new date. Every step of
this flow — the failure, the reschedule, and the re-assignment — is
logged as its own row in the immutable `order_status_history` table, so
the full story of a failed-then-recovered delivery is visible in the
customer's tracking timeline exactly as it happened.
