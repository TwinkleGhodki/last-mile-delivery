import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const AGENT_NEXT_STATUS = {
  ASSIGNED: ['PICKED_UP', 'FAILED'],
  PICKED_UP: ['IN_TRANSIT', 'FAILED'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'FAILED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
};

const ALL_STATUSES = ['CREATED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RESCHEDULED'];

export default function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [failureReason, setFailureReason] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [overrideStatus, setOverrideStatus] = useState('');

  async function load() {
    const { data } = await client.get(`/orders/${id}`);
    setOrder(data);
  }

  useEffect(() => { load(); }, [id]);

  async function updateStatus(status) {
    setError('');
    try {
      const body = { status };
      if (status === 'FAILED') {
        if (!failureReason) { setError('Please enter a failure reason'); return; }
        body.failure_reason = failureReason;
      }
      await client.patch(`/orders/${id}/status`, body);
      setFailureReason('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed');
    }
  }

  async function reschedule() {
    setError('');
    if (!rescheduleDate) { setError('Pick a date'); return; }
    try {
      await client.post(`/orders/${id}/reschedule`, { reschedule_date: rescheduleDate });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Reschedule failed');
    }
  }

  async function autoAssign() {
    try {
      await client.post(`/orders/${id}/assign`, {});
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Assignment failed');
    }
  }

  if (!order) return <p>Loading…</p>;

  const canAgentUpdate = user.role === 'agent' && order.assigned_agent_id === user.id;
  const nextStatuses = AGENT_NEXT_STATUS[order.status] || [];

  return (
    <div>
      <Link to="/">&larr; Back</Link>
      <div className="card">
        <div className="page-header">
          <h2>Order {order.id.slice(0, 8)}</h2>
          <span className="badge">{order.status.replace('_', ' ')}</span>
        </div>
        <div className="grid-2">
          <p><strong>Pickup:</strong> {order.pickup_address} ({order.pickup_area_code})</p>
          <p><strong>Drop:</strong> {order.drop_address} ({order.drop_area_code})</p>
          <p><strong>Type:</strong> {order.order_type} / {order.rate_type}</p>
          <p><strong>Payment:</strong> {order.payment_type}</p>
          <p><strong>Billable weight:</strong> {order.billable_weight_kg} kg</p>
          <p><strong>Total charge:</strong> Rs.{order.total_charge}</p>
          {order.reschedule_date && <p><strong>Rescheduled for:</strong> {order.reschedule_date}</p>}
          {order.failure_reason && <p><strong>Failure reason:</strong> {order.failure_reason}</p>}
        </div>

        {error && <p className="error">{error}</p>}

        {(order.status === 'CREATED' || order.status === 'RESCHEDULED') && user.role === 'admin' && (
          <div className="actions">
            <button onClick={autoAssign}>Auto-assign nearest agent</button>
          </div>
        )}

        {canAgentUpdate && nextStatuses.length > 0 && (
          <div className="actions">
            {nextStatuses.filter((s) => s !== 'FAILED').map((s) => (
              <button key={s} onClick={() => updateStatus(s)}>{s.replace('_', ' ')}</button>
            ))}
            {nextStatuses.includes('FAILED') && (
              <div className="fail-box">
                <input placeholder="Failure reason" value={failureReason} onChange={(e) => setFailureReason(e.target.value)} />
                <button className="danger" onClick={() => updateStatus('FAILED')}>Mark Failed</button>
              </div>
            )}
          </div>
        )}

        {user.role === 'customer' && order.status === 'FAILED' && (
          <div className="actions">
            <input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
            <button onClick={reschedule}>Reschedule delivery</button>
          </div>
        )}
        {user.role === 'admin' && order.status === 'FAILED' && (
          <div className="actions">
            <input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
            <button onClick={reschedule}>Reschedule (on behalf of customer)</button>
          </div>
        )}

        {user.role === 'admin' && (
          <div className="actions">
            <select value={overrideStatus} onChange={(e) => setOverrideStatus(e.target.value)}>
              <option value="">-- override status --</option>
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => overrideStatus && updateStatus(overrideStatus)}>Override</button>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Tracking timeline</h3>
        <ul className="timeline">
          {order.timeline.map((t) => (
            <li key={t.id}>
              <strong>{t.to_status.replace('_', ' ')}</strong>
              <span> — {t.created_at} by {t.actor_name || 'system'} ({t.actor_role || 'system'})</span>
              {t.note && <div className="note">{t.note}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
