import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { email, password });
      login(res.data.user, res.data.token);
      const role = res.data.user.role;
      if (role === 'rm' || role === 'team_leader') navigate('/rm-dashboard');
      else if (role === 'supervisor') navigate('/supervisor-dashboard');
      else if (role === 'admin') navigate('/import');
      else navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #223872 0%, #34508C 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'white', borderRadius: '12px', padding: '48px',
        width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '32px', fontWeight: '800', color: '#223872', fontFamily: "'Sora', sans-serif" }}>Navia</div>
<div style={{ fontSize: '16px', color: '#ED4D37', marginTop: '4px', fontWeight: '600' }}>ClientIQ Platform</div>
<div style={{ width: '40px', height: '3px', background: '#ED4D37', margin: '12px auto 0' }}></div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              style={{
                width: '100%', padding: '12px 16px', border: '1px solid #ddd',
                borderRadius: '8px', fontSize: '14px', outline: 'none',
                transition: 'border 0.2s', boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              style={{
                width: '100%', padding: '12px 16px', border: '1px solid #ddd',
                borderRadius: '8px', fontSize: '14px', outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#FEE2E2', color: '#DC2626', padding: '12px 16px',
              borderRadius: '8px', fontSize: '13px', marginBottom: '20px'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px', background: loading ? '#B6C0D0' : '#223872',
              color: 'white', border: 'none', borderRadius: '8px',
              fontSize: '15px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: '#999' }}>
          Navia Markets Internal Platform
        </div>
      </div>
    </div>
  );
};

export default Login;