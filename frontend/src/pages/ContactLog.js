import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const typeIcon  = { call: '📞', whatsapp: '💬', email: '📧', meeting: '🤝', note: '📝' };
const typeColor = { call: '#185fa5', whatsapp: '#25D366', email: '#e67e22', meeting: '#8e44ad', note: '#888' };
const outcomeColor = {
  interested:     { bg: '#eaf3de', color: '#3b6d11' },
  not_interested: { bg: '#fcebeb', color: '#a32d2d' },
  callback:       { bg: '#faeeda', color: '#854f0b' },
  converted:      { bg: '#d4edda', color: '#1e7e34' },
  no_answer:      { bg: '#f5f5f5', color: '#888' },
  sent:           { bg: '#e8f3ff', color: '#185fa5' },
  initiated:      { bg: '#e8f3ff', color: '#185fa5' },
};

const ContactLog = () => {
  const [logs, setLogs]         = useState([]);
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [waSending, setWaSending] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [filter, setFilter]     = useState('all');
  const [form, setForm]         = useState({
    ucc: '', interaction_type: 'call', outcome: 'interested', notes: '', follow_up_date: ''
  });
  const [msg, setMsg] = useState('');
  const navigate = useNavigate();

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [logsRes, clientsRes] = await Promise.all([
        api.get('/contact-logs'),
        api.get('/clients/my/clients')
      ]);
      setLogs(logsRes.data || []);
      setClients(clientsRes.data || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const saveInteraction = async () => {
    if (!form.ucc) return setMsg('❌ Please select a client');
    setSaving(true); setMsg('');
    try {
      await api.post('/contact-logs', form);
      setMsg('✅ Interaction saved');
      setForm({ ucc: '', interaction_type: 'call', outcome: 'interested', notes: '', follow_up_date: '' });
      loadAll();
    } catch (e) { setMsg('❌ ' + (e.response?.data?.message || e.message)); }
    setSaving(false);
    setTimeout(() => setMsg(''), 4000);
  };

  const sendWhatsApp = async () => {
    if (!form.ucc) return setMsg('❌ Please select a client first');
    setWaSending(true); setMsg('');
    try {
      await api.post('/whatsapp/send', { ucc: form.ucc, template_name: 'aadhar_nc' });
      setMsg('✅ WhatsApp sent successfully');
      loadAll();
    } catch (e) { setMsg('❌ WhatsApp: ' + (e.response?.data?.message || e.message)); }
    setWaSending(false);
    setTimeout(() => setMsg(''), 4000);
  };

  const sendEmail = async (templateKey) => {
    if (!form.ucc) return setMsg('❌ Please select a client first');
    setEmailSending(true); setMsg('');
    try {
  await api.post('/email/send', {
      ucc: form.ucc,
      subject: 'Your Relationship Manager at Navia Markets',
      body: 'Dear {client_name},\n\nYour dedicated Relationship Manager at Navia Markets is reaching out to you.\n\nWe are here to assist you with your investment goals and trading queries. Please feel free to contact us at {rm_phone}.\n\nWarm regards,\nNavia Markets'
    });
      setMsg('✅ Email sent successfully');
      loadAll();
    } catch (e) { setMsg('❌ Email: ' + (e.response?.data?.message || e.message)); }
    setEmailSending(false);
    setTimeout(() => setMsg(''), 4000);
  };

  const filteredLogs = filter === 'all' ? logs : logs.filter(l => l.interaction_type === filter);

  const inp = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '7px', fontSize: '13px', width: '100%', boxSizing: 'border-box', outline: 'none', height: '36px' };
  const lbl = { display: 'block', fontSize: '11px', fontWeight: '600', color: '#666', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.3px' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '7px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', color: '#555' }}>← Back</button>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#111', margin: 0 }}>Contact & Log</h2>
          <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Log client interactions and send messages</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '16px', alignItems: 'start' }}>

        {/* Left Panel — Log Form */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden', position: 'sticky', top: '20px' }}>
          <div style={{ background: '#223872', padding: '14px 18px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'white' }}>➕ Log Interaction</div>
          </div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

            <div>
              <label style={lbl}>Client</label>
              <select value={form.ucc} onChange={e => setForm({ ...form, ucc: e.target.value })} style={inp}>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.ucc} value={c.ucc}>{c.name} — {c.ucc}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>Type</label>
                <select value={form.interaction_type} onChange={e => setForm({ ...form, interaction_type: e.target.value })} style={inp}>
                  <option value="call">📞 Call</option>
                  <option value="whatsapp">💬 WhatsApp</option>
                  <option value="email">📧 Email</option>
                  <option value="meeting">🤝 Meeting</option>
                  <option value="note">📝 Note</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Outcome</label>
                <select value={form.outcome} onChange={e => setForm({ ...form, outcome: e.target.value })} style={inp}>
                  <option value="interested">Interested</option>
                  <option value="not_interested">Not Interested</option>
                  <option value="callback">Callback</option>
                  <option value="converted">Converted</option>
                  <option value="no_answer">No Answer</option>
                </select>
              </div>
            </div>

            <div>
              <label style={lbl}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="What was discussed..."
                style={{ ...inp, height: 'auto', minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            <div>
              <label style={lbl}>Follow-up Date</label>
              <input type="date" value={form.follow_up_date} onChange={e => setForm({ ...form, follow_up_date: e.target.value })} style={inp} />
            </div>

            <button onClick={saveInteraction} disabled={saving}
              style={{ padding: '10px', background: saving ? '#94a3b8' : '#223872', color: 'white', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>
              {saving ? 'Saving...' : '💾 Save Interaction'}
            </button>

            {/* Quick Send Buttons */}
            <div style={{ borderTop: '1px solid #eee', paddingTop: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', marginBottom: '8px' }}>Quick Send</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button onClick={sendWhatsApp} disabled={waSending}
                  style={{ padding: '8px', background: '#25D366', color: 'white', border: 'none', borderRadius: '7px', cursor: waSending ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600', opacity: waSending ? 0.7 : 1 }}>
                  {waSending ? '⏳...' : '💬 WhatsApp'}
                </button>
                <button onClick={() => sendEmail('optin_client')} disabled={emailSending}
                  style={{ padding: '8px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '7px', cursor: emailSending ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600', opacity: emailSending ? 0.7 : 1 }}>
                  {emailSending ? '⏳...' : '📧 Email'}
                </button>
              </div>
            </div>

            {msg && (
              <div style={{ padding: '8px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: '500',
                background: msg.startsWith('✅') ? '#eaf3de' : '#fcebeb',
                color: msg.startsWith('✅') ? '#3b6d11' : '#a32d2d' }}>
                {msg}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel — Interaction History */}
        <div>
          {/* Filter Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {['all', 'call', 'whatsapp', 'email', 'meeting'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: '6px 14px', borderRadius: '20px', border: '1px solid ' + (filter === f ? '#223872' : '#ddd'),
                  background: filter === f ? '#223872' : 'white', color: filter === f ? 'white' : '#555',
                  cursor: 'pointer', fontSize: '12px', fontWeight: filter === f ? '600' : '400' }}>
                {f === 'all' ? 'All' : typeIcon[f] + ' ' + f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#888', alignSelf: 'center' }}>{filteredLogs.length} interactions</span>
          </div>

          {/* Interaction Cards */}
          {filteredLogs.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#888', border: '1px solid #eee' }}>
              No interactions found
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredLogs.map((log, i) => {
                const oc = outcomeColor[log.outcome] || { bg: '#f5f5f5', color: '#888' };
                const tc = typeColor[log.interaction_type] || '#888';
                return (
                  <div key={i} style={{ background: 'white', borderRadius: '10px', padding: '14px 16px', border: '1px solid #eee', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    {/* Icon */}
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: tc + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
                      {typeIcon[log.interaction_type] || '📋'}
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <div>
                          <span style={{ fontWeight: '600', fontSize: '13px', color: '#111' }}>{log.client_name || '—'}</span>
                          <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>{log.interaction_type}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                          <span style={{ background: oc.bg, color: oc.color, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                            {log.outcome}
                          </span>
                          <span style={{ fontSize: '11px', color: '#aaa' }}>
                            {log.created_at ? new Date(new Date(log.created_at).getTime() + (5.5 * 60 * 60 * 1000)).toLocaleString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true }) : '—'}
                          </span>
                        </div>
                      </div>
                      {log.notes && <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{log.notes}</div>}
                      {log.follow_up_date && (
                        <div style={{ fontSize: '11px', color: '#854f0b', background: '#faeeda', display: 'inline-block', padding: '1px 8px', borderRadius: '8px' }}>
                          📅 Follow-up: {new Date(log.follow_up_date).toLocaleDateString('en-IN')}
                        </div>
                      )}
                    </div>
                    {/* Quick Actions */}
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button onClick={() => { setForm(f => ({ ...f, ucc: log.ucc })); setTimeout(sendWhatsApp, 100); }}
                        style={{ padding: '4px 8px', background: '#e8f5e9', color: '#25D366', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>
                        💬
                      </button>
                      <button onClick={() => { setForm(f => ({ ...f, ucc: log.ucc })); sendEmail(); }}
                        style={{ padding: '4px 8px', background: '#fef3e2', color: '#e67e22', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>
                        📧
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactLog;