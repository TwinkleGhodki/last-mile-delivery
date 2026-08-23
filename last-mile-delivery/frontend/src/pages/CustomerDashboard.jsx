import { useEffect, useState } from 'react';
import client from '../api/client';
import OrderForm from '../components/OrderForm';
import OrderList from '../components/OrderList';

export default function CustomerDashboard() {
  const [orders, setOrders] = useState([]);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const { data } = await client.get('/orders');
    setOrders(data);
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="page-header">
        <h2>My Orders</h2>
        <button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Close' : '+ New Order'}</button>
      </div>
      {showForm && (
        <OrderForm onCreated={() => { setShowForm(false); load(); }} />
      )}
      <div className="card">
        <OrderList orders={orders} />
      </div>
    </div>
  );
}
