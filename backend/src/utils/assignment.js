const db = require('../db/db');

/**
 * Haversine distance in km between two lat/lng points.
 */
function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Finds the best available agent for a pickup zone.
 *
 * Strategy (in priority order):
 *  1. Available agents whose home zone == pickup zone, ranked by live
 *     distance to the pickup zone's centroid (if the agent has reported
 *     current_lat/current_lng), otherwise treated as distance 0 (they are
 *     "home" in that zone so are preferred).
 *  2. If none are available in the pickup zone, fall back to the nearest
 *     available agent from ANY zone, ranked by distance from the agent's
 *     current location (or their home zone centroid) to the pickup zone
 *     centroid.
 *
 * Returns the agent row (or null if no agent is available at all).
 */
function findNearestAvailableAgent(pickupZoneId) {
  const pickupZone = db.prepare('SELECT * FROM zones WHERE id = ?').get(pickupZoneId);
  if (!pickupZone) return null;

  const availableAgents = db.prepare(`
    SELECT u.*, z.center_lat AS zone_lat, z.center_lng AS zone_lng
    FROM users u
    LEFT JOIN zones z ON z.id = u.zone_id
    WHERE u.role = 'agent' AND u.is_available = 1
  `).all();

  if (availableAgents.length === 0) return null;

  const ranked = availableAgents.map((agent) => {
    const lat = agent.current_lat ?? agent.zone_lat ?? pickupZone.center_lat;
    const lng = agent.current_lng ?? agent.zone_lng ?? pickupZone.center_lng;
    const dist = distanceKm(lat, lng, pickupZone.center_lat, pickupZone.center_lng);
    const sameZoneBonus = agent.zone_id === pickupZoneId ? -1000 : 0; // strongly prefer home-zone agents
    return { agent, score: dist + sameZoneBonus };
  });

  ranked.sort((a, b) => a.score - b.score);
  return ranked[0].agent;
}

module.exports = { findNearestAvailableAgent, distanceKm };
