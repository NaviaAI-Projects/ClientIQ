import React, { useState, useEffect } from 'react';
import api from '../api';

const ClientInsightEmail = () => {
  const [config, setConfig] = useState({
    send_day:             '3',
    send_to:              'All mapped clients',
    subject:              'Your Navia trading summary — {{month}} {{year}}',
    sender_name:          'Navia Markets — Client Services',
    include_options:      'Yes',
    include_holdings:     'Yes',
    include_float_nudge:  'Yes — if avg float > ₹2L',
    include_ai_narrative: 'Yes'
  });
  const [saveMsg, setSaveMsg]     = useState('');
  const [dispatchLog, setDispatchLog] = useState([]);
  const [preview, setPreview]     = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [testSending, setTestSending]       = useState(false);
  const [testMsg, setTestMsg]     = useState('');
  const [sending, setSending]     = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const res = await api.get('/admin-settings');
      const s   = res.data.data || {};
      setConfig(prev => ({
        send_day:             s.insight_send_day             || '3',
        send_to:              s.insight_send_to              || 'All mapped clients',
        subject:              s.insight_subject              || 'Your Navia trading summary — {{month}} {{year}}',
        sender_name:          s.insight_sender_name          || 'Navia Markets — Client Services',
        include_options:      s.insight_include_options      || 'Yes',
        include_holdings:     s.insight_include_holdings     || 'Yes',
        include_float_nudge:  s.insight_include_float_nudge  || 'Yes — if avg float > ₹2L',
        include_ai_narrative: s.insight_include_ai_narrative || prev.include_ai_narrative
      }));
    } catch (e) { console.error(e); }

    try {
      const logRes = await api.get('/admin-settings/insight-log');
      setDispatchLog(logRes.data.logs || []);
    } catch (e) { console.error(e); }
  };

  const save = async () => {
    try {
      await api.put('/admin-settings', {
        insight_send_day:             config.send_day,
        insight_send_to:              config.send_to,
        insight_subject:              config.subject,
        insight_sender_name:          config.sender_name,
        insight_include_options:      config.include_options,
        insight_include_holdings:     config.include_holdings,
        insight_include_float_nudge:  config.include_float_nudge,
        insight_include_ai_narrative: config.include_ai_narrative,
      });
      setSaveMsg('Configuration saved successfully');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch { setSaveMsg('Save failed'); }
  };

  const loadPreview = async () => {
    setPreviewLoading(true);
    setPreview(null);
    try {
      const res = await api.get('/admin-settings/insight-preview');
      setPreview(res.data);
    } catch (e) {
      alert('Preview failed: ' + (e.response?.data?.message || e.message));
    }
    setPreviewLoading(false);
  };

  const sendTest = async () => {
    setTestSending(true); setTestMsg('');
    try {
      const res = await api.post('/admin-settings/insight-test');
      setTestMsg('✅ ' + res.data.message);
      setTimeout(() => setTestMsg(''), 5000);
    } catch (e) {
      setTestMsg('❌ ' + (e.response?.data?.message || e.message));
    }
    setTestSending(false);
  };

  const sendNow = async () => {
    if (!window.confirm('Send Client Insight Email to all mapped clients now?')) return;
    setSending(true);
    try {
      const res = await api.post('/admin-settings/insight-send');
      alert('✅ ' + res.data.message);
      loadAll();
    } catch (e) {
      alert('❌ ' + (e.response?.data?.message || e.message));
    }
    setSending(false);
  };

  const inp   = { padding: '7px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '12.5px', width: '100%', boxSizing: 'border-box' };
  const lbl   = { display: 'block', fontSize: '10px', fontWeight: '600', color: '#555', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.4px' };
  const panel = { background: 'white', borderRadius: '10px', padding: '20px', border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: '14px' };
  const btnP  = { padding: '7px 14px', background: '#223872', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' };
  const btnS  = { padding: '7px 14px', background: 'white', color: '#223872', border: '0.5px solid #223872', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' };

  const month = new Date().toLocaleString('en-IN', { month: 'long' });
  const year  = new Date().getFullYear();

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>Client Insight Email</h2>
      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Monthly auto-generated performance report emailed to clients — powered by Groq AI</p>

      <div style={{ background: '#e8f3ff', padding: '10px 14px', borderRadius: '8px', color: '#185fa5', fontSize: '12.5px', margin: '14px 0' }}>
        💡 This is a high-value retention feature. Clients who receive a personalised monthly summary of their own trading are significantly less likely to switch brokers. Industry email open rate: 22%. Navia projected: 62% (personalised content about the client's own money).
      </div>

      {saveMsg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px',
          background: saveMsg.includes('failed') ? '#fcebeb' : '#eaf3de',
          color:      saveMsg.includes('failed') ? '#a32d2d' : '#3b6d11' }}>
          {saveMsg}
        </div>
      )}

      {/* Config Panel */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '14px' }}>⚙️ Report Configuration</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={lbl}>Send On (Day of Month)</label>
            <input type="number" min="1" max="5" value={config.send_day}
              onChange={e => setConfig({ ...config, send_day: e.target.value })} style={inp} />
          </div>
          <div>
            <label style={lbl}>Send To</label>
            <select value={config.send_to} onChange={e => setConfig({ ...config, send_to: e.target.value })} style={inp}>
              <option>All mapped clients</option>
              <option>RM-mapped clients only</option>
              <option>HV and NRI clients only</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Subject Line</label>
            <input value={config.subject} onChange={e => setConfig({ ...config, subject: e.target.value })} style={inp} />
          </div>
          <div>
            <label style={lbl}>Sender Name</label>
            <input value={config.sender_name} onChange={e => setConfig({ ...config, sender_name: e.target.value })} style={inp} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          {[
            ['Include Options Analysis',      'include_options',      ['Yes', 'No']],
            ['Include Holdings Summary',      'include_holdings',     ['Yes', 'No']],
            ['Include Float Nudge',           'include_float_nudge',  ['Yes — if avg float > ₹2L', 'No']],
            ['Include AI Narrative (Groq)',   'include_ai_narrative', ['Yes', 'No — data only']],
          ].map(([label, key, options]) => (
            <div key={key}>
              <label style={lbl}>{label}</label>
              <select value={config[key]} onChange={e => setConfig({ ...config, [key]: e.target.value })} style={inp}>
                {options.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={save} style={btnP}>💾 Save Config</button>
          <button onClick={loadPreview} disabled={previewLoading} style={btnS}>
            {previewLoading ? '⏳ Loading...' : '👁️ Preview Sample Report'}
          </button>
          <button onClick={sendTest} disabled={testSending} style={btnS}>
            {testSending ? '⏳ Sending...' : '📤 Send Test to Me'}
          </button>
          <button onClick={sendNow} disabled={sending}
            style={{ ...btnP, background: sending ? '#94a3b8' : '#3b6d11' }}>
            {sending ? '⏳ Sending...' : '🚀 Send Now to All Clients'}
          </button>
          {testMsg && <span style={{ fontSize: '12px', color: testMsg.includes('✅') ? '#3b6d11' : '#a32d2d' }}>{testMsg}</span>}
        </div>
      </div>

      {/* Preview Panel */}
      {preview && (
        <div style={panel}>
          <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>
            📧 Sample Client Insight Email — {preview.client_name}
          </div>
          <div style={{ background: '#f5f4f0', borderRadius: '8px', padding: '16px 20px', fontSize: '12.5px', lineHeight: '1.8', border: '0.5px solid rgba(0,0,0,0.1)' }}>
            <p style={{ fontWeight: '500', marginBottom: '10px' }}>
              Subject: {config.subject.replace('{{month}}', month).replace('{{year}}', year)}
            </p>
            <p>Dear {preview.client_name?.split(' ')[0]},</p>
            <p style={{ marginTop: '8px' }}>
              Here is your personalised trading summary for <strong>{month} {year}</strong>. This report is generated from your actual trading activity on the Navia platform.
            </p>

            {config.include_options === 'Yes' && preview.options && (
              <div style={{ background: 'white', borderRadius: '6px', padding: '12px', margin: '12px 0', border: '0.5px solid rgba(0,0,0,0.1)' }}>
                <p style={{ fontWeight: '500', marginBottom: '6px' }}>Options trading summary</p>
                <p>Premium turnover: <strong>{preview.options.turnover}</strong> · Lots traded: <strong>{preview.options.lots}</strong></p>
                <p>Segments: <strong>{preview.options.segments}</strong></p>
              </div>
            )}

            {config.include_holdings === 'Yes' && preview.holdings && (
              <div style={{ background: 'white', borderRadius: '6px', padding: '12px', margin: '12px 0', border: '0.5px solid rgba(0,0,0,0.1)' }}>
                <p style={{ fontWeight: '500', marginBottom: '6px' }}>Portfolio holdings</p>
                <p>Holdings value: <strong>{preview.holdings.value}</strong> across <strong>{preview.holdings.count} stocks</strong></p>
              </div>
            )}

            {config.include_float_nudge === 'Yes — if avg float > ₹2L' && preview.float && (
              <div style={{ background: '#e8f3ff', borderRadius: '6px', padding: '12px', margin: '12px 0', border: '0.5px solid rgba(24,95,165,0.2)', color: '#185fa5' }}>
                <p style={{ fontWeight: '500', marginBottom: '6px' }}>Float opportunity</p>
                <p>Your average ledger balance: <strong>{preview.float.avg_balance}</strong>. {preview.float.nudge}</p>
              </div>
            )}

            {config.include_ai_narrative === 'Yes' && preview.ai_narrative && (
              <div style={{ background: '#f0f4ff', borderRadius: '6px', padding: '12px', margin: '12px 0', border: '0.5px solid rgba(34,56,114,0.2)' }}>
                <p style={{ fontWeight: '500', marginBottom: '6px' }}>🤖 AI Insight from your Relationship Manager</p>
                <p style={{ color: '#333' }}>{preview.ai_narrative}</p>
              </div>
            )}

            <p style={{ marginTop: '10px', fontSize: '11px', color: '#888' }}>
              This report is auto-generated from your trading data. Contact your RM for any questions.
            </p>
          </div>
        </div>
      )}

      {/* Dispatch Log */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '14px' }}>📋 Dispatch Log — Last Sent</div>
        {dispatchLog.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
            No emails sent yet. Click "Send Now to All Clients" to send the first batch.
          </div>
        ) : (
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
                  <td style={{ padding: '10px 12px', color: '#555' }}>{d.sent_on ? new Date(d.sent_on).toLocaleDateString('en-IN') : '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{d.recipients}</td>
                  <td style={{ padding: '10px 12px' }}>{d.delivered}</td>
                  <td style={{ padding: '10px 12px' }}>{d.opened}</td>
                  <td style={{ padding: '10px 12px', fontWeight: '600', color: '#3b6d11' }}>
                    {d.recipients > 0 ? Math.round((d.opened / d.recipients) * 100) + '%' : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ background: d.status === 'sent' ? '#eaf3de' : '#faeeda', color: d.status === 'sent' ? '#3b6d11' : '#854f0b', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ClientInsightEmail;