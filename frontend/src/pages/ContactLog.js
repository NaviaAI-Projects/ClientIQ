import React, { useEffect, useState } from 'react';
import api from '../api';

const TEMPLATES = [
  { name: 'aadhar_nc',           label: 'Aadhaar KYC Reminder' },
  { name: 'optin_lead',          label: 'Lead Opt-in Message' },
  { name: 'dormant_reactivate',  label: 'Dormant Reactivation' },
];

const ContactLog = () => {
  const [logs, setLogs]             = useState([]);
  const [clients, setClients]       = useState([]);
  const [loading, setLoading]       = useState(true);

  // Log form
  const [form, setForm] = useState({
    ucc: '', client_name: '', interaction_type: 'call',
    notes: '', outcome: 'interested', follow_up_date: ''
  });
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // WhatsApp modal
  const [waModal, setWaModal]         = useState(null); // { ucc, client_name }
  const [waTemplate, setWaTemplate]   = useState('aadhar_nc');
  const [waSending, setWaSending]     = useState(false);
  const [waMsg, setWaMsg]             = useState('');

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
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // Submit new log
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setSaveMsg('');
    try {
      await api.post('/contact-logs', form);
      setSaveMsg('success');
      setForm({ ucc: '', client_name: '', interaction_type: 'call', notes: '', outcome: 'interested', follow_up_date: '' });
      loadAll();
    } catch (err) {
      setSaveMsg('error');
    } finally { setSaving(false); }
  };

  // Send WhatsApp
  const sendWhatsApp = async () => {
    setWaSending(true); setWaMsg('');
    try {
      const res = await api.post('/whatsapp/send', {
        ucc:           waModal.ucc,
        template_name: waTemplate
      });
      setWaMsg('success');
      // Auto-log the WhatsApp interaction
      await api.post('/contact-logs', {
        ucc:              waModal.ucc,
        client_name:      waModal.client_name,
        interaction_type: 'whatsapp',
        notes:            `WhatsApp template "${waTemplate}" sent`,
        outcome:          'sent'
      });
      loadAll();
      setTimeout(() => { setWaModal(null); setWaMsg(''); }, 2000);
    } catch (err) {
      setWaMsg('error: ' + (err.response?.data?.message || err.message));
    } finally { setWaSending(false); }
  };

  const inp = { padding: '7px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '100%', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: '11px', fontWeight: '600', color: '#666', marginBottom: '4px' };

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600' }}>Contact & Log</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>Log client interactions and send WhatsApp messages</p>

      {/* LOG NEW INTERACTION */}
      <div style={{ background: 'white', borderRadius: '10px', padding: '20px', border: '1px solid #eee', marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '14px' }}>➕ Log New Interaction</div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={lbl}>Client</label>
              <select value={form.ucc} onChange={e => {
                const c = clients.find(cl => cl.ucc === e.target.value);
                setForm({ ...form, ucc: e.target.value, client_name: c?.name || '' });
              }} style={inp} required>
                <option value="">Select client</option>
                {clients.map(c => (
                  <option key={c.ucc} value={c.ucc}>{c.ucc} — {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Interaction Type</label>
              <select value={form.interaction_type} onChange={e => setForm({ ...form, interaction_type: e.target.value })} style={inp}>
                <option value="call">Call</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="meeting">Meeting</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Outcome</label>
              <select value={form.outcome} onChange={e => setForm({ ...form, outcome: e.target.value })} style={inp}>
                <option value="interested">Interested</option>
                <option value="not_interested">Not Interested</option>
                <option value="callback">Callback Requested</option>
                <option value="converted">Converted</option>
                <option value="no_answer">No Answer</option>
                <option value="sent">Sent</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={lbl}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="What was discussed..." style={{ ...inp, minHeight: '60px', resize: 'vertical' }} />
            </div>
            <div>
              <label style={lbl}>Follow-up Date</label>
              <input type="date" value={form.follow_up_date} onChange={e => setForm({ ...form, follow_up_date: e.target.value })} style={inp} />
            </div>
          </div>

          {/* WhatsApp quick send */}
          {form.ucc && (
            <div style={{ background: '#f0f8f0', border: '1px solid #c3e6c3', borderRadius: '8px', padding: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', color: '#2d6a2d', fontWeight: '500' }}>💬 Also send WhatsApp to this client?</span>
              <button type="button"
                onClick={() => {
                  const c = clients.find(cl => cl.ucc === form.ucc);
                  setWaModal({ ucc: form.ucc, client_name: c?.name || form.ucc });
                }}
                style={{ padding: '5px 12px', background: '#25D366', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                Send WhatsApp
              </button>
            </div>
          )}

          {saveMsg && (
            <div style={{ padding: '8px 12px', borderRadius: '6px', marginBottom: '10px', fontSize: '13px',
              background: saveMsg === 'success' ? '#eaf3de' : '#fcebeb',
              color: saveMsg === 'success' ? '#3b6d11' : '#a32d2d' }}>
              {saveMsg === 'success' ? '✓ Interaction logged successfully' : '✗ Failed to save'}
            </div>
          )}

          <button type="submit" disabled={saving}
            style={{ padding: '8px 18px', background: saving ? '#94a3b8' : '#223872', color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>
            {saving ? 'Saving...' : '💾 Save Interaction'}
          </button>
        </form>
      </div>

      {/* INTERACTION HISTORY */}
      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #eee', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', fontSize: '14px', fontWeight: '600' }}>
          Interaction History
        </div>
        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#888' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                {['Date', 'Client', 'Type', 'Notes', 'Outcome', 'Action'].map(h => (
                  <th key={h} style={{ borderBottom: '1px solid #eee', textAlign: 'left', padding: '10px 14px', fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', background: '#fafafa' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: '30px', textAlign: 'center', color: '#888' }}>No interactions logged yet</td></tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '10px 14px', color: '#888', fontSize: '12px' }}>
                      {log.created_at ? new Date(log.created_at).toLocaleDateString('en-IN') : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: '600' }}>{log.client_name}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                        background: log.interaction_type === 'call' ? '#e8f0ff' : log.interaction_type === 'whatsapp' ? '#e8f8e8' : '#fff3e0',
                        color: log.interaction_type === 'call' ? '#223872' : log.interaction_type === 'whatsapp' ? '#25D366' : '#e65100'
                      }}>
                        {log.interaction_type === 'call' ? '📞' : log.interaction_type === 'whatsapp' ? '💬' : '📧'} {log.interaction_type}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#555', maxWidth: '250px' }}>{log.notes}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: '#f5f5f5', color: '#555' }}>
                        {log.outcome || '-'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {log.ucc && (
                        <button
                          onClick={() => setWaModal({ ucc: log.ucc, client_name: log.client_name })}
                          style={{ padding: '4px 10px', background: '#25D366', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>
                          💬 WhatsApp
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* WHATSAPP MODAL */}
      {waModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '460px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', margin: 0 }}>
                💬 Send WhatsApp — {waModal.client_name}
              </h3>
              <button onClick={() => { setWaModal(null); setWaMsg(''); }}
                style={{ background: '#f5f5f5', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', fontSize: '14px' }}>✕</button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Select Template</label>
              <select value={waTemplate} onChange={e => setWaTemplate(e.target.value)} style={inp}>
                {TEMPLATES.map(t => (
                  <option key={t.name} value={t.name}>{t.label}</option>
                ))}
              </select>
            </div>

            <div style={{ background: '#f0f8f0', border: '1px solid #c3e6c3', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '12px', color: '#2d6a2d' }}>
              ✓ Message will be sent to {waModal.client_name}'s registered mobile via 360dialog WhatsApp API. Mobile fetched from Sharepro at runtime.
            </div>

            {waMsg && (
              <div style={{ padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px',
                background: waMsg === 'success' ? '#eaf3de' : '#fcebeb',
                color: waMsg === 'success' ? '#3b6d11' : '#a32d2d' }}>
                {waMsg === 'success' ? '✅ WhatsApp message sent successfully!' : `❌ ${waMsg}`}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={sendWhatsApp} disabled={waSending}
                style={{ flex: 1, padding: '10px', background: waSending ? '#94a3b8' : '#25D366', color: 'white', border: 'none', borderRadius: '7px', cursor: waSending ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>
                {waSending ? '⏳ Sending...' : '💬 Send WhatsApp'}
              </button>
              <button onClick={() => { setWaModal(null); setWaMsg(''); }}
                style={{ padding: '10px 20px', background: 'white', color: '#555', border: '1px solid #ddd', borderRadius: '7px', cursor: 'pointer', fontSize: '13px' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactLog;