import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import AdminOrders from './admin/AdminOrders';
import AdminZones from './admin/AdminZones';
import AdminRateCards from './admin/AdminRateCards';
import AdminAgents from './admin/AdminAgents';

export default function AdminDashboard() {
  return (
    <div>
      <div className="tabs">
        <NavLink to="/" end>Orders</NavLink>
        <NavLink to="/zones">Zones</NavLink>
        <NavLink to="/rate-cards">Rate Cards</NavLink>
        <NavLink to="/agents">Agents</NavLink>
      </div>
      <Routes>
        <Route path="/" element={<AdminOrders />} />
        <Route path="/zones" element={<AdminZones />} />
        <Route path="/rate-cards" element={<AdminRateCards />} />
        <Route path="/agents" element={<AdminAgents />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
