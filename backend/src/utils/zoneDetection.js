const db = require('../db/db');

/**
 * Detects the zone for a given area code (pincode/locality code).
 * Looks up zone_areas mapping table (admin-configured, no hardcoding).
 * Returns the zone row, or null if the area is not mapped to any zone.
 */
function detectZone(areaCode) {
  if (!areaCode) return null;
  const row = db.prepare(`
    SELECT z.* FROM zone_areas za
    JOIN zones z ON z.id = za.zone_id
    WHERE za.area_code = ?
  `).get(areaCode.trim());
  return row || null;
}

module.exports = { detectZone };
