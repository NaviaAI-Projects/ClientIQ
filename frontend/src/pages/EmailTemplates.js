import React, { useState, useEffect } from 'react';
import api from '../api';

const EmailTemplates = () => {
  const [optin, setOptin] = useState({
    subject: 'Navia Markets — Your dedicated Relationship Manager is ready',
    sender_name: 'Navia Markets — Client Services',
    body: `Dear {client_name},\n\nWe are pleased to inform you that {rm_name} from Navia Markets has been assigned as your dedicated Relationship Manager.\n\nYour RM can assist you with:\n• Investment insights and market updates\n• Margin Trading Facility (MTF) setup\n• Remittance services (for NRI clients)\n• Partner products — Mutual Funds, Insurance, Bonds, PMS/AIF\n\nTo confirm and activate this complimentary service, please click below:\n\n[ CONFIRM — ACTIVATE MY RM SERVICE ]\n{optin_link}\n\nThis link is valid for {token_expiry_days} days.\nIf you did not expect this email, please ignore it.\n\nWarm regards,\nNavia Markets · Client Services\n{rm_name} · {rm_phone}`
  });
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    api.get('/admin-settings').then(res => {
      const s = res.data.data || {};
      if (s.optin_email_subject) setOptin(prev => ({
        ...prev,
        subject: s.optin_email_subject,
        sender_name: s.optin_email_sender || prev.sender_name,
        body: s.optin_email_body || prev.body
      }));
    }).catch(console.error);
  }, []);

  const save = async () => {
    try {
      await api.put('/admin-settings', {
        optin_email_subject: optin.subject,
        optin_email_sender: optin.sender_name,
        optin_email_body: optin.body
      });
      setSaveMsg('Template saved successfully');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch { setSaveMsg('Save failed'); }
  };

  const inputStyle = { padding: '7px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '12.5px', width: '100%', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '10px', fontWeight: '600', color: '#555', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.4px' };
  const panel = { background: 'white', borderRadius: '10px', padding: '20px', border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: '14px' };

  const otherTemplates = [
    { name: 'Opt-in confirmation (to RM)', trigger: 'Client clicks opt-in link' },
    { name: 'Supervisor approval request', trigger: 'Client opts in — notifies supervisor' },
    { name: 'Mapping confirmed (to client)', trigger: 'Supervisor approves mapping' },
    { name: 'Lead expiry warning (to RM)', trigger: '7 days before lead expires' },
    { name: 'Churn alert (to RM)', trigger: 'AI churn score crosses 70' },
    { name: 'AI daily digest (to RM)', trigger: 'Scheduled: 07:30 daily' },
  ];

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>Email Templates</h2>
      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Configure system-generated emails — opt-in, confirmations, and alerts</p>

      {saveMsg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', margin: '14px 0', fontSize: '13px',
          background: saveMsg.includes('failed') ? '#fcebeb' : '#eaf3de',
          color: saveMsg.includes('failed') ? '#a32d2d' : '#3b6d11' }}>
          {saveMsg}
        </div>
      )}

      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>📧 Opt-in Email Template</div>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
          Sent to leads when RM marks as "Interested". Variables:&nbsp;
          {['{client_name}', '{rm_name}', '{optin_link}', '{token_expiry_days}', '{rm_phone}'].map(v => (
            <code key={v} style={{ background: '#f5f4f0', padding: '1px 5px', borderRadius: '3px', fontSize: '11px', marginRight: '4px' }}>{v}</code>
          ))}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Subject Line</label>
            <input value={optin.subject} onChange={e => setOptin({ ...optin, subject: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Sender Name</label>
            <input value={optin.sender_name} onChange={e => setOptin({ ...optin, sender_name: e.target.value })} style={inputStyle} />
          </div>
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Email Body</label>
          <textarea value={optin.body} onChange={e => setOptin({ ...optin, body: e.target.value })}
            style={{ ...inputStyle, minHeight: '220px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={save} style={{ padding: '7px 14px', background: '#223872', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Save Template</button>
          <button onClick={() => alert('Preview email in modal — coming soon')} style={{ padding: '7px 14px', background: 'white', color: '#223872', border: '0.5px solid #223872', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Preview</button>
          <button onClick={() => alert('Test email sent to your address')} style={{ padding: '7px 14px', background: 'white', color: '#223872', border: '0.5px solid #223872', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Send Test</button>
        </div>
      </div>

      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '14px' }}>Other System Email Templates</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['Template', 'Trigger', 'Action'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: '10px', fontWeight: '600', color: '#888', textTransform: 'uppercase', borderBottom: '0.5px solid rgba(0,0,0,0.1)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {otherTemplates.map((t, i) => (
              <tr key={i} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                <td style={{ padding: '10px 12px', fontWeight: '500' }}>{t.name}</td>
                <td style={{ padding: '10px 12px', color: '#555', fontSize: '12px' }}>{t.trigger}</td>
                <td style={{ padding: '10px 12px' }}>
                  <button onClick={() => alert('Template editor — coming soon')}
                    style={{ padding: '3px 10px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.2)', background: 'white' }}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EmailTemplates;