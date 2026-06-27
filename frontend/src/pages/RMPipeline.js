import React, { useState, useEffect } from 'react';
import api from '../api';

const RMPipeline = () => {
  const [rms, setRms] = useState([]);
  const [capacity, setCapacity] = useState({ rm_capacity_limit: 100, lead_expiry_window: 30, reassign_on_expiry: 'Yes — round-robin to next RM', max_reassign_count: 3 });
  const [optin, setOptin] = useState({ optin_base_url: 'https://clientiq.navia.in/optin/', token_expiry_days: 7, remind_after_days: 3 });
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    fetchRms();
    fetchSettings();
  }, []);

  const fetchRms = async () => {
    try {
      const res = await api.get('/rm/list');
      setRms(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchSettings = async () => {
    try {
      const [rmRes, settingsRes] = await Promise.all([
        api.get('/rm/settings'),
        api.get('/admin-settings')
      ]);
      if (rmRes.data) {
        setCapacity(prev => ({
          ...prev,
          rm_capacity_limit: rmRes.data.rm_capacity_limit || 100,
          lead_expiry_window: rmRes.data.lead_expiry_window || 30,
        }));
      }
      const s = settingsRes.data.data || {};
      if (s.optin_base_url) setOptin({
        optin_base_url: s.optin_base_url || 'https://clientiq.navia.in/optin/',
        token_expiry_days: s.token_expiry_days || 7,
        remind_after_days: s.remind_after_days || 3
      });
    } catch (err) { console.error(err); }
  };

  const saveCapacity = async () => {
    try {
      await api.post('/rm/settings', {
        rm_capacity_limit: Number(capacity.rm_capacity_limit),
        lead_expiry_window: Number(capacity.lead_expiry_window)
      });
      await api.put('/admin-settings', {
        max_reassign_count: capacity.max_reassign_count,
        reassign_on_expiry: capacity.reassign_on_expiry
      });
      setSaveMsg('Capacity settings saved');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch { setSaveMsg('Save failed'); }
  };

  const saveOptin = async () => {
    try {
      await api.put('/admin-settings', {
        optin_base_url: optin.optin_base_url,
        token_expiry_days: optin.token_expiry_days,
        remind_after_days: optin.remind_after_days
      });
      setSaveMsg('Opt-in settings saved');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch { setSaveMsg('Save failed'); }
  };

  const inputStyle = { padding: '7px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '12.5px', width: '100%', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '10px', fontWeight: '600', color: '#555', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.4px' };
  const panel = { background: 'white', borderRadius: '10px', padding: '20px', border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: '14px' };
  const btnPrimary = { padding: '8px 16px', background: '#223872', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', marginTop: '14px' };
  const th = { textAlign: 'left', padding: '8px 12px', fontSize: '10px', fontWeight: '600', color: '#888', textTransform: 'uppercase', borderBottom: '0.5px solid rgba(0,0,0,0.1)' };
  const td = { padding: '10px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.05)', fontSize: '13px' };

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>RM & Pipeline Settings</h2>
      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Global configuration for RM operations, opt-in flow, and lead pipeline</p>

      {saveMsg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', margin: '14px 0', fontSize: '13px',
          background: saveMsg.includes('failed') ? '#fcebeb' : '#eaf3de',
          color: saveMsg.includes('failed') ? '#a32d2d' : '#3b6d11' }}>
          {saveMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>

        {/* Round-robin & capacity */}
        <div style={panel}>
          <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '14px' }}>⚙️ Round-robin & Capacity</div>
          <div style={{ display: 'grid', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Default RM Capacity (clients)</label>
              <input type="number" value={capacity.rm_capacity_limit}
                onChange={e => setCapacity({ ...capacity, rm_capacity_limit: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Lead Expiry Period (days)</label>
              <input type="number" value={capacity.lead_expiry_window}
                onChange={e => setCapacity({ ...capacity, lead_expiry_window: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Re-assign on Expiry</label>
              <select value={capacity.reassign_on_expiry}
                onChange={e => setCapacity({ ...capacity, reassign_on_expiry: e.target.value })} style={inputStyle}>
                <option>Yes — round-robin to next RM</option>
                <option>No — return to pool</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Max Reassign Count Before Pool</label>
              <input type="number" value={capacity.max_reassign_count}
                onChange={e => setCapacity({ ...capacity, max_reassign_count: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <button onClick={saveCapacity} style={btnPrimary}>Save</button>
        </div>

        {/* Opt-in link settings */}
        <div style={panel}>
          <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '14px' }}>📧 Opt-in Link Settings</div>
          <div style={{ display: 'grid', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Opt-in Base URL</label>
              <input type="url" value={optin.optin_base_url}
                onChange={e => setOptin({ ...optin, optin_base_url: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Token Expiry (days)</label>
              <input type="number" value={optin.token_expiry_days}
                onChange={e => setOptin({ ...optin, token_expiry_days: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Remind RM if No Click After (days)</label>
              <input type="number" value={optin.remind_after_days}
                onChange={e => setOptin({ ...optin, remind_after_days: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <button onClick={saveOptin} style={btnPrimary}>Save</button>
        </div>
      </div>

      {/* RM Capacity Table */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '14px' }}>👥 RM Capacity Overview</div>
        {rms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#888', fontSize: '13px' }}>No RMs found. Add users with RM role first.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                {['RM Name', 'Capacity', 'Assigned Clients', 'Available Slots', 'Status'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rms.map(rm => {
                const assigned = Number(rm.assigned_clients || 0);
                const available = rm.capacity - assigned;
                return (
                  <tr key={rm.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ ...td, fontWeight: '500' }}>{rm.rm_name}</td>
                    <td style={td}>{rm.capacity}</td>
                    <td style={td}>{assigned}</td>
                    <td style={{ ...td, color: available > 0 ? '#3b6d11' : '#a32d2d', fontWeight: '600' }}>{available}</td>
                    <td style={td}>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                        background: rm.status === 'active' ? '#eaf3de' : '#fcebeb',
                        color: rm.status === 'active' ? '#3b6d11' : '#a32d2d' }}>
                        {rm.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default RMPipeline;