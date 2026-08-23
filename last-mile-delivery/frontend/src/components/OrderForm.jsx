import { useState } from 'react';
import client from '../api/client';

const initialForm = {
  pickup_address: '',
  pickup_area_code: '',
  drop_address: '',
  drop_area_code: '',
  length_cm: '',
  breadth_cm: '',
  height_cm: '',
  actual_weight_kg: '',
  order_type: 'B2C',
  payment_type: 'PREPAID',
  declared_value: '',
};

export default function OrderForm({ onCreated, customerIdField, extraFields }) {
  const [form, setForm] = useState(initialForm);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => {
      setQuote(null);
      setForm({ ...form, [field]: e.target.value });
    };
  }

  async function getQuote() {
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post('/orders/quote', { ...form, ...extraFields });
      setQuote(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not calculate charge');
    } finally {
      setLoading(false);
    }
  }

  async function confirmOrder() {
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post('/orders', { ...form, ...extraFields });
      setForm(initialForm);
      setQuote(null);
      onCreated && onCreated(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create order');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>New Order</h3>
      {customerIdField}
      <div className="grid-2">
        <div>
          <label>Pickup address</label>
          <input value={form.pickup_address} onChange={update('pickup_address')} />
        </div>
        <div>
          <label>Pickup area code (pincode)</label>
          <input value={form.pickup_area_code} onChange={update('pickup_area_code')} placeholder="e.g. 600001" />
        </div>
        <div>
          <label>Drop address</label>
          <input value={form.drop_address} onChange={update('drop_address')} />
        </div>
        <div>
          <label>Drop area code (pincode)</label>
          <input value={form.drop_area_code} onChange={update('drop_area_code')} placeholder="e.g. 600020" />
        </div>
        <div>
          <label>Length (cm)</label>
          <input type="number" value={form.length_cm} onChange={update('length_cm')} />
        </div>
        <div>
          <label>Breadth (cm)</label>
          <input type="number" value={form.breadth_cm} onChange={update('breadth_cm')} />
        </div>
        <div>
          <label>Height (cm)</label>
          <input type="number" value={form.height_cm} onChange={update('height_cm')} />
        </div>
        <div>
          <label>Actual weight (kg)</label>
          <input type="number" value={form.actual_weight_kg} onChange={update('actual_weight_kg')} />
        </div>
        <div>
          <label>Order type</label>
          <select value={form.order_type} onChange={update('order_type')}>
            <option value="B2C">B2C</option>
            <option value="B2B">B2B</option>
          </select>
        </div>
        <div>
          <label>Payment type</label>
          <select value={form.payment_type} onChange={update('payment_type')}>
            <option value="PREPAID">Prepaid</option>
            <option value="COD">COD</option>
          </select>
        </div>
        {form.payment_type === 'COD' && (
          <div>
            <label>Declared value (Rs.) — for COD surcharge</label>
            <input type="number" value={form.declared_value} onChange={update('declared_value')} />
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="actions">
        <button onClick={getQuote} disabled={loading}>Get Charge Preview</button>
        {quote && (
          <button className="primary" onClick={confirmOrder} disabled={loading}>
            Confirm Order — Rs.{quote.totalCharge}
          </button>
        )}
      </div>

      {quote && (
        <div className="quote-box">
          <p><strong>Pickup zone:</strong> {quote.pickupZone.name} &nbsp; <strong>Drop zone:</strong> {quote.dropZone.name} ({quote.rateType})</p>
          <p><strong>Volumetric weight:</strong> {quote.volumetricWeight} kg &nbsp; <strong>Billable weight:</strong> {quote.billableWeight} kg</p>
          <p><strong>Base charge:</strong> Rs.{quote.baseCharge} &nbsp; <strong>COD surcharge:</strong> Rs.{quote.codSurcharge}</p>
          <p className="total"><strong>Total charge:</strong> Rs.{quote.totalCharge}</p>
        </div>
      )}
    </div>
  );
}
