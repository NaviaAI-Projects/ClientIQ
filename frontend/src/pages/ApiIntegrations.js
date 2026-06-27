import React, { useState, useEffect } from 'react';
import api from '../api';

const ApiIntegrations = () => {
  const [settings, setSettings] = useState({
    click_to_call_url: '', click_to_call_key: '', caller_id: '', mobile_fetch_url: '',
    whatsapp_url: '', whatsapp_key: '', whatsapp_sender: '', whatsapp_namespace: '',
    email_url: '', email_key: '', email_from: '', smtp_host: '',
    anthropic_key: '', anthropic_model: 'claude-sonnet-4-6', digest_time: '07:30'
  });
  const [loading, setLoading] = useState(true);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    // Fix: use /admin-settings not /admin-settings/integrations
    api.get('/admin-settings')
      .then(res => {
        const s = res.data.data || {};
        setSettings(prev => ({
          ...prev,
          click_to_call_url:   s.click_to_call_url   || '',
          click_to_call_key:   s.click_to_call_key   || '',
          caller_id:           s.caller_id            || '',
          mobile_fetch_url:    s.mobile_fetch_url     || '',
          whatsapp_url:        s.whatsapp_url         || '',
          whatsapp_key:        s.whatsapp_key         || '',
          whatsapp_sender:     s.whatsapp_sender      || '',
          whatsapp_namespace:  s.whatsapp_namespace   || '',
          email_url:           s.email_url            || '',
          email_key:           s.email_key            || '',
          email_from:          s.email_from           || '',
          smtp_host:           s.smtp_host            || '',
          anthropic_key:       s.anthropic_key        || '',
          anthropic_model:     s.anthropic_model      || 'claude-sonnet-4-6',
          digest_time:         s.digest_time          || '07:30',
        }));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const set = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  const saveSection = async (keys) => {
    try {
      const payload = {};
      keys.forEach(k => { payload[k] = settings[k]; });
      await api.put('/admin-settings', payload);
      setSaveMsg('Saved successfully');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch {
      setSaveMsg('Save failed');
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  const inputStyle    = { padding: '7px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '12.5px', width: '100%', boxSizing: 'border-box' };
  const labelStyle    = { display: 'block', fontSize: '10px', fontWeight: '600', color: '#555', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.4px' };
  const panelStyle    = { background: 'white', borderRadius: '10px', padding: '20px', border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: '14px' };
  const btnPrimary    = { padding: '7px 14px', background: '#223872', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', marginRight: '8px' };
  const btnSecondary  = { padding: '7px 14px', background: 'white', color: '#223872', border: '0.5px solid #223872', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>API Integrations</h2>
      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Vendor-agnostic — configure endpoint + key for your chosen provider</p>

      <div style={{ background: '#e8f3ff', padding: '10px 14px', borderRadius: '8px', color: '#185fa5', fontSize: '12.5px', margin: '14px 0' }}>
        🔒 Mobile numbers and email addresses are NEVER stored in this system. They are fetched at runtime via the APIs below, used for the interaction, and discarded immediately.
      </div>

      {saveMsg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px',
          background: saveMsg.includes('failed') ? '#fcebeb' : '#eaf3de',
          color:      saveMsg.includes('failed') ? '#a32d2d' : '#3b6d11' }}>
          {saveMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

        {/* Click-to-call */}
        <div style={panelStyle}>
          <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>📞 Click-to-call</div>
          <p style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>Compatible with Doocti, Exotel, Ozonetel, MCUBE, or any REST provider</p>
          <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
            {[
              ['API Endpoint URL',          'click_to_call_url', 'url',      'https://api-naviasp.doocti.com/api/v2/call'],
              ['API Key',                   'click_to_call_key', 'password', 'Bearer token…'],
              ['Caller ID',                 'caller_id',         'text',     '8244784278'],
              ['Mobile Fetch API Endpoint', 'mobile_fetch_url',  'url',      'Leave blank — Sharepro used automatically'],
            ].map(([label, key, type, ph]) => (
              <div key={key}>
                <label style={labelStyle}>{label}</label>
                <input type={type} value={settings[key] || ''} onChange={e => set(key, e.target.value)}
                  placeholder={ph} style={inputStyle} />
              </div>
            ))}
          </div>
          <button style={btnPrimary} onClick={() => saveSection(['click_to_call_url','click_to_call_key','caller_id','mobile_fetch_url'])}>Save</button>
          <button style={btnSecondary} onClick={async () => {
            try {
              const res = await api.get('/calls/test');
              alert(res.data.message);
            } catch (err) {
              alert('Test failed: ' + (err.response?.data?.message || err.message));
            }
          }}>Test</button>
        </div>

        {/* WhatsApp */}
        <div style={panelStyle}>
          <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>💬 WhatsApp Business API</div>
          <p style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>Compatible with Gupshup, Kaleyra, Interakt, or any WABA BSP</p>
          <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
            {[
              ['BSP API Endpoint',       'whatsapp_url',       'url',      'https://api.gupshup.io/sm/api/v1/msg'],
              ['API Key / Bearer Token', 'whatsapp_key',       'password', '…'],
              ['Sender WhatsApp Number', 'whatsapp_sender',    'text',     '+91XXXXXXXXXX'],
              ['Template Namespace',     'whatsapp_namespace', 'text',     'navia_crm_msgs'],
            ].map(([label, key, type, ph]) => (
              <div key={key}>
                <label style={labelStyle}>{label}</label>
                <input type={type} value={settings[key] || ''} onChange={e => set(key, e.target.value)}
                  placeholder={ph} style={inputStyle} />
              </div>
            ))}
          </div>
          <button style={btnPrimary} onClick={() => saveSection(['whatsapp_url','whatsapp_key','whatsapp_sender','whatsapp_namespace'])}>Save</button>
          <button style={btnSecondary} onClick={() => alert('Test WhatsApp API')}>Test</button>
        </div>

        {/* Email */}
        <div style={panelStyle}>
          <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>📧 Email & Mobile Fetch API</div>
          <p style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>Fetches client email and mobile at runtime. Not stored.</p>
          <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
            {[
              ['Email Fetch API Endpoint', 'email_url',  'url',      'https://api.navia.in/client/email/{ucc}'],
              ['API Key',                  'email_key',  'password', '…'],
              ['Lead Email Sender',        'email_from', 'email',    'leads@navia.in'],
              ['SMTP Host (for sending)',  'smtp_host',  'text',     'smtp.navia.in'],
            ].map(([label, key, type, ph]) => (
              <div key={key}>
                <label style={labelStyle}>{label}</label>
                <input type={type} value={settings[key] || ''} onChange={e => set(key, e.target.value)}
                  placeholder={ph} style={inputStyle} />
              </div>
            ))}
          </div>
          <button style={btnPrimary} onClick={() => saveSection(['email_url','email_key','email_from','smtp_host'])}>Save</button>
          <button style={btnSecondary} onClick={() => alert('Test email API')}>Test</button>
        </div>

        {/* Claude AI */}
        <div style={panelStyle}>
          <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>🤖 Claude AI (Anthropic)</div>
          <p style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>Powers AI scoring, daily digests, churn alerts, cross-sell recommendations</p>
          <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Anthropic API Key</label>
              <input type="password" value={settings.anthropic_key || ''} onChange={e => set('anthropic_key', e.target.value)}
                placeholder="sk-ant-…" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Model</label>
              <select value={settings.anthropic_model || 'claude-sonnet-4-6'} onChange={e => set('anthropic_model', e.target.value)} style={inputStyle}>
                <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                <option value="claude-opus-4-6">claude-opus-4-6</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Daily Digest Send Time</label>
              <input type="time" value={settings.digest_time || '07:30'} onChange={e => set('digest_time', e.target.value)} style={inputStyle} />
            </div>
          </div>
          <button style={btnPrimary} onClick={() => saveSection(['anthropic_key','anthropic_model','digest_time'])}>Save</button>
          <button style={btnSecondary} onClick={() => alert('Test Anthropic connection')}>Test</button>
        </div>

      </div>
    </div>
  );
};

export default ApiIntegrations;