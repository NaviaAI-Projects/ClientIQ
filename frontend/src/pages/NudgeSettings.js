import React, { useState, useEffect } from 'react';
import api from '../api';

const NudgeSettings = () => {
  const [nudges, setNudges] = useState([
    { key: 'nudge_strike_type',       label: 'Strike type performance',      example: 'Your last 14 Far OTM NIFTY CE trades: 38% win rate, avg loss ₹2,100. Your ATM trades: 64% win rate.', min_trades: 10, enabled: 'On' },
    { key: 'nudge_consec_loss',       label: 'Consecutive loss today',       example: "You've had 3 losing trades today. Win rate on 4th+ trades after losses is 41% vs your normal 58%.", min_trades: 15, enabled: 'On' },
    { key: 'nudge_overtrading',       label: 'Overtrading signal',           example: "You've placed 9 trades today — days with 8+ trades show lower P&L in your trading history.", min_trades: 20, enabled: 'On' },
    { key: 'nudge_expiry_underperf',  label: 'Expiry day underperformance',  example: 'Your expiry-day win rate is 51% vs 62% on non-expiry days across 60 days of history.', min_trades: 8, enabled: 'On' },
    { key: 'nudge_oversized_pos',     label: 'Oversized position',           example: 'This lot size is 2× your usual position. Larger trades: 44% win rate vs 61% for standard.', min_trades: 12, enabled: 'On' },
    { key: 'nudge_instrument_underperf', label: 'Instrument underperformance', example: 'Your last 20 FINNIFTY CE trades: 40% win rate, net P&L –₹14,800. NIFTY CE: 63% win rate.', min_trades: 10, enabled: 'On' },
  ]);
  const [apiSettings, setApiSettings] = useState({ compute_time: '02:00', atm_band: '1', far_otm: '3', consent_text: 'Navia may show you data-based observations from your own trading history during order placement. These are statistical summaries of your past trades, not investment advice. You can turn this off in Settings at any time.' });
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    api.get('/admin-settings').then(res => {
      const s = res.data.data || {};
      setNudges(prev => prev.map(n => ({
        ...n,
        min_trades: s[n.key + '_min'] || n.min_trades,
        enabled: s[n.key + '_enabled'] || n.enabled
      })));
      if (s.nudge_compute_time) setApiSettings(prev => ({ ...prev, compute_time: s.nudge_compute_time, atm_band: s.nudge_atm_band || '1', far_otm: s.nudge_far_otm || '3', consent_text: s.nudge_consent_text || prev.consent_text }));
    }).catch(console.error);
  }, []);

  const updateNudge = (index, field, value) => {
    const updated = [...nudges];
    updated[index][field] = value;
    setNudges(updated);
  };

  const saveNudges = async () => {
    try {
      const payload = {};
      nudges.forEach(n => {
        payload[n.key + '_min'] = n.min_trades;
        payload[n.key + '_enabled'] = n.enabled;
      });
      payload.nudge_compute_time = apiSettings.compute_time;
      payload.nudge_atm_band = apiSettings.atm_band;
      payload.nudge_far_otm = apiSettings.far_otm;
      payload.nudge_consent_text = apiSettings.consent_text;
      await api.put('/admin-settings', payload);
      setSaveMsg('Nudge settings saved successfully');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch { setSaveMsg('Save failed'); }
  };

  const th = { textAlign: 'left', padding: '8px 12px', fontSize: '10px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '0.5px solid rgba(0,0,0,0.1)' };
  const td = { padding: '12px', borderBottom: '0.5px solid rgba(0,0,0,0.05)', fontSize: '13px', verticalAlign: 'top' };
  const inputStyle = { padding: '6px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '5px', fontSize: '12.5px', width: '100%', boxSizing: 'border-box' };

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>Nudge Settings</h2>
      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Configure live order-placement nudges based on client trade history insights</p>

      <div style={{ background: '#e8f3ff', padding: '10px 14px', borderRadius: '8px', color: '#185fa5', fontSize: '12.5px', margin: '14px 0' }}>
        <strong>What nudges are:</strong> When a client places an order, the system checks their 90-day trade history and surfaces a personalised data observation — e.g. "Your last 14 Far OTM NIFTY CE trades had a 38% win rate." These are statistical summaries of the client's own data, not investment advice. Client opt-in consent is required.
      </div>

      {saveMsg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px',
          background: saveMsg.includes('failed') ? '#fcebeb' : '#eaf3de',
          color: saveMsg.includes('failed') ? '#a32d2d' : '#3b6d11' }}>
          {saveMsg}
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '10px', padding: '20px', border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: '14px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '14px' }}>Nudge Types — Enable / Disable</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={th}>Nudge Trigger</th>
              <th style={th}>Example Message Shown to Client</th>
              <th style={th}>Min Sample (trades)</th>
              <th style={th}>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {nudges.map((n, i) => (
              <tr key={n.key}>
                <td style={{ ...td, fontWeight: '600', width: '180px' }}>{n.label}</td>
                <td style={{ ...td, color: '#555', fontSize: '12px' }}>{n.example}</td>
                <td style={{ ...td, width: '120px' }}>
                  <input type="number" value={n.min_trades} onChange={e => updateNudge(i, 'min_trades', e.target.value)}
                    style={{ ...inputStyle, width: '70px' }} />
                </td>
                <td style={{ ...td, width: '90px' }}>
                  <select value={n.enabled} onChange={e => updateNudge(i, 'enabled', e.target.value)} style={{ ...inputStyle, width: '80px' }}>
                    <option>On</option>
                    <option>Off</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: '14px' }}>
          <button onClick={saveNudges} style={{ padding: '8px 16px', background: '#223872', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }}>
            Save Nudge Settings
          </button>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '10px', padding: '20px', border: '0.5px solid rgba(0,0,0,0.1)' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '14px' }}>Nudge API & OMS Integration</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#555', marginBottom: '3px', textTransform: 'uppercase' }}>Nightly Profile Compute Time</label>
            <input type="time" value={apiSettings.compute_time} onChange={e => setApiSettings({ ...apiSettings, compute_time: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#555', marginBottom: '3px', textTransform: 'uppercase' }}>Nudge API Endpoint (read-only)</label>
            <input readOnly value="https://clientiq.navia.in/api/nudge" style={{ ...inputStyle, background: '#f5f4f0', fontFamily: 'monospace' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#555', marginBottom: '3px', textTransform: 'uppercase' }}>ATM Band (% from underlying)</label>
            <input type="number" step="0.5" value={apiSettings.atm_band} onChange={e => setApiSettings({ ...apiSettings, atm_band: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#555', marginBottom: '3px', textTransform: 'uppercase' }}>Far OTM Threshold (%)</label>
            <input type="number" step="0.5" value={apiSettings.far_otm} onChange={e => setApiSettings({ ...apiSettings, far_otm: e.target.value })} style={inputStyle} />
          </div>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#555', marginBottom: '3px', textTransform: 'uppercase' }}>Client Opt-in Consent Text</label>
          <textarea value={apiSettings.consent_text} onChange={e => setApiSettings({ ...apiSettings, consent_text: e.target.value })}
            style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} />
        </div>
        <button onClick={saveNudges} style={{ padding: '8px 16px', background: '#223872', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', marginRight: '8px' }}>Save</button>
        <button onClick={() => alert('Testing nudge API endpoint...')} style={{ padding: '8px 16px', background: 'white', color: '#223872', border: '0.5px solid #223872', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }}>Test API Endpoint</button>
      </div>
    </div>
  );
};

export default NudgeSettings;