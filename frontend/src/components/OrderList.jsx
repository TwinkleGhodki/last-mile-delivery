import { Link } from 'react-router-dom';

const STATUS_COLORS = {
  CREATED: '#94a3b8',
  ASSIGNED: '#3b82f6',
  PICKED_UP: '#8b5cf6',
  IN_TRANSIT: '#f59e0b',
  OUT_FOR_DELIVERY: '#f97316',
  DELIVERED: '#22c55e',
  FAILED: '#ef4444',
  RESCHEDULED: '#eab308',
};

export default function OrderList({ orders }) {
  if (!orders || orders.length === 0) return <p className="hint">No orders yet.</p>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>ID</th><th>Route</th><th>Type</th><th>Payment</th><th>Charge</th><th>Status</th><th></th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id}>
            <td>{o.id.slice(0, 8)}</td>
            <td>{o.pickup_area_code} → {o.drop_area_code}</td>
            <td>{o.order_type}</td>
            <td>{o.payment_type}</td>
            <td>Rs.{o.total_charge}</td>
            <td><span className="badge" style={{ background: STATUS_COLORS[o.status] }}>{o.status.replace('_', ' ')}</span></td>
            <td><Link to={`/orders/${o.id}`}>View</Link></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
