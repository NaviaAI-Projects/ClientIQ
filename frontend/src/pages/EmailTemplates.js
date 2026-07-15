import React, { useState, useEffect } from 'react';
import api from '../api';

const TEMPLATE_META = {
  optin_client:       { label: 'Opt-in Email (to Client)',        trigger: 'RM marks lead as Interested',        icon: '📧' },
  optin_rm:           { label: 'Opt-in Confirmation (to RM)',     trigger: 'Client clicks opt-in link',          icon: '✅' },
  supervisor_approval:{ label: 'Supervisor Approval Request',     trigger: 'Client opts in — notifies supervisor', icon: '👆' },
  mapping_confirmed:  { label: 'Mapping Confirmed (to Client)',   trigger: 'Supervisor approves mapping',        icon: '🎉' },
  lead_expiry:        { label: 'Lead Expiry Warning (to RM)',     trigger: '7 days before lead expires',         icon: '⏰' },
  churn_alert:        { label: 'Churn Alert (to RM)',             trigger: 'AI churn score crosses 70',          icon: '⚠️' },
  daily_digest:       { label: 'AI Daily Digest (to RM)',         trigger: 'Scheduled: 07:30 daily',             icon: '🤖' },
};

const VARIABLES = {
  optin_client:        ['{client_name}', '{rm_name}', '{optin_link}', '{token_expiry_days}', '{rm_phone}'],
  optin_rm:            ['{client_name}', '{rm_name}'],
  supervisor_approval: ['{client_name}', '{rm_name}'],
  mapping_confirmed:   ['{client_name}', '{rm_name}'],
  lead_expiry:         ['{client_name}', '{rm_name}', '{expiry_date}'],
  churn_alert:         ['{client_name}', '{rm_name}', '{churn_score}'],
  daily_digest:        ['{rm_name}', '{date}', '{digest_content}'],
};

const EmailTemplates = () => {
  const [templates, setTemplates]   = useState({});
  const [selected, setSelected]     = useState('optin_client');
  const [form, setForm]             = useState({ subject: '', sender_name: '', body: '' });
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [testing, setTesting]       = useState(false);
  const [testEmail, setTestEmail]   = useState('');
  const [showTest, setShowTest]     = useState(false);
  const [testClientName, setTestClientName] = useState('');
  const [msg, setMsg]               = useState('');
  const [preview, setPreview]       = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin-settings/email-templates');
      const map = {};
      (res.data.templates || []).forEach(t => { map[t.template_key] = t; });
      setTemplates(map);
      loadTemplate('optin_client', map);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const loadTemplate = (key, map) => {
    const t = (map || templates)[key];
    if (t) setForm({ subject: t.subject || '', sender_name: t.sender_name || '', body: t.body || '' });
    else setForm({ subject: '', sender_name: '', body: '' });
    setSelected(key);
    setMsg('');
    setPreview(false);
  };

  const saveTemplate = async () => {
    setSaving(true); setMsg('');
    try {
      await api.put(`/admin-settings/email-templates/${selected}`, form);
      setMsg('success');
      loadTemplates();
    } catch { setMsg('error'); }
    setSaving(false);
  };

  const sendTest = async () => {
    if (!testEmail) { alert('Enter test email address'); return; }
    setTesting(true);
    try {
      await api.post('/admin-settings/email-templates/test', {
        template_key:     selected,
        test_email:       testEmail,
        test_client_name: testClientName || null, // UCC for Sharepro fetch
        ...form
      });
      alert(`✅ Test email sent to ${testEmail}`);
      setShowTest(false);
    } catch (err) {
      alert('❌ Failed: ' + (err.response?.data?.message || err.message));
    }
    setTesting(false);
  };

  const getPreviewBody = () => {
    return form.body
      .replace('{client_name}', 'MONICKA MURUGAVEL')
      .replace('{rm_name}', 'Priya Shankar')
      .replace('{optin_link}', 'https://navia.co.in/optin/abc123')
      .replace('{token_expiry_days}', '7')
      .replace('{rm_phone}', '9962017083')
      .replace('{date}', new Date().toLocaleDateString('en-IN'))
      .replace('{churn_score}', '75')
      .replace('{expiry_date}', '04/07/2026')
      .replace('{digest_content}', '[AI digest content here]');
  };

  const inp  = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '100%', boxSizing: 'border-box' };
  const lbl  = { display: 'block', fontSize: '11px', fontWeight: '600', color: '#666', marginBottom: '4px' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading templates...</div>;

  const meta = TEMPLATE_META[selected];
  const vars = VARIABLES[selected] || [];

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#111', margin: 0 }}>Email Templates</h2>
      <p style={{ fontSize: '13px', color: '#777', marginTop: '4px', marginBottom: '20px' }}>
        Configure system-generated emails — opt-in, confirmations, and alerts
      </p>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px',
          background: msg === 'success' ? '#eaf3de' : '#fcebeb',
          color: msg === 'success' ? '#3b6d11' : '#a32d2d' }}>
          {msg === 'success' ? '✓ Template saved successfully' : '✗ Failed to save template'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '16px' }}>

        {/* Template List */}
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #eee', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', fontSize: '12px', fontWeight: '600', color: '#888', textTransform: 'uppercase' }}>
            Templates
          </div>
          {Object.entries(TEMPLATE_META).map(([key, meta]) => (
            <div key={key} onClick={() => loadTemplate(key, null)}
              style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
                background: selected === key ? '#f0f4ff' : 'white',
                borderLeft: selected === key ? '3px solid #223872' : '3px solid transparent' }}>
              <div style={{ fontSize: '13px', fontWeight: selected === key ? '600' : '400', color: selected === key ? '#223872' : '#333' }}>
                {meta.icon} {meta.label}
              </div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{meta.trigger}</div>
            </div>
          ))}
        </div>

        {/* Template Editor */}
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #eee', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#111' }}>{meta.icon} {meta.label}</div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Trigger: {meta.trigger}</div>
            </div>
            <button onClick={() => setPreview(!preview)}
              style={{ padding: '6px 14px', background: preview ? '#223872' : 'white', color: preview ? 'white' : '#223872', border: '1px solid #223872', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
              {preview ? '✏️ Edit' : '👁️ Preview'}
            </button>
          </div>

          {/* Available variables */}
          <div style={{ background: '#f8f9fb', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#888', marginBottom: '6px' }}>AVAILABLE VARIABLES</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {vars.map(v => (
                <span key={v} style={{ background: '#e8f0ff', color: '#223872', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace', cursor: 'pointer' }}
                  onClick={() => setForm(f => ({ ...f, body: f.body + v }))}>
                  {v}
                </span>
              ))}
            </div>
          </div>

          {preview ? (
            <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '4px' }}>Subject: {form.subject?.replace('{client_name}', 'MONICKA MURUGAVEL').replace('{date}', new Date().toLocaleDateString('en-IN'))}</div>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>From: {form.sender_name}</div>
              <hr style={{ border: 'none', borderTop: '1px solid #eee', marginBottom: '16px' }} />
              <div style={{ fontSize: '13px', lineHeight: '1.8', whiteSpace: 'pre-wrap', color: '#333' }}>{getPreviewBody()}</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '14px' }}>
              <div>
                <label style={lbl}>Subject Line</label>
                <input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} style={inp} placeholder="Email subject..." />
              </div>
              <div>
                <label style={lbl}>Sender Name</label>
                <input value={form.sender_name} onChange={e => setForm({ ...form, sender_name: e.target.value })} style={inp} placeholder="e.g. Navia Markets — Client Services" />
              </div>
              <div>
                <label style={lbl}>Email Body</label>
                <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
                  style={{ ...inp, minHeight: '200px', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6' }}
                  placeholder="Email body..." />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px', alignItems: 'center' }}>
            <button onClick={saveTemplate} disabled={saving}
              style={{ padding: '8px 20px', background: saving ? '#94a3b8' : '#223872', color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>
              {saving ? 'Saving...' : '💾 Save Template'}
            </button>
            <button onClick={() => setShowTest(!showTest)}
              style={{ padding: '8px 16px', background: 'white', color: '#223872', border: '1px solid #223872', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
              📤 Send Test
            </button>
          </div>

          {/* Test email input */}
          {showTest && (
            <div style={{ marginTop: '12px', background: '#f8f9fb', borderRadius: '8px', padding: '14px', border: '1px solid #eee' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '10px' }}>Send Test Email</div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <div>
                  <label style={lbl}>Test Email Address</label>
                  <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                    placeholder="Enter email to receive test" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Client Name (for {} variable)</label>
                  <input value={testClientName} onChange={e => setTestClientName(e.target.value)}
                    placeholder="e.g. MONICKA MURUGAVEL" style={inp} />
                </div>
              </div>
              <button onClick={sendTest} disabled={testing}
                style={{ marginTop: '10px', padding: '8px 16px', background: testing ? '#94a3b8' : '#25D366', color: 'white', border: 'none', borderRadius: '6px', cursor: testing ? 'not-allowed' : 'pointer', fontSize: '13px' }}>
                {testing ? 'Sending...' : 'Send Test'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailTemplates;