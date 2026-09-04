import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';

// Client-facing opt-in / consent page. Opened from the "Confirm My RM" email link
// (/optin/:token). The token (which carries the UCC + RM) is validated server-side;
// the client then explicitly Confirms or Declines — nothing is decided automatically.
const OptinLanding = () => {
  const { token: pathToken } = useParams();
  // Token comes from the URL path (/optin/:token); fall back to ?token= for safety.
  const token = pathToken || new URLSearchParams(window.location.search).get('token');

  const [phase, setPhase]     = useState('loading');   // loading | ready | working | done | declined | error
  const [info, setInfo]       = useState(null);        // { client_name, rm_name, rm_phone }
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setPhase('error');
      setMessage('This opt-in link is invalid. Please contact your Relationship Manager.');
      return;
    }
    api.get('/leads/optin', { params: { token } })
      .then(res => {
        setInfo(res.data);
        const st = res.data.status;
        // If the client has already responded, don't ask again — show the outcome.
        if (st === 'opted_in' || st === 'mapped') {
          setPhase('done');
          setMessage('You have already provided your consent. Your Relationship Manager will be in touch with you shortly.');
        } else if (st === 'declined') {
          setPhase('declined');
          setMessage('You have already declined this assignment. No Relationship Manager will be assigned. Thank you for letting us know.');
        } else {
          setPhase('ready');
        }
      })
      .catch(err => {
        setPhase('error');
        setMessage(err.response?.data?.message || 'This link has expired or is invalid. Please contact your Relationship Manager.');
      });
  }, [token]);

  const respond = async (action) => {
    setPhase('working');
    try {
      const res = await api.post('/leads/optin/confirm', { token, action });
      if (action === 'decline' || res.data?.action === 'declined') {
        setPhase('declined');
        setMessage('You have chosen not to proceed. No Relationship Manager will be assigned. Thank you for letting us know.');
      } else {
        setPhase('done');
        setMessage('Thank you — your Relationship Manager has been confirmed. They will be in touch with you shortly.');
      }
    } catch (err) {
      setPhase('error');
      setMessage(err.response?.data?.message || 'Something went wrong. Please contact your Relationship Manager.');
    }
  };

  const wrap = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: '#eef2f8', padding: '20px',
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  };
  const card = {
    background: '#fff', borderRadius: '16px', padding: '38px 32px', maxWidth: '460px',
    width: '100%', textAlign: 'center', boxShadow: '0 8px 30px rgba(16,24,40,0.10)',
  };
  const btnPrimary = {
    display: 'block', width: '100%', padding: '13px', border: 'none', borderRadius: '10px',
    background: '#1b3f7a', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit', marginBottom: '10px',
  };
  const btnGhost = {
    display: 'block', width: '100%', padding: '12px', borderRadius: '10px',
    background: 'transparent', color: '#64708a', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit', border: '1px solid #d6deea',
  };
  const foot = { marginTop: '22px', fontSize: '11px', color: '#9aa3b2', lineHeight: 1.6 };

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ fontSize: '17px', fontWeight: 800, color: '#1b3f7a', marginBottom: '18px', letterSpacing: '-0.3px' }}>
          Navia Markets
        </div>

        {phase === 'loading' && <p style={{ color: '#64708a' }}>Loading…</p>}

        {phase === 'ready' && info && (
          <>
            <div style={{ fontSize: '40px', marginBottom: '14px' }}>🤝</div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '10px', color: '#1b2b45' }}>
              Confirm your Relationship Manager
            </h2>
            <p style={{ color: '#516079', lineHeight: 1.7, fontSize: '14px' }}>
              Dear {info.client_name || 'Client'},<br />
              <strong style={{ color: '#1b3f7a' }}>{info.rm_name}</strong> from Navia Markets would like to be your
              dedicated Relationship Manager{info.rm_phone ? ` (${info.rm_phone})` : ''}.
            </p>
            <p style={{ color: '#516079', lineHeight: 1.7, fontSize: '14px', margin: '10px 0 22px' }}>
              Do you consent to this assignment?
            </p>
            <button style={btnPrimary} onClick={() => respond('confirm')}>✓ Yes, confirm {info.rm_name}</button>
            <button style={btnGhost} onClick={() => respond('decline')}>No, decline</button>
          </>
        )}

        {phase === 'working' && <p style={{ color: '#64708a' }}>Please wait…</p>}

        {phase === 'done' && (
          <>
            <div style={{ fontSize: '48px', marginBottom: '14px' }}>✅</div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#1a7f4b' }}>Confirmed</h2>
            <p style={{ color: '#516079', lineHeight: 1.7, fontSize: '14px' }}>{message}</p>
          </>
        )}

        {phase === 'declined' && (
          <>
            <div style={{ fontSize: '48px', marginBottom: '14px' }}>👍</div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#516079' }}>Noted</h2>
            <p style={{ color: '#516079', lineHeight: 1.7, fontSize: '14px' }}>{message}</p>
          </>
        )}

        {phase === 'error' && (
          <>
            <div style={{ fontSize: '48px', marginBottom: '14px' }}>⚠️</div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#c0392b' }}>Link invalid</h2>
            <p style={{ color: '#516079', lineHeight: 1.7, fontSize: '14px' }}>{message}</p>
          </>
        )}

        <div style={foot}>Navia Markets Ltd. · SEBI Reg. No. INZ000041331</div>
      </div>
    </div>
  );
};

export default OptinLanding;