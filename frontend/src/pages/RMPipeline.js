import React, { useState, useEffect } from 'react';
import api from '../api';

const RMPipeline = () => {
  const [rms, setRms]         = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState('');
  const [msg, setMsg]         = useState('');

  const [capacity, setCapacity] = useState({
    rm_capacity_limit:   100,
    lead_expiry_window:  30,
    reassign_on_expiry:  true,
    max_reassign_count:  3,
    lead_score_threshold: 20,
    fd_rate:             6.5
  });

  const [optin, setOptin] = useState({
    optin_base_url:    'https://clientiq.navia.in/optin/',
    token_expiry_days: 7,
    remind_after_days: 3
  });

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [rmRes, settingsRes] = await Promise.all([
        api.get('/rm/list'),
        api.get('/admin-settings/pipeline?_t=' + Date.now())
      ]);
      setRms(rmRes.data || []);
      const s = settingsRes.data?.data || {};
      console.log('Pipeline settings loaded:', s);
      setCapacity({
        rm_capacity_limit:    s.rm_capacity_limit    || 100,
        lead_expiry_window:   s.lead_expiry_window   || 30,
        reassign_on_expiry:   s.reassign_on_expiry !== false,
        max_reassign_count:   s.max_reassign_count   || 3,
        lead_score_threshold: s.lead_score_threshold || 20,
        fd_rate:              parseFloat(s.fd_rate)  || 6.5
      });
      setOptin({
        optin_base_url:    s.optin_base_url    || 'https://clientiq.navia.in/optin/',
        token_expiry_days: s.token_expiry_days || 7,
        remind_after_days: s.remind_after_days || 3
      });
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const saveSection = async (section, data) => {
    setSaving(section); setMsg('');
    try {
      await api.put('/admin-settings/pipeline', { ...capacity, ...optin, ...data });
      setMsg(section + '_success');
      loadAll();
    } catch { setMsg(section + '_error'); }
    setSaving('');
  };

  const inp = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '100%', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: '11px', fontWeight: '600', color: '#666', marginBottom: '4px' };
  const panel = { background: 'white', borderRadius: '12px', border: '1px solid #eee', padding: '20px', marginBottom: '16px' };
  const btn = (s) => ({ padding: '8px 20px', background: saving === s ? '#94a3b8' : '#223872', color: 'white', border: 'none', borderRadius: '6px', cursor: saving === s ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' });

  const showMsg = (key) => msg === key + '_success'
    ? <span style={{ color: '#3b6d11', fontSize: '12px', marginLeft: '10px' }}>✓ Saved</span>
    : msg === key + '_error'
    ? <span style={{ color: '#a32d2d', fontSize: '12px', marginLeft: '10px' }}>✗ Failed</span>
    : null;

  const th = { padding: '10px 14px', fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', borderBottom: '1px solid #eee', background: '#fafafa', textAlign: 'left' };
  const td = { padding: '12px 14px', fontSize: '13px', borderBottom: '1px solid #f5f5f5' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#111', margin: 0 }}>RM & Pipeline Settings</h2>
      <p style={{ fontSize: '13px', color: '#777', marginTop: '4px', marginBottom: '20px' }}>
        Global configuration for RM operations, opt-in flow, and lead pipeline
      </p>

      {/* Round-robin & Capacity */}
      <div style={panel}>
        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>⚙️ Round-robin & Capacity</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
          <div>
            <label style={lbl}>Default RM Capacity (clients)</label>
            <input type="number" value={capacity.rm_capacity_limit}
              onChange={e => setCapacity({ ...capacity, rm_capacity_limit: Number(e.target.value) })} style={inp} />
          </div>
          <div>
            <label style={lbl}>Lead Expiry Period (days)</label>
            <input type="number" value={capacity.lead_expiry_window}
              onChange={e => setCapacity({ ...capacity, lead_expiry_window: Number(e.target.value) })} style={inp} />
          </div>
          <div>
            <label style={lbl}>Max Reassign Count Before Pool</label>
            <input type="number" value={capacity.max_reassign_count}
              onChange={e => setCapacity({ ...capacity, max_reassign_count: Number(e.target.value) })} style={inp} />
          </div>
          <div>
            <label style={lbl}>Lead Score Threshold</label>
            <input type="number" value={capacity.lead_score_threshold}
              onChange={e => setCapacity({ ...capacity, lead_score_threshold: Number(e.target.value) })} style={inp} />
          </div>
          <div>
            <label style={lbl}>FD Rate (%)</label>
            <input type="number" step="0.1" value={capacity.fd_rate}
              onChange={e => setCapacity({ ...capacity, fd_rate: Number(e.target.value) })} style={inp} />
          </div>
          <div>
            <label style={lbl}>Re-assign on Expiry</label>
            <select value={capacity.reassign_on_expiry ? 'yes' : 'no'}
              onChange={e => setCapacity({ ...capacity, reassign_on_expiry: e.target.value === 'yes' })} style={inp}>
              <option value="yes">Yes — round-robin to next RM</option>
              <option value="no">No — return to pool</option>
            </select>
          </div>
        </div>
        <button style={btn('capacity')} onClick={() => saveSection('capacity', capacity)}>
          {saving === 'capacity' ? 'Saving...' : 'Save'}
        </button>
        {showMsg('capacity')}
      </div>

      {/* Opt-in Link Settings */}
      <div style={panel}>
        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>📧 Opt-in Link Settings</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
          <div>
            <label style={lbl}>Opt-in Base URL</label>
            <input value={optin.optin_base_url}
              onChange={e => setOptin({ ...optin, optin_base_url: e.target.value })} style={inp} />
          </div>
          <div>
            <label style={lbl}>Token Expiry (days)</label>
            <input type="number" value={optin.token_expiry_days}
              onChange={e => setOptin({ ...optin, token_expiry_days: Number(e.target.value) })} style={inp} />
          </div>
          <div>
            <label style={lbl}>Remind RM if No Click After (days)</label>
            <input type="number" value={optin.remind_after_days}
              onChange={e => setOptin({ ...optin, remind_after_days: Number(e.target.value) })} style={inp} />
          </div>
        </div>
        <button style={btn('optin')} onClick={() => saveSection('optin', optin)}>
          {saving === 'optin' ? 'Saving...' : 'Save'}
        </button>
        {showMsg('optin')}
      </div>

      {/* RM Capacity Overview */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', fontSize: '14px', fontWeight: '600' }}>
          👥 RM Capacity Overview
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['RM Name', 'Capacity', 'Assigned Clients', 'Available Slots', 'Status'].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rms.length === 0 ? (
              <tr><td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: '#888' }}>No RMs found</td></tr>
            ) : (
              rms.map((rm, i) => {
                const available = (rm.capacity || capacity.rm_capacity_limit) - (rm.assigned_clients || 0);
                const pct       = Math.round(((rm.assigned_clients || 0) / (rm.capacity || capacity.rm_capacity_limit)) * 100);
                return (
                  <tr key={i}>
                    <td style={{ ...td, fontWeight: '600' }}>{rm.rm_name}</td>
                    <td style={td}>{rm.capacity || capacity.rm_capacity_limit}</td>
                    <td style={td}>{rm.assigned_clients || 0}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '600', color: available > 20 ? '#3b6d11' : '#a32d2d' }}>{available}</span>
                        <div style={{ flex: 1, height: '6px', background: '#eee', borderRadius: '3px', maxWidth: '80px' }}>
                          <div style={{ width: pct + '%', height: '100%', background: pct > 80 ? '#e74c3c' : '#223872', borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontSize: '11px', color: '#888' }}>{pct}%</span>
                      </div>
                    </td>
                    <td style={td}>
                      <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                        background: rm.status === 'active' ? '#eaf3de' : '#fcebeb',
                        color: rm.status === 'active' ? '#3b6d11' : '#a32d2d' }}>
                        {rm.status || 'active'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RMPipeline;