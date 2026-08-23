import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [error, setError] = useState('');

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await register(form);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    }
  }

  return (
    <div className="card auth-card">
      <h2>Create a customer account</h2>
      <form onSubmit={handleSubmit}>
        <label>Name</label>
        <input value={form.name} onChange={update('name')} required />
        <label>Email</label>
        <input value={form.email} onChange={update('email')} type="email" required />
        <label>Phone</label>
        <input value={form.phone} onChange={update('phone')} />
        <label>Password</label>
        <input value={form.password} onChange={update('password')} type="password" required />
        {error && <p className="error">{error}</p>}
        <button type="submit">Register</button>
      </form>
      <p>Already have an account? <Link to="/login">Login</Link></p>
    </div>
  );
}
