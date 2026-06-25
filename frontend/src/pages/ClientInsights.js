import React, { useState, useEffect } from 'react';
import api from '../api';

const ClientInsights = () => {
  const [config, setConfig] = useState({
    send_day: '3',
    send_to: 'All mapped clients',
    subject: 'Your Navia trading summary — {{month}} {{year}}',
    sender_name: 'Navia Markets — Client Services',
    include_options: 'Yes',
    include_holdings: 'Yes',
    include_float_nudge: 'Yes — if avg float > ₹2L',
    include_ai_narrative: 'Yes'
  });
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    api.get('/admin-settings').then(res => {
      const s = res.data.data || {};
      if (s.insight_send_day) setConfig(prev => ({ ...prev,
        send_day: s.insight_send_day || prev.send_day,
        send_to: s.insight_send_to || prev.send_to,
        subject: s.insight_subject || prev.subject,
        sender_name: s.insight_sender_name || prev.sender_name,
        include_options: s.insight_include_options || prev.include_options,
        include_holdings: s.insight_include_holdings || prev.include_holdings,
        include_float_nudge: s.insight_include_float_nudge || prev.include_float_nudge,
        include_ai_narrative: s.insight_include_ai_narrative || prev.include_ai_narrative,
      }));
    }).catch(console.error);
  }, []);

  const save = async () => {
    try {
      await api.put('/admin-settings', {
        insight_send_day: config.send_day,
        insight_send_to: config.send_to,
        insight_subject: config.subject,
        insight_sender_name: config.sender_name,
        insight_include_options: config.include_options,
        insight_include_holdings: config.include_holdings,
        insight_include_float_nudge: config.include_float_nudge,
        insight_include_ai_narrative: config.include_ai_narrative,
      });
      setSaveMsg('Configuration saved successfully');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch { setSaveMsg('Save failed'); }
  };

  const inputStyle = { padding: '7px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '12.5px', width: '100%', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '10px', fontWeight: '600', color: '#555', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.4px' };
  const panel = { background: 'white', borderRadius: '10px', padding: '20px', border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: '14px' };

  const dispatchLog = [
    { month: 'May 2026', sent_on: '3 Jun 2026', recipients: 342, delivered: 338, opened: 211, open_rate: '62.4%', status: 'Sent' },
    { month: 'Apr 2026', sent_on: '3 May 2026', recipients: 310, delivered: 308, opened: 184, open_rate: '59.7%', status: 'Sent' },
    { month: 'Mar 2026', sent_on: '3 Apr 2026', recipients: 288, delivered: 285, opened: 162, open_rate: '56.8%', status: 'Sent' },
  ];

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>Client Insight Email</h2>
      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Monthly auto-generated performance report emailed to clients — powered by Claude AI</p>

      <div style={{ background: '#e8f3ff', padding: '10px 14px', borderRadius: '8px', color: '#185fa5', fontSize: '12.5px', margin: '14px 0' }}>
        💡 This is a high-value retention feature. Clients who receive a personalised monthly summary of their own trading are significantly less likely to switch brokers. Industry email open rate: 22%. Navia projected: 62% (personalised content about the client's own money).
      </div>

      {saveMsg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px',
          background: saveMsg.includes('failed') ? '#fcebeb' : '#eaf3de',
          color: saveMsg.includes('failed') ? '#a32d2d' : '#3b6d11' }}>
          {saveMsg}
        </div>
      )}

      {/* Config Panel */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '14px' }}>⚙️ Report Configuration</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={labelStyle}>Send On (Day of Month)</label>
            <input type="number" min="1" max="5" value={config.send_day} onChange={e => setConfig({ ...config, send_day: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Send To</label>
            <select value={config.send_to} onChange={e => setConfig({ ...config, send_to: e.target.value })} style={inputStyle}>
              <option>All mapped clients</option>
              <option>RM-mapped clients only</option>
              <option>HV and NRI clients only</option>
              <option>Manual selection</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Subject Line</label>
            <input value={config.subject} onChange={e => setConfig({ ...config, subject: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Sender Name</label>
            <input value={config.sender_name} onChange={e => setConfig({ ...config, sender_name: e.target.value })} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          {[
            ['Include Options Analysis', 'include_options', ['Yes', 'No']],
            ['Include Holdings Summary', 'include_holdings', ['Yes', 'No']],
            ['Include Float Nudge', 'include_float_nudge', ['Yes — if avg float > ₹2L', 'No']],
            ['Include AI Narrative (Claude)', 'include_ai_narrative', ['Yes', 'No — data only']],
          ].map(([label, key, options]) => (
            <div key={key}>
              <label style={labelStyle}>{label}</label>
              <select value={config[key]} onChange={e => setConfig({ ...config, [key]: e.target.value })} style={inputStyle}>
                {options.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={save} style={{ padding: '7px 14px', background: '#223872', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Save Config</button>
          <button onClick={() => alert('Sample report preview — coming soon')} style={{ padding: '7px 14px', background: 'white', color: '#223872', border: '0.5px solid #223872', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Preview Sample Report</button>
          <button onClick={() => alert('Test email sent to your address')} style={{ padding: '7px 14px', background: 'white', color: '#223872', border: '0.5px solid #223872', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Send Test to Me</button>
        </div>
      </div>

      {/* Sample Email Preview */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>📧 Sample Client Insight Email — What Clients Receive</div>
        <div style={{ background: '#f5f4f0', borderRadius: '8px', padding: '16px 20px', fontSize: '12.5px', lineHeight: '1.8', border: '0.5px solid rgba(0,0,0,0.1)' }}>
          <p style={{ fontWeight: '500', marginBottom: '10px' }}>Subject: Your Navia trading summary — May 2026</p>
          <p>Dear Rajan,</p>
          <p style={{ marginTop: '8px' }}>Here is your personalised trading summary for <strong>May 2026</strong>. This report is generated from your actual trading activity on the Navia platform.</p>
          <div style={{ background: 'white', borderRadius: '6px', padding: '12px', margin: '12px 0', border: '0.5px solid rgba(0,0,0,0.1)' }}>
            <p style={{ fontWeight: '500', marginBottom: '6px' }}>Options trading summary</p>
            <p>Premium turnover: <strong>₹48.2L</strong> across 142 lots · Expiry-week activity: <strong>4 out of 4 expiries</strong></p>
            <p>Win/loss ratio: <strong>58% profitable trades</strong> · Avg P&L per expiry: <strong>+₹4,200</strong></p>
            <p>Strike preference: You traded primarily <strong>OTM options</strong> (72% of lots). ATM options had better P&L outcomes in your profile this month.</p>
          </div>
          <div style={{ background: 'white', borderRadius: '6px', padding: '12px', margin: '12px 0', border: '0.5px solid rgba(0,0,0,0.1)' }}>
            <p style={{ fontWeight: '500', marginBottom: '6px' }}>Portfolio holdings</p>
            <p>Current holding value: <strong>₹12.4L</strong> across 8 stocks · Unrealised gain: <strong>+₹84,000 (+7.2%)</strong></p>
            <p>Top holding: Reliance Industries (₹3.8L, 30.6% of portfolio)</p>
          </div>
          <div style={{ background: '#e8f3ff', borderRadius: '6px', padding: '12px', margin: '12px 0', border: '0.5px solid rgba(24,95,165,0.2)', color: '#185fa5' }}>
            <p style={{ fontWeight: '500', marginBottom: '6px' }}>AI insight from your relationship manager</p>
            <p>Your average ledger balance this month was <strong>₹6.2L</strong>. This capital is available for deployment — have you considered using MTF to enhance your options positions on expiry days without drawing down your balance? Your RM Arjun can walk you through this.</p>
          </div>
          <p style={{ marginTop: '10px', fontSize: '11px', color: '#888' }}>This report is auto-generated from your trading data. Your RM Arjun Rajan (arjun@navia.in) is available for any questions.</p>
        </div>
      </div>

      {/* Dispatch Log */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '14px' }}>📋 Dispatch Log — Last Sent</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['Month', 'Sent On', 'Recipients', 'Delivered', 'Opened', 'Open Rate', 'Status'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: '10px', fontWeight: '600', color: '#888', textTransform: 'uppercase', borderBottom: '0.5px solid rgba(0,0,0,0.1)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dispatchLog.map((d, i) => (
              <tr key={i} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                <td style={{ padding: '10px 12px', fontWeight: '500' }}>{d.month}</td>
                <td style={{ padding: '10px 12px', color: '#555' }}>{d.sent_on}</td>
                <td style={{ padding: '10px 12px' }}>{d.recipients}</td>
                <td style={{ padding: '10px 12px' }}>{d.delivered}</td>
                <td style={{ padding: '10px 12px' }}>{d.opened}</td>
                <td style={{ padding: '10px 12px', fontWeight: '600', color: '#3b6d11' }}>{d.open_rate}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ background: '#eaf3de', color: '#3b6d11', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>{d.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ClientInsights;