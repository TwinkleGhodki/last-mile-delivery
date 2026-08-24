import { useEffect, useState } from 'react';
import client from '../../api/client';

const COMBOS = [
  { order_type: 'B2C', rate_type: 'INTRA' },
  { order_type: 'B2C', rate_type: 'INTER' },
  { order_type: 'B2B', rate_type: 'INTRA' },
  { order_type: 'B2B', rate_type: 'INTER' },
];

export default function AdminRateCards() {
  const [rateCards, setRateCards] = useState([]);
  const [codConfig, setCodConfig] = useState([]);
  const [edits, setEdits] = useState({});
  const [codEdits, setCodEdits] = useState({});

  async function load() {
    const { data } = await client.get('/rate-cards');
    setRateCards(data.rateCards);
    setCodConfig(data.codConfig);
  }
  useEffect(() => { load(); }, []);

  function cardFor(order_type, rate_type) {
    return rateCards.find((r) => r.order_type === order_type && r.rate_type === rate_type);
  }

  function fieldValue(order_type, rate_type, field) {
    const key = `${order_type}-${rate_type}`;
    if (edits[key]?.[field] !== undefined) return edits[key][field];
    const card = cardFor(order_type, rate_type);
    return card ? card[field] : '';
  }

  function setField(order_type, rate_type, field, value) {
    const key = `${order_type}-${rate_type}`;
    setEdits({ ...edits, [key]: { ...edits[key], [field]: value } });
  }

  async function saveCard(order_type, rate_type) {
    await client.put('/rate-cards', {
      order_type, rate_type,
      base_fee: Number(fieldValue(order_type, rate_type, 'base_fee') || 0),
      per_kg_rate: Number(fieldValue(order_type, rate_type, 'per_kg_rate') || 0),
      min_weight_kg: Number(fieldValue(order_type, rate_type, 'min_weight_kg') || 0),
    });
    load();
  }

  function codValue(order_type, field) {
    if (codEdits[order_type]?.[field] !== undefined) return codEdits[order_type][field];
    const c = codConfig.find((x) => x.order_type === order_type);
    return c ? c[field] : '';
  }
  function setCodField(order_type, field, value) {
    setCodEdits({ ...codEdits, [order_type]: { ...codEdits[order_type], [field]: value } });
  }
  async function saveCod(order_type) {
    await client.put('/rate-cards/cod-surcharge', {
      order_type,
      flat_fee: Number(codValue(order_type, 'flat_fee') || 0),
      percent_of_value: Number(codValue(order_type, 'percent_of_value') || 0),
    });
    load();
  }

  return (
    <div>
      <h2>Rate Cards</h2>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Order type</th><th>Rate type</th><th>Base fee (Rs.)</th><th>Per kg rate (Rs.)</th><th>Min weight included (kg)</th><th></th></tr>
          </thead>
          <tbody>
            {COMBOS.map(({ order_type, rate_type }) => (
              <tr key={`${order_type}-${rate_type}`}>
                <td>{order_type}</td>
                <td>{rate_type}</td>
                <td><input type="number" value={fieldValue(order_type, rate_type, 'base_fee')} onChange={(e) => setField(order_type, rate_type, 'base_fee', e.target.value)} /></td>
                <td><input type="number" value={fieldValue(order_type, rate_type, 'per_kg_rate')} onChange={(e) => setField(order_type, rate_type, 'per_kg_rate', e.target.value)} /></td>
                <td><input type="number" value={fieldValue(order_type, rate_type, 'min_weight_kg')} onChange={(e) => setField(order_type, rate_type, 'min_weight_kg', e.target.value)} /></td>
                <td><button onClick={() => saveCard(order_type, rate_type)}>Save</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>COD Surcharge Config</h2>
      <div className="card">
        <table className="table">
          <thead><tr><th>Order type</th><th>Flat fee (Rs.)</th><th>% of declared value</th><th></th></tr></thead>
          <tbody>
            {['B2C', 'B2B'].map((order_type) => (
              <tr key={order_type}>
                <td>{order_type}</td>
                <td><input type="number" value={codValue(order_type, 'flat_fee')} onChange={(e) => setCodField(order_type, 'flat_fee', e.target.value)} /></td>
                <td><input type="number" value={codValue(order_type, 'percent_of_value')} onChange={(e) => setCodField(order_type, 'percent_of_value', e.target.value)} /></td>
                <td><button onClick={() => saveCod(order_type)}>Save</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
