import { useEffect, useState } from 'react';
import client from '../api/client';
import OrderList from '../components/OrderList';
import { useAuth } from '../context/AuthContext';

export default function AgentDashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [available, setAvailable] = useState(true);

  async function load() {
    const { data } = await client.get('/orders');
    setOrders(data);
  }

  useEffect(() => { load(); }, []);

  async function toggleAvailability() {
    const next = !available;
    await client.patch(`/agents/${user.id}/status`, { is_available: next });
    setAvailable(next);
  }

  return (
    <div>
      <div className="page-header">
        <h2>My Deliveries</h2>
        <button onClick={toggleAvailability}>
          {available ? 'Go offline' : 'Go available'}
        </button>
      </div>
      <div className="card">
        <OrderList orders={orders} />
      </div>
    </div>
  );
}
