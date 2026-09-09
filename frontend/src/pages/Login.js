import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import OtpInput from '../components/OtpInput';

const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 10 * 60;   // must match backend OTP_TTL_MIN
const RESEND_COOLDOWN = 30;        // seconds before "Resend" is allowed again

const BRAND = '#223872';
const ACCENT = '#ED4D37';

const inputStyle = {
  width: '100%', padding: '12px 16px', border: '1px solid #ddd',
  borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  transition: 'border-color .15s, box-shadow .15s',
};

// Mask an email for display: p****n@navia.co.in
const maskEmail = (email) => {
  if (!email || !email.includes('@')) return email || '';
  const [name, domain] = email.split('@');
  const shown = name.length <= 2 ? name[0] || '' : name[0] + '*'.repeat(Math.max(1, name.length - 2)) + name[name.length - 1];
  return `${shown}@${domain}`;
};

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const Login = () => {
  const [step, setStep] = useState('credentials');   // 'credentials' | 'otp'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [expiresIn, setExpiresIn] = useState(0);      // seconds left on the code
  const [cooldown, setCooldown] = useState(0);        // seconds left before resend allowed
  const lastSubmitted = useRef('');                   // guards auto-submit loops
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Green banner shown when we arrive here right after a successful password reset.
  // Read from router state AND sessionStorage (set by ForgotPassword) so it survives
  // even if router state is lost; read once on mount so a browser autofill event
  // firing on the email field can't wipe it.
  const [resetOk, setResetOk] = useState(false);
  useEffect(() => {
    let flagged = !!location.state?.resetSuccess;
    try { if (sessionStorage.getItem('pwResetSuccess') === '1') flagged = true; } catch (e) {}
    if (flagged) {
      setResetOk(true);
      try { sessionStorage.removeItem('pwResetSuccess'); } catch (e) {}
      try { window.history.replaceState({}, ''); } catch (e) {}   // don't persist on refresh
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const routeFor = (user) => {
    const role = user?.role;
    if (role === 'rm' || role === 'team_leader') return '/rm-dashboard';
    if (role === 'supervisor') return '/supervisor-dashboard';
    if (role === 'admin') {
      // A dual admin+supervisor who last used the Supervisor view lands there, so the
      // page matches the remembered toggle instead of always opening the admin import.
      let dual = false;
      try {
        const p = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
        dual = !!(p && p.dual_supervisor);
      } catch (e) {}
      let vm = null;
      try { vm = localStorage.getItem('viewMode'); } catch (e) {}
      return (dual && vm === 'supervisor') ? '/supervisor-dashboard' : '/import';
    }
    return '/login';
  };

  // ── countdown timers ──────────────────────────────────────────
  useEffect(() => {
    if (step !== 'otp') return;
    const t = setInterval(() => {
      setExpiresIn((s) => (s > 0 ? s - 1 : 0));
      setCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [step]);

  const startOtpTimers = () => { setExpiresIn(OTP_TTL_SECONDS); setCooldown(RESEND_COOLDOWN); };

  // ── Step 1 — submit credentials, receive OTP ──────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true); setError(''); setInfo('');
    const cleanEmail = email.trim().toLowerCase();
    try {
      const res = await api.post('/auth/login', { email: cleanEmail, password });
      if (res.data.otpRequired) {
        setOtpDigits(Array(OTP_LENGTH).fill(''));
        lastSubmitted.current = '';
        setStep('otp');
        startOtpTimers();
        setInfo(res.data.message || `A ${OTP_LENGTH}-digit code was sent to ${cleanEmail}.`);
        if (res.data.devOtp) {
          const d = String(res.data.devOtp).slice(0, OTP_LENGTH).split('');
          setOtpDigits(Array.from({ length: OTP_LENGTH }, (_, i) => d[i] || ''));
          lastSubmitted.current = res.data.devOtp;   // don't auto-submit dev prefill
        }
      } else if (res.data.token) {
        login(res.data.user, res.data.token);
        navigate(routeFor(res.data.user));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2 — verify OTP, receive token ────────────────────────
  const doVerify = useCallback(async (code) => {
    if (loading) return;
    setLoading(true); setError(''); setInfo('');
    try {
      const res = await api.post('/auth/verify-otp', { email: email.trim().toLowerCase(), otp: code });
      login(res.data.user, res.data.token);
      navigate(routeFor(res.data.user));
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed. Please try again.');
      setOtpDigits(Array(OTP_LENGTH).fill(''));   // clear so they can retype cleanly
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, loading, login, navigate]);

  const handleVerify = (e) => {
    if (e) e.preventDefault();
    const code = otpDigits.join('');
    if (code.length < OTP_LENGTH) { setError('Please enter the full 6-digit code.'); return; }
    lastSubmitted.current = code;
    doVerify(code);
  };

  // Auto-submit as soon as all six digits are entered (manual entry only).
  useEffect(() => {
    const code = otpDigits.join('');
    if (step === 'otp' && code.length === OTP_LENGTH && !loading && code !== lastSubmitted.current) {
      lastSubmitted.current = code;
      doVerify(code);
    }
  }, [otpDigits, step, loading, doVerify]);

  const handleResend = async () => {
    if (resending || cooldown > 0) return;
    setResending(true); setError(''); setInfo('');
    try {
      const res = await api.post('/auth/resend-otp', { email: email.trim().toLowerCase() });
      setInfo(res.data.message || 'A new code has been sent.');
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      lastSubmitted.current = '';
      startOtpTimers();
      if (res.data.devOtp) {
        const d = String(res.data.devOtp).slice(0, OTP_LENGTH).split('');
        setOtpDigits(Array.from({ length: OTP_LENGTH }, (_, i) => d[i] || ''));
        lastSubmitted.current = res.data.devOtp;
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not resend the code.');
    } finally {
      setResending(false);
    }
  };

  const backToLogin = () => {
    setStep('credentials'); setOtpDigits(Array(OTP_LENGTH).fill(''));
    setError(''); setInfo(''); lastSubmitted.current = '';
  };

  const codeComplete = otpDigits.every((d) => d !== '');
  const expired = step === 'otp' && expiresIn === 0;

  return (
    <div style={{
      minHeight: '100vh', background: `linear-gradient(135deg, ${BRAND} 0%, #34508C 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div style={{
        background: 'white', borderRadius: '14px', padding: '44px 40px',
        width: '100%', maxWidth: '430px', boxShadow: '0 24px 70px rgba(0,0,0,0.32)'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{ fontSize: '32px', fontWeight: 800, color: BRAND, fontFamily: "'Sora', sans-serif" }}>Navia</div>
          <div style={{ fontSize: '16px', color: ACCENT, marginTop: '4px', fontWeight: 600 }}>ClientIQ Platform</div>
          <div style={{ width: '40px', height: '3px', background: ACCENT, margin: '12px auto 0' }} />
        </div>

        {step === 'credentials' && (
          <form onSubmit={handleLogin}>
            {resetOk && (
              <div style={{
                background: '#E7F6EC', color: '#187A3E', border: '1px solid #B7E4C7',
                padding: '11px 15px', borderRadius: '8px', fontSize: '13px', marginBottom: '18px',
                textAlign: 'center', fontWeight: 600,
              }}>
                ✓ Password changed successfully. Please sign in.
              </div>
            )}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Email Address</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com" required autoFocus autoComplete="username"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = BRAND)}
                onBlur={(e) => (e.target.style.borderColor = '#ddd')}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password" required autoComplete="current-password"
                  style={{ ...inputStyle, paddingRight: '70px' }}
                  onFocus={(e) => (e.target.style.borderColor = BRAND)}
                  onBlur={(e) => (e.target.style.borderColor = '#ddd')}
                />
                <button type="button" onClick={() => setShowPwd((s) => !s)} tabIndex={-1}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px',
                    fontWeight: 600, color: BRAND, padding: '4px 6px',
                  }}>
                  {showPwd ? '🙈 Hide' : '👁 Show'}
                </button>
              </div>
            </div>

            <div style={{ textAlign: 'right', marginBottom: '18px', marginTop: '-8px' }}>
              <Link to="/forgot-password" style={{ fontSize: '12px', color: BRAND, fontWeight: 600, textDecoration: 'none' }}>
                Forgot password?
              </Link>
            </div>

            {error && <Alert kind="error">{error}</Alert>}

            <SubmitButton loading={loading}>{loading ? 'Signing in…' : 'Sign In'}</SubmitButton>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerify}>
            <div style={{ textAlign: 'center', marginBottom: '6px', fontSize: '18px', fontWeight: 700, color: BRAND }}>
              Verify it's you
            </div>
            <div style={{ marginBottom: '22px', fontSize: '13px', color: '#667085', textAlign: 'center', lineHeight: 1.55 }}>
              Enter the 6-digit code we sent to<br /><strong style={{ color: '#344054' }}>{maskEmail(email.trim().toLowerCase())}</strong>
            </div>

            <OtpInput
              digits={otpDigits} setDigits={setOtpDigits}
              onEnterComplete={() => handleVerify()} disabled={loading} brand={BRAND}
            />

            <div style={{ textAlign: 'center', margin: '14px 0 18px', fontSize: '12px', color: expired ? ACCENT : '#98a2b3' }}>
              {expired ? 'Code expired — request a new one.' : <>Code expires in <strong>{fmtTime(expiresIn)}</strong></>}
            </div>

            {info && <Alert kind="info">{info}</Alert>}
            {error && <Alert kind="error">{error}</Alert>}

            <SubmitButton loading={loading} disabled={!codeComplete || expired}>
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </SubmitButton>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '18px', fontSize: '12px' }}>
              <button type="button" onClick={backToLogin}
                style={linkBtn('#667085')}>← Back</button>
              <button type="button" onClick={handleResend} disabled={resending || cooldown > 0}
                style={linkBtn(BRAND, resending || cooldown > 0)}>
                {resending ? 'Resending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '26px', fontSize: '12px', color: '#b0b7c3' }}>
          Navia Markets Internal Platform
        </div>
      </div>
    </div>
  );
};

const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#555', marginBottom: '6px' };

const linkBtn = (color, disabled = false) => ({
  background: 'none', border: 'none', color, fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: '12px',
  opacity: disabled ? 0.55 : 1, padding: 0,
});

const Alert = ({ kind, children }) => (
  <div style={{
    background: kind === 'error' ? '#FEE2E2' : '#E6F1FB',
    color: kind === 'error' ? '#DC2626' : '#1B3F7A',
    padding: '11px 15px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px',
    lineHeight: 1.45, textAlign: 'center',
  }}>
    {children}
  </div>
);

const SubmitButton = ({ loading, disabled, children }) => {
  const off = loading || disabled;
  return (
    <button type="submit" disabled={off} style={{
      width: '100%', padding: '14px', background: off ? '#B6C0D0' : BRAND,
      color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px',
      fontWeight: 600, cursor: off ? 'not-allowed' : 'pointer', transition: 'background .15s',
    }}>
      {children}
    </button>
  );
};

export default Login;
