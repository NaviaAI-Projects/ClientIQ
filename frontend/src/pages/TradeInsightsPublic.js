import React, { useEffect, useState } from 'react';
import TradeInsights from './TradeInsights';
import api from '../api';

// ── Theme tokens + fonts for the whole Trade Insights page ──────────────
// Scoped to `.ti-shell`: overriding the app's --bg/--tx/--tx2/--tx3/--br/--br2
// here means every inline `var(--…)` inside TradeInsights re-themes automatically,
// so light↔dark flips the entire page without touching hundreds of inline styles.
const THEME_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap');
.ti-shell{
  --ti-page:#eef2f8; --ti-surface:#ffffff;
  --bg:#ffffff; --tx:#0f1b2d; --tx2:#48566b; --tx3:#8a97ad;
  --br:rgba(15,27,45,.08); --br2:rgba(15,27,45,.05);
  font-family:'Inter',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  transition:background .3s ease,color .3s ease;
}
.ti-shell[data-ti-theme="dark"]{
  --ti-page:#0a1120; --ti-surface:#101a2e;
  --bg:#121e33; --tx:#e9eef7; --tx2:#a8b4c8; --tx3:#6f7d95;
  --br:rgba(255,255,255,.09); --br2:rgba(255,255,255,.05);
}
.ti-themebtn{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--br);
  background:var(--ti-page);border-radius:20px;padding:5px 6px 5px 12px;cursor:pointer;
  font-family:inherit;font-size:11.5px;font-weight:600;color:var(--tx2);transition:.2s}
.ti-themebtn:hover{border-color:#1b3f7a}
.ti-themebtn .knob{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;
  background:var(--ti-surface);box-shadow:0 1px 4px rgba(0,0,0,.15);font-size:13px}
`;

const TradeInsightsPublic = () => {
  const params  = new URLSearchParams(window.location.search);
  const ucc     = params.get('ucc');
  const token   = params.get('token');
  const jsucc   = params.get('jsucc');   // encrypted SSO link — UCC is inside the token

  const [client,  setClient]  = useState(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(true);

  // Light/dark theme — persisted per viewer in localStorage so a client's choice sticks.
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('ti-theme') || 'light'; } catch { return 'light'; }
  });
  useEffect(() => { try { localStorage.setItem('ti-theme', theme); } catch {} }, [theme]);
  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  useEffect(() => {
    if (!ucc && !jsucc) {
      setError('Missing UCC. Please reopen from your trading platform.');
      setLoading(false);
      return;
    }

    const done = (res) => { setClient(res.data); setLoading(false); };
    const fail = (err, msg) => { setError(err.response?.data?.message || msg); setLoading(false); };

    if (jsucc) {
      // Encrypted SSO link — decrypt the UCC server-side and load its insights.
      api.post('/trade-insights/sso', { jsucc }).then(done).catch(e => fail(e, 'Access denied.'));
    } else if (token) {
      // Opened from trading app — public POST endpoint with a signed token.
      api.post('/trade-insights/public', { ucc, token }).then(done).catch(e => fail(e, 'Access denied.'));
    } else {
      // Opened from within ClientIQ — authenticated GET endpoint.
      api.get(`/trade-insights/${ucc}`).then(done).catch(e => fail(e, 'Failed to load trade insights.'));
    }
  }, []); // eslint-disable-line

  const centered = (children) => (
    <div className="ti-shell" data-ti-theme={theme} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', flexDirection: 'column', gap: '14px',
      background: 'var(--ti-page)', color: 'var(--tx)'
    }}>
      <style>{THEME_CSS}</style>
      {children}
    </div>
  );

  if (loading) return centered(<>
    <div style={{ fontSize: '32px' }}>📊</div>
    <div style={{ fontSize: '15px', color: 'var(--tx2)', fontWeight: '600' }}>Loading your trade insights…</div>
    <div style={{ fontSize: '12px', color: 'var(--tx3)' }}>Analysing {ucc ? `account ${ucc}` : 'your account'}</div>
  </>);

  if (error) return centered(<>
    <div style={{ fontSize: '32px' }}>⚠️</div>
    <div style={{ fontSize: '15px', color: '#e0475e', fontWeight: '600', maxWidth: '420px', textAlign: 'center', lineHeight: 1.6 }}>{error}</div>
    <div style={{ fontSize: '12px', color: 'var(--tx3)' }}>If this keeps happening, contact support.</div>
  </>);

  return (
    <div className="ti-shell" data-ti-theme={theme} style={{ background: 'var(--ti-page)', minHeight: '100vh', color: 'var(--tx)' }}>
      <style>{THEME_CSS}</style>

      {/* Topbar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--ti-surface)', borderBottom: '1px solid var(--br)',
        padding: '11px 22px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(10,18,38,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
          <span style={{ fontSize: '16px', fontWeight: '800', color: '#3d8bf0', fontFamily: "'Sora', sans-serif", letterSpacing: '-0.5px' }}>
            Navia ClientIQ
          </span>
          <span style={{ fontSize: '9px', padding: '2px 8px', fontWeight: '700', background: 'rgba(61,139,240,.12)', color: '#3d8bf0', borderRadius: '20px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Trade Insights
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Theme toggle */}
          <button className="ti-themebtn" onClick={toggleTheme} title="Switch theme">
            {theme === 'dark' ? 'Dark' : 'Light'}
            <span className="knob">{theme === 'dark' ? '🌙' : '☀️'}</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <div style={{ fontSize: '11px', color: 'var(--tx3)', fontFamily: "'Sora', monospace" }}>{ucc || client?.ucc}</div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--tx)' }}>{client?.client_name || ''}</div>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#12b886', flexShrink: 0 }} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 22px 52px' }}>
        <TradeInsights
          ucc={ucc || client?.ucc}
          clientName={client?.client_name}
          token={token || null}
          jsucc={jsucc || null}
        />
      </div>

      {/* Footer */}
      <div style={{
        padding: '18px 22px', textAlign: 'center', fontSize: '11px',
        color: 'var(--tx3)', borderTop: '1px solid var(--br)',
        background: 'var(--ti-surface)', marginTop: '18px', lineHeight: 1.7
      }}>
        This is a statistical summary of your own trading activity. It is not investment advice.<br />
        Past performance does not guarantee future results.<br />
        Navia Markets Ltd. is a SEBI-registered stockbroker. SEBI Reg. No. INZ000041331.
      </div>
    </div>
  );
};

export default TradeInsightsPublic;
