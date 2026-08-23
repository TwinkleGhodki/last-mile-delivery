import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className="navbar">
      <Link to="/" className="brand">📦 Delivery Tracker</Link>
      <div className="nav-links">
        {user && user.role === 'customer' && <Link to="/">My Orders</Link>}
        {user && user.role === 'agent' && <Link to="/">My Deliveries</Link>}
        {user && user.role === 'admin' && <Link to="/">Admin Console</Link>}
        {user ? (
          <>
            <span className="user-chip">{user.name} ({user.role})</span>
            <button onClick={handleLogout}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}
