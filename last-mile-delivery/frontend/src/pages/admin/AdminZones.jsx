import { useEffect, useState } from 'react';
import client from '../../api/client';

export default function AdminZones() {
  const [zones, setZones] = useState([]);
  const [newZone, setNewZone] = useState({ name: '', center_lat: '', center_lng: '' });
  const [areaForm, setAreaForm] = useState({});

  async function load() {
    const { data } = await client.get('/zones');
    setZones(data);
  }
  useEffect(() => { load(); }, []);

  async function createZone(e) {
    e.preventDefault();
    await client.post('/zones', newZone);
    setNewZone({ name: '', center_lat: '', center_lng: '' });
    load();
  }

  async function addArea(zoneId) {
    const val = areaForm[zoneId];
    if (!val?.area_code) return;
    await client.post(`/zones/${zoneId}/areas`, val);
    setAreaForm({ ...areaForm, [zoneId]: { area_code: '', label: '' } });
    load();
  }

  async function removeArea(areaCode) {
    await client.delete(`/zones/areas/${areaCode}`);
    load();
  }

  return (
    <div>
      <h2>Zones &amp; Area Mapping</h2>

      <form className="card grid-3" onSubmit={createZone}>
        <div>
          <label>Zone name</label>
          <input value={newZone.name} onChange={(e) => setNewZone({ ...newZone, name: e.target.value })} required />
        </div>
        <div>
          <label>Center lat (optional)</label>
          <input value={newZone.center_lat} onChange={(e) => setNewZone({ ...newZone, center_lat: e.target.value })} />
        </div>
        <div>
          <label>Center lng (optional)</label>
          <input value={newZone.center_lng} onChange={(e) => setNewZone({ ...newZone, center_lng: e.target.value })} />
        </div>
        <button type="submit">Add zone</button>
      </form>

      {zones.map((z) => (
        <div className="card" key={z.id}>
          <h3>{z.name}</h3>
          <table className="table">
            <thead><tr><th>Area code</th><th>Label</th><th></th></tr></thead>
            <tbody>
              {z.areas.map((a) => (
                <tr key={a.id}>
                  <td>{a.area_code}</td>
                  <td>{a.label}</td>
                  <td><button className="danger" onClick={() => removeArea(a.area_code)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="actions">
            <input placeholder="Area code (pincode)" value={areaForm[z.id]?.area_code || ''}
              onChange={(e) => setAreaForm({ ...areaForm, [z.id]: { ...areaForm[z.id], area_code: e.target.value } })} />
            <input placeholder="Label (optional)" value={areaForm[z.id]?.label || ''}
              onChange={(e) => setAreaForm({ ...areaForm, [z.id]: { ...areaForm[z.id], label: e.target.value } })} />
            <button onClick={() => addArea(z.id)}>Map area to this zone</button>
          </div>
        </div>
      ))}
    </div>
  );
}
