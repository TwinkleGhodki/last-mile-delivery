import { useEffect, useState } from 'react';
import client from '../../api/client';
import OrderList from '../../components/OrderList';
import OrderForm from '../../components/OrderForm';

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [zones, setZones] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filters, setFilters] = useState({ status: '', zone_id: '', agent_id: '' });
  const [showForm, setShowForm] = useState(false);
  const [customerId, setCustomerId] = useState('');

  async function load() {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    const { data } = await client.get('/orders', { params });
    setOrders(data);
  }

  async function loadMeta() {
    const [z, a] = await Promise.all([client.get('/zones'), client.get('/agents')]);
    setZones(z.data);
    setAgents(a.data);
  }

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { load(); }, [filters]);

  return (
    <div>
      <div className="page-header">
        <h2>All Orders</h2>
        <button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Close' : '+ Create order on behalf of customer'}</button>
      </div>

      {showForm && (
        <OrderForm
          extraFields={{ customer_id: customerId }}
          customerIdField={
            <div>
              <label>Customer ID (existing customer)</label>
              <input value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="customer user id" />
              <p className="hint">Look up the customer's ID from the Customers admin list / registration response.</p>
            </div>
          }
          onCreated={() => { setShowForm(false); load(); }}
        />
      )}

      <div className="card filters">
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          {['CREATED','ASSIGNED','PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','FAILED','RESCHEDULED'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={filters.zone_id} onChange={(e) => setFilters({ ...filters, zone_id: e.target.value })}>
          <option value="">All zones</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
        <select value={filters.agent_id} onChange={(e) => setFilters({ ...filters, agent_id: e.target.value })}>
          <option value="">All agents</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div className="card">
        <OrderList orders={orders} />
      </div>
    </div>
  );
}
