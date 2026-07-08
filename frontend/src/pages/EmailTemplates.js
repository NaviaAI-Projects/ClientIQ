import React, { useState, useEffect } from 'react';
import api from '../api';

const TEMPLATE_META = {
  optin_client:        { label: 'Opt-in Email (to Client)',       trigger: 'RM marks lead as Interested',         icon: '📧' },
  optin_rm:            { label: 'Opt-in Confirmation (to RM)',    trigger: 'Client clicks opt-in link',           icon: '✅' },
  supervisor_approval: { label: 'Supervisor Approval Request',    trigger: 'Client opts in — notifies supervisor', icon: '👆' },
  mapping_confirmed:   { label: 'Mapping Confirmed (to Client)',  trigger: 'Supervisor approves mapping',          icon: '🎉' },
  lead_expiry:         { label: 'Lead Expiry Warning (to RM)',    trigger: '7 days before lead expires',           icon: '⏰' },
  churn_alert:         { label: 'Churn Alert (to RM)',            trigger: 'AI churn score crosses 70',            icon: '⚠️' },
  daily_digest:        { label: 'AI Daily Digest (to RM)',        trigger: 'Scheduled: 07:30 daily',               icon: '🤖' },
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

const TEST_VALUES = {
  '{client_name}':       'MONICKA MURUGAVEL',
  '{rm_name}':           'Priya Shankar',
  '{optin_link}':        'https://navia.co.in/optin/abc123',
  '{token_expiry_days}': '7',
  '{rm_phone}':          '9962017083',
  '{date}':              new Date().toLocaleDateString('en-IN'),
  '{churn_score}':       '75',
  '{expiry_date}':       '04/07/2026',
  '{digest_content}':    'High priority clients today: MONICKA MURUGAVEL (score 81), SENADI LAKSHMANAN (score 75). Recommend calling before 12 PM.',
};

function fillPreview(text) {
  if (!text) return '';
  return Object.entries(TEST_VALUES).reduce((t, [k, v]) => t.split(k).join(v), text);
}

function renderPreviewHtml(subject, senderName, body) {
  const filledBody    = fillPreview(body || '');
  const filledSubject = fillPreview(subject || '');

  // Convert \n to real line breaks and build paragraphs
  const paragraphs = filledBody
    .replace(/\\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', border: '1px solid #e0e0e0', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      {/* Email client chrome */}
      <div style={{ background: '#f5f5f5', padding: '10px 16px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#FF5F57', display: 'inline-block' }} />
        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#FFBD2E', display: 'inline-block' }} />
        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#28C840', display: 'inline-block' }} />
        <span style={{ marginLeft: '10px', fontSize: '11px', color: '#888', fontFamily: 'monospace' }}>Email Preview</span>
      </div>

      {/* Email metadata */}
      <div style={{ background: '#fafafa', padding: '12px 20px', borderBottom: '1px solid #eee' }}>
        <div style={{ display: 'grid', gap: '4px' }}>
          <div style={{ fontSize: '12px', color: '#888' }}>
            <strong style={{ color: '#333', minWidth: '50px', display: 'inline-block' }}>From:</strong>
            {senderName || 'Navia Markets'} &lt;alert@navia.co.in&gt;
          </div>
          <div style={{ fontSize: '12px', color: '#888' }}>
            <strong style={{ color: '#333', minWidth: '50px', display: 'inline-block' }}>To:</strong>
            MONICKA MURUGAVEL &lt;client@example.com&gt;
          </div>
          <div style={{ fontSize: '13px', color: '#111', fontWeight: '600', marginTop: '4px' }}>
            {filledSubject || '(No subject)'}
          </div>
        </div>
      </div>

      {/* Email body */}
      <div style={{ background: '#f4f6f9', padding: '20px' }}>
        <div style={{ maxWidth: '540px', margin: '0 auto', background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {/* Header */}
          <div style={{ background: '#1B3F7A', padding: '18px 24px' }}>
            <span style={{ color: 'white', fontSize: '18px', fontWeight: '700' }}>Navia Markets</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', float: 'right', marginTop: '4px' }}>
              {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>

          {/* Body */}
          <div style={{ padding: '24px' }}>
            {paragraphs.length > 0 ? paragraphs.map((p, i) => (
              <p key={i} style={{ margin: '0 0 14px 0', fontSize: '14px', color: '#333', lineHeight: '1.7', fontFamily: 'Arial, sans-serif' }}>
                {p}
              </p>
            )) : (
              <p style={{ color: '#aaa', fontStyle: 'italic', fontSize: '13px' }}>Start typing your email body...</p>
            )}
          </div>

          {/* Footer */}
          <div style={{ background: '#f8f9fb', padding: '14px 24px', borderTop: '1px solid #eee', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#aaa', lineHeight: '1.6' }}>
              Navia Markets · SEBI Registered Stock Broker · NSE | BSE | MCX Member
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#bbb' }}>
              This is an automated message. Please do not reply.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const EmailTemplates = () => {
  const [templates, setTemplates]         = useState({});
  const [selected, setSelected]           = useState('optin_client');
  const [form, setForm]                   = useState({ subject: '', sender_name: '', body: '' });
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [testing, setTesting]             = useState(false);
  const [testEmail, setTestEmail]         = useState('');
  const [showTest, setShowTest]           = useState(false);
  const [testClientName, setTestClientName] = useState('');
  const [msg, setMsg]                     = useState('');
  const [preview, setPreview]             = useState(false);

  useEffect(() => { loadTemplates(); }, []); // eslint-disable-line

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin-settings/email-templates');
      const map = {};
      (res.data.templates || []).forEach(t => { map[t.template_key] = t; });
      setTemplates(map);
      loadTemplate('optin_client', map);
    } catch (err) { console.error(err); }
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
        template_key: selected, test_email: testEmail,
        test_client_name: testClientName || null, ...form
      });
      alert(`✅ Test email sent to ${testEmail}`);
      setShowTest(false);
    } catch (err) {
      alert('❌ Failed: ' + (err.response?.data?.message || err.message));
    }
    setTesting(false);
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx3)' }}>Loading templates...</div>;

  const meta = TEMPLATE_META[selected];
  const vars = VARIABLES[selected] || [];

  return (
    <div>
      <div className="ph">
        <h2>Email Templates</h2>
        <p>Configure system-generated emails — opt-in, confirmations, and alerts</p>
      </div>

      {msg && (
        <div className={`alert ${msg === 'success' ? 'a-s' : 'a-d'}`} style={{ marginBottom: '14px' }}>
          {msg === 'success' ? '✓ Template saved successfully' : '✗ Failed to save template'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '16px', alignItems: 'start' }}>

        {/* ── Template list ── */}
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--br)', fontSize: '10px', fontWeight: '700', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Templates
          </div>
          {Object.entries(TEMPLATE_META).map(([key, m]) => (
            <div key={key} onClick={() => loadTemplate(key, null)} style={{
              padding:     '11px 14px',
              cursor:      'pointer',
              borderBottom: '1px solid var(--br)',
              background:  selected === key ? 'var(--ibg)' : 'transparent',
              borderLeft:  `3px solid ${selected === key ? 'var(--ic)' : 'transparent'}`,
              transition:  'all 0.12s',
            }}
            onMouseEnter={e => { if (selected !== key) e.currentTarget.style.background = 'var(--bg2)'; }}
            onMouseLeave={e => { if (selected !== key) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ fontSize: '12px', fontWeight: selected === key ? '600' : '400', color: selected === key ? 'var(--ic)' : 'var(--tx)' }}>
                {m.icon} {m.label}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--tx3)', marginTop: '2px' }}>{m.trigger}</div>
            </div>
          ))}
        </div>

        {/* ── Editor + Preview ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Header */}
          <div className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--tx)' }}>{meta.icon} {meta.label}</div>
                <div style={{ fontSize: '11px', color: 'var(--tx3)', marginTop: '2px' }}>Trigger: {meta.trigger}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setPreview(false)} className={`btn sm ${!preview ? 'bp' : ''}`}>
                  ✏️ Edit
                </button>
                <button onClick={() => setPreview(true)} className={`btn sm ${preview ? 'bp' : ''}`}>
                  👁 Preview
                </button>
              </div>
            </div>
          </div>

          {preview ? (
            /* ── Preview ── */
            <div>
              {renderPreviewHtml(form.subject, form.sender_name, form.body)}
            </div>
          ) : (
            /* ── Editor ── */
            <div className="panel">
              {/* Variables */}
              <div style={{ background: 'var(--bg2)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: '16px', border: '1px solid var(--br)' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  Available Variables — click to insert
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {vars.map(v => (
                    <span key={v}
                      onClick={() => setForm(f => ({ ...f, body: f.body + v }))}
                      style={{ background: 'var(--ibg)', color: 'var(--ic)', padding: '3px 9px', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace', cursor: 'pointer', border: '1px solid var(--brand-border)', fontWeight: '500' }}>
                      {v}
                    </span>
                  ))}
                </div>
              </div>

              {/* Fields */}
              <div style={{ display: 'grid', gap: '14px' }}>
                <div className="fgrp">
                  <label>Subject Line</label>
                  <input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Email subject..." />
                </div>
                <div className="fgrp">
                  <label>Sender Name</label>
                  <input value={form.sender_name} onChange={e => setForm({ ...form, sender_name: e.target.value })} placeholder="e.g. Navia Markets — Client Services" />
                </div>
                <div className="fgrp">
                  <label>Email Body</label>
                  <textarea
                    value={form.body}
                    onChange={e => setForm({ ...form, body: e.target.value })}
                    style={{ minHeight: '200px', resize: 'vertical', lineHeight: '1.6' }}
                    placeholder="Write your email body here. Use variables like {client_name} which will be replaced automatically. Press Enter for new lines."
                  />
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={saveTemplate} disabled={saving} className="btn bp">
                  {saving ? '⏳ Saving...' : '💾 Save Template'}
                </button>
                <button onClick={() => { setShowTest(!showTest); setPreview(false); }} className="btn">
                  📤 Send Test Email
                </button>
              </div>

              {/* Test panel */}
              {showTest && (
                <div style={{ marginTop: '14px', background: 'var(--bg2)', borderRadius: 'var(--r2)', padding: '16px', border: '1px solid var(--br)' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--tx)', marginBottom: '12px' }}>Send Test Email</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div className="fgrp">
                      <label>Test Email Address</label>
                      <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="your@email.com" />
                    </div>
                    <div className="fgrp">
                      <label>Client Name (replaces {'{client_name}'})</label>
                      <input value={testClientName} onChange={e => setTestClientName(e.target.value)} placeholder="e.g. MONICKA MURUGAVEL" />
                    </div>
                  </div>
                  <div className="alert a-i" style={{ marginBottom: '10px' }}>
                    Variables will be replaced with test values. The email will arrive formatted with the Navia HTML template.
                  </div>
                  <button onClick={sendTest} disabled={testing} className="btn bp">
                    {testing ? '⏳ Sending...' : '📤 Send Test'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailTemplates;