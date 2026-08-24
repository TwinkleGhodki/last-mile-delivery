const db = require('../db/db');
const { detectZone } = require('./zoneDetection');

const VOLUMETRIC_DIVISOR = 5000; // cm^3 per kg, industry-standard courier divisor

/**
 * Calculates volumetric weight: (L x B x H) / 5000
 */
function calcVolumetricWeight(lengthCm, breadthCm, heightCm) {
  return (lengthCm * breadthCm * heightCm) / VOLUMETRIC_DIVISOR;
}

/**
 * Full rate calculation engine.
 * All numbers (rate cards, COD surcharge) are read live from the DB,
 * so admin changes take effect immediately with no code changes/hardcoding.
 *
 * @returns {object} breakdown + total, or throws Error with a user-facing message
 */
function calculateCharge({
  pickupAreaCode,
  dropAreaCode,
  lengthCm,
  breadthCm,
  heightCm,
  actualWeightKg,
  orderType,     // 'B2B' | 'B2C'
  paymentType,   // 'PREPAID' | 'COD'
  declaredValue = 0,
}) {
  const pickupZone = detectZone(pickupAreaCode);
  const dropZone = detectZone(dropAreaCode);

  if (!pickupZone) throw new Error(`No zone mapped for pickup area code "${pickupAreaCode}"`);
  if (!dropZone) throw new Error(`No zone mapped for drop area code "${dropAreaCode}"`);

  const volumetricWeight = calcVolumetricWeight(lengthCm, breadthCm, heightCm);
  const billableWeight = Math.max(actualWeightKg, volumetricWeight);

  const rateType = pickupZone.id === dropZone.id ? 'INTRA' : 'INTER';

  const rateCard = db.prepare(
    'SELECT * FROM rate_cards WHERE order_type = ? AND rate_type = ?'
  ).get(orderType, rateType);

  if (!rateCard) {
    throw new Error(`No rate card configured for ${orderType} / ${rateType}. Ask admin to configure it.`);
  }

  // billable weight beyond the rate card's included min_weight_kg is charged per kg
  const chargeableExtraWeight = Math.max(0, billableWeight - rateCard.min_weight_kg);
  const baseCharge = round2(rateCard.base_fee + chargeableExtraWeight * rateCard.per_kg_rate);

  let codSurcharge = 0;
  if (paymentType === 'COD') {
    const codConfig = db.prepare('SELECT * FROM cod_surcharge_config WHERE order_type = ?').get(orderType);
    if (codConfig) {
      codSurcharge = round2(codConfig.flat_fee + (codConfig.percent_of_value / 100) * (declaredValue || 0));
    }
  }

  const totalCharge = round2(baseCharge + codSurcharge);

  return {
    pickupZone: { id: pickupZone.id, name: pickupZone.name },
    dropZone: { id: dropZone.id, name: dropZone.name },
    rateType,
    volumetricWeight: round2(volumetricWeight),
    billableWeight: round2(billableWeight),
    rateCard: {
      base_fee: rateCard.base_fee,
      per_kg_rate: rateCard.per_kg_rate,
      min_weight_kg: rateCard.min_weight_kg,
    },
    baseCharge,
    codSurcharge,
    totalCharge,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { calculateCharge, calcVolumetricWeight, VOLUMETRIC_DIVISOR };
