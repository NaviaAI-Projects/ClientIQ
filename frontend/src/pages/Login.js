import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const Login = () => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const { login }    = useAuth();
  const navigate     = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email: email.trim(), password });
      login(res.data.user, res.data.token);
      const role = res.data.user?.role;
      if (role === 'admin')                              navigate('/import');
      else if (role === 'supervisor')                    navigate('/supervisor-dashboard');
      else if (role === 'rm' || role === 'team_leader') navigate('/rm-dashboard');
      else                                               navigate('/rm-dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight:     '100vh',
      background:    'linear-gradient(135deg, #0F1E40 0%, #1B3F7A 50%, #0F2650 100%)',
      display:       'flex',
      alignItems:    'center',
      justifyContent:'center',
      fontFamily:    "'Inter', -apple-system, system-ui, sans-serif",
      position:      'relative',
      overflow:      'hidden',
    }}>

      {/* Background pattern */}
      <div style={{
        position:   'absolute', inset: 0, opacity: 0.04,
        backgroundImage: `radial-gradient(circle at 25% 25%, white 1px, transparent 1px),
                          radial-gradient(circle at 75% 75%, white 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
      }} />

      {/* Glow effects */}
      <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'rgba(59,130,246,0.12)', filter: 'blur(80px)' }} />
      <div style={{ position: 'absolute', bottom: '-20%', left: '-10%', width: '400px', height: '400px', borderRadius: '50%', background: 'rgba(232,57,29,0.08)', filter: 'blur(80px)' }} />

      {/* Login card */}
      <div style={{
        width:        '420px',
        background:   'rgba(255,255,255,0.97)',
        borderRadius: '20px',
        boxShadow:    '0 25px 60px rgba(0,0,0,0.35), 0 5px 15px rgba(0,0,0,0.2)',
        overflow:     'hidden',
        position:     'relative',
        zIndex:       10,
      }}>

        {/* Card header */}
        <div style={{
          background:  'linear-gradient(135deg, #1B3F7A 0%, #2B5BA8 100%)',
          padding:     '32px 36px 28px',
          position:    'relative',
          overflow:    'hidden',
        }}>
          {/* Subtle pattern in header */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.06,
            backgroundImage: 'radial-gradient(circle at 80% 20%, white 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }} />

          <div style={{ position: 'relative' }}>
            {/* Navia logo mark */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', fontWeight: '800', color: 'white',
                fontFamily: "'Manrope', system-ui, sans-serif",
              }}>N</div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: '800', color: 'white', fontFamily: "'Manrope', system-ui, sans-serif", letterSpacing: '-0.3px' }}>
                  Navia ClientIQ
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '1px' }}>
                  Strategic MIS Platform
                </div>
              </div>
            </div>

            <div style={{ fontSize: '22px', fontWeight: '700', color: 'white', fontFamily: "'Manrope', system-ui, sans-serif", letterSpacing: '-0.4px', marginBottom: '6px' }}>
              Welcome back
            </div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)' }}>
              Sign in to access your dashboard
            </div>
          </div>
        </div>

        {/* Accent bar */}
        <div style={{ height: '3px', background: 'linear-gradient(90deg, #E8391D, #F97316, #3B82F6)' }} />

        {/* Form */}
        <div style={{ padding: '32px 36px 36px' }}>
          {error && (
            <div style={{
              background:   '#FEF2F2',
              border:       '1px solid #FECACA',
              borderRadius: '10px',
              padding:      '10px 14px',
              marginBottom: '20px',
              fontSize:     '13px',
              color:        '#B91C1C',
              display:      'flex',
              alignItems:   'center',
              gap:          '8px',
            }}>
              <span style={{ fontSize: '14px' }}>⚠</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display:     'block',
                fontSize:    '11px',
                fontWeight:  '600',
                color:       '#4A5568',
                marginBottom:'5px',
                textTransform:'uppercase',
                letterSpacing:'0.5px',
              }}>
                Email address
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#94A3B8' }}>✉</span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@navia.co.in"
                  required
                  autoFocus
                  style={{
                    width:        '100%',
                    padding:      '11px 12px 11px 36px',
                    border:       '1px solid #E2E8F0',
                    borderRadius: '10px',
                    fontSize:     '13.5px',
                    fontFamily:   'inherit',
                    color:        '#0F1723',
                    background:   '#F8FAFC',
                    outline:      'none',
                    transition:   'all 0.15s',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#1B5FA5'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 3px rgba(27,95,165,0.1)'; }}
                  onBlur={e  => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#F8FAFC'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display:     'block',
                fontSize:    '11px',
                fontWeight:  '600',
                color:       '#4A5568',
                marginBottom:'5px',
                textTransform:'uppercase',
                letterSpacing:'0.5px',
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#94A3B8' }}>⊙</span>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  style={{
                    width:        '100%',
                    padding:      '11px 40px 11px 36px',
                    border:       '1px solid #E2E8F0',
                    borderRadius: '10px',
                    fontSize:     '13.5px',
                    fontFamily:   'inherit',
                    color:        '#0F1723',
                    background:   '#F8FAFC',
                    outline:      'none',
                    transition:   'all 0.15s',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#1B5FA5'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 3px rgba(27,95,165,0.1)'; }}
                  onBlur={e  => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#F8FAFC'; e.target.style.boxShadow = 'none'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '13px', color: '#94A3B8', padding: '0',
                  }}
                >
                  {showPwd ? '◎' : '○'}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width:        '100%',
                padding:      '13px',
                background:   loading ? '#94A3B8' : 'linear-gradient(135deg, #1B3F7A 0%, #2B5BA8 100%)',
                color:        'white',
                border:       'none',
                borderRadius: '10px',
                fontSize:     '14px',
                fontWeight:   '600',
                fontFamily:   'inherit',
                cursor:       loading ? 'not-allowed' : 'pointer',
                transition:   'all 0.15s',
                boxShadow:    loading ? 'none' : '0 4px 14px rgba(27,63,122,0.35)',
                letterSpacing: '0.1px',
              }}
              onMouseEnter={e => { if (!loading) e.target.style.boxShadow = '0 6px 20px rgba(27,63,122,0.45)'; }}
              onMouseLeave={e => { if (!loading) e.target.style.boxShadow = '0 4px 14px rgba(27,63,122,0.35)'; }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Signing in...
                </span>
              ) : 'Sign in →'}
            </button>
          </form>

          {/* Footer note */}
          <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '11px', color: '#94A3B8', lineHeight: 1.6 }}>
            Access is restricted to authorised Navia Markets personnel.<br />
            Contact your administrator if you need access.
          </div>
        </div>
      </div>

      {/* Bottom brand bar */}
      <div style={{
        position:   'absolute', bottom: '24px', left: 0, right: 0,
        textAlign:  'center',
        fontSize:   '11px',
        color:      'rgba(255,255,255,0.25)',
        zIndex:     10,
      }}>
        Navia Markets Ltd. · SEBI Registered Stock Broker · NSE | BSE | MCX Member
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=Inter:wght@400;500;600&display=swap');
      `}</style>
    </div>
  );
};

export default Login;