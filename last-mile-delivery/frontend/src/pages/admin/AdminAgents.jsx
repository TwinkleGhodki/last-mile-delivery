import { useEffect, useState } from 'react';
import client from '../../api/client';

export default function AdminAgents() {
  const [agents, setAgents] = useState([]);
  const [zones, setZones] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', zone_id: '' });
  const [error, setError] = useState('');

  async function load() {
    const [a, z] = await Promise.all([client.get('/agents'), client.get('/zones')]);
    setAgents(a.data);
    setZones(z.data);
  }
  useEffect(() => { load(); }, []);

  async function createAgent(e) {
    e.preventDefault();
    setError('');
    try {
      await client.post('/agents', form);
      setForm({ name: '', email: '', password: '', phone: '', zone_id: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create agent');
    }
  }

  return (
    <div>
      <h2>Delivery Agents</h2>
      <form className="card grid-3" onSubmit={createAgent}>
        <div><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
        <div><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
        <div><label>Password</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
        <div><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div>
          <label>Home zone</label>
          <select value={form.zone_id} onChange={(e) => setForm({ ...form, zone_id: e.target.value })}>
            <option value="">-- none --</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
        <button type="submit">Add agent</button>
        {error && <p className="error">{error}</p>}
      </form>

      <div className="card">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Zone</th><th>Available</th></tr></thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{a.email}</td>
                <td>{a.zone_name || '—'}</td>
                <td>{a.is_available ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
