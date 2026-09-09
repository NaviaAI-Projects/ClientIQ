import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import OtpInput from '../components/OtpInput';

const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 10 * 60;
const RESEND_COOLDOWN = 30;
const MIN_PW = 8;

const BRAND = '#223872';
const ACCENT = '#ED4D37';

const inputStyle = {
  width: '100%', padding: '12px 16px', border: '1px solid #ddd',
  borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  transition: 'border-color .15s',
};
const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#555', marginBottom: '6px' };

const maskEmail = (email) => {
  if (!email || !email.includes('@')) return email || '';
  const [name, domain] = email.split('@');
  const shown = name.length <= 2 ? name[0] || '' : name[0] + '*'.repeat(Math.max(1, name.length - 2)) + name[name.length - 1];
  return `${shown}@${domain}`;
};
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const ForgotPassword = () => {
  const [phase, setPhase] = useState('form');   // 'form' | 'otp'
  const [email, setEmail] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [expiresIn, setExpiresIn] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const lastSubmitted = useRef('');
  const navigate = useNavigate();

  // countdown timers (only while on the OTP phase)
  useEffect(() => {
    if (phase !== 'otp') return;
    const t = setInterval(() => {
      setExpiresIn((s) => (s > 0 ? s - 1 : 0));
      setCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  const startTimers = () => { setExpiresIn(OTP_TTL_SECONDS); setCooldown(RESEND_COOLDOWN); };

  const cleanEmail = email.trim().toLowerCase();
  const pwLongEnough = newPwd.length >= MIN_PW;
  const pwMatch = confirmPwd.length > 0 && newPwd === confirmPwd;
  const formReady = cleanEmail.includes('@') && pwLongEnough && pwMatch;

  const applyDevOtp = (devOtp) => {
    const d = String(devOtp).slice(0, OTP_LENGTH).split('');
    setOtpDigits(Array.from({ length: OTP_LENGTH }, (_, i) => d[i] || ''));
    lastSubmitted.current = devOtp;   // don't auto-submit a prefilled dev code
  };

  // Step 1 → send the reset code to the account email, then reveal the OTP field.
  const sendCode = async (e) => {
    if (e) e.preventDefault();
    if (loading || !formReady) return;
    setLoading(true); setError(''); setInfo('');
    try {
      const res = await api.post('/auth/forgot-password', { email: cleanEmail });
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      lastSubmitted.current = '';
      setPhase('otp');
      startTimers();
      setInfo(res.data.message || `A ${OTP_LENGTH}-digit code was sent to ${cleanEmail}.`);
      if (res.data.devOtp) applyDevOtp(res.data.devOtp);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send the verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 → verify the code and change the password.
  const doReset = useCallback(async (code) => {
    if (loading) return;
    setLoading(true); setError(''); setInfo('');
    try {
      await api.post('/auth/reset-password', { email: cleanEmail, otp: code, new_password: newPwd });
      // Flag success via sessionStorage too — survives even if router state is dropped.
      try { sessionStorage.setItem('pwResetSuccess', '1'); } catch (e) {}
      navigate('/login', { state: { resetSuccess: true } });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reset the password. Please try again.');
      setOtpDigits(Array(OTP_LENGTH).fill(''));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanEmail, newPwd, loading, navigate]);

  const handleVerify = (e) => {
    if (e) e.preventDefault();
    const code = otpDigits.join('');
    if (code.length < OTP_LENGTH) { setError('Please enter the full 6-digit code.'); return; }
    lastSubmitted.current = code;
    doReset(code);
  };

  // auto-submit once all six digits are filled (manual entry)
  useEffect(() => {
    const code = otpDigits.join('');
    if (phase === 'otp' && code.length === OTP_LENGTH && !loading && code !== lastSubmitted.current) {
      lastSubmitted.current = code;
      doReset(code);
    }
  }, [otpDigits, phase, loading, doReset]);

  const handleResend = async () => {
    if (resending || cooldown > 0) return;
    setResending(true); setError(''); setInfo('');
    try {
      const res = await api.post('/auth/forgot-password', { email: cleanEmail });
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      lastSubmitted.current = '';
      startTimers();
      setInfo(res.data.message || 'A new code has been sent.');
      if (res.data.devOtp) applyDevOtp(res.data.devOtp);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not resend the code.');
    } finally {
      setResending(false);
    }
  };

  const codeComplete = otpDigits.every((d) => d !== '');
  const expired = phase === 'otp' && expiresIn === 0;

  return (
    <div style={{
      minHeight: '100vh', background: `linear-gradient(135deg, ${BRAND} 0%, #34508C 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div style={{
        background: 'white', borderRadius: '14px', padding: '44px 40px',
        width: '100%', maxWidth: '430px', boxShadow: '0 24px 70px rgba(0,0,0,0.32)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '26px' }}>
          <div style={{ fontSize: '32px', fontWeight: 800, color: BRAND, fontFamily: "'Sora', sans-serif" }}>Navia</div>
          <div style={{ fontSize: '16px', color: ACCENT, marginTop: '4px', fontWeight: 600 }}>Reset your password</div>
          <div style={{ width: '40px', height: '3px', background: ACCENT, margin: '12px auto 0' }} />
        </div>

        {phase === 'form' && (
          <form onSubmit={sendCode}>
            <div style={{ marginBottom: '18px' }}>
              <label style={labelStyle}>Email Address</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com" required autoFocus autoComplete="username"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = BRAND)}
                onBlur={(e) => (e.target.style.borderColor = '#ddd')}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'} value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="At least 8 characters" required autoComplete="new-password"
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
              {newPwd.length > 0 && !pwLongEnough &&
                <div style={hintStyle('#B54708')}>Password must be at least {MIN_PW} characters.</div>}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Confirm New Password</label>
              <input
                type={showPwd ? 'text' : 'password'} value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="Re-enter new password" required autoComplete="new-password"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = BRAND)}
                onBlur={(e) => (e.target.style.borderColor = '#ddd')}
              />
              {confirmPwd.length > 0 && !pwMatch &&
                <div style={hintStyle('#B42318')}>Passwords do not match.</div>}
              {pwMatch && pwLongEnough &&
                <div style={hintStyle('#187A3E')}>✓ Passwords match.</div>}
            </div>

            {error && <Alert kind="error">{error}</Alert>}

            <SubmitButton loading={loading} disabled={!formReady}>
              {loading ? 'Sending code…' : 'Send verification code'}
            </SubmitButton>

            <div style={{ textAlign: 'center', marginTop: '18px', fontSize: '12px' }}>
              <Link to="/login" style={{ color: '#667085', fontWeight: 600, textDecoration: 'none' }}>← Back to sign in</Link>
            </div>
          </form>
        )}

        {phase === 'otp' && (
          <form onSubmit={handleVerify}>
            <div style={{ marginBottom: '22px', fontSize: '13px', color: '#667085', textAlign: 'center', lineHeight: 1.55 }}>
              Enter the 6-digit code we sent to<br /><strong style={{ color: '#344054' }}>{maskEmail(cleanEmail)}</strong><br />
              to confirm your new password.
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
              {loading ? 'Changing password…' : 'Verify & change password'}
            </SubmitButton>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '18px', fontSize: '12px' }}>
              <button type="button" onClick={() => { setPhase('form'); setError(''); setInfo(''); }}
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

const hintStyle = (color) => ({ fontSize: '12px', color, marginTop: '6px', fontWeight: 600 });

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

export default ForgotPassword;
