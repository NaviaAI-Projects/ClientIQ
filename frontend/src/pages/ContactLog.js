import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const ContactLog = () => {
  const [search, setSearch]   = useState('');
  const [form, setForm]       = useState({ type:'Phone call (personal)', outcome:'Connected — interested', datetime:'', duration:'', notes:'', state_update:'— No change —' });
  const [history, setHistory] = useState([]);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [selectedUcc, setSelectedUcc] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (selectedUcc) {
      api.get(`/contact-logs?ucc=${selectedUcc}&limit=5`).then(r => setHistory(r.data||[])).catch(console.error);
    }
  }, [selectedUcc]);

  const handleSave = async () => {
    if (!selectedUcc) return alert('Please select a client first');
    setSaving(true);
    try {
      await api.post('/contact-logs', { ucc: selectedUcc, ...form });
      setSaved(true);
      setForm({ type:'Phone call (personal)', outcome:'Connected — interested', datetime:'', duration:'', notes:'', state_update:'— No change —' });
      setTimeout(() => setSaved(false), 3000);
      // Refresh history
      api.get(`/contact-logs?ucc=${selectedUcc}&limit=5`).then(r => setHistory(r.data||[])).catch(console.error);
    } catch (e) { alert('Error saving interaction'); }
    finally { setSaving(false); }
  };

  const iconMap = { 'Phone call (personal)':'📞', 'Click-to-call':'📞', 'Email':'✉️', 'WhatsApp':'💬', 'Meeting':'🤝' };

  return (
    <div>
      <div className="ph"><h2>Contact &amp; log</h2><p>Reach out to leads and mapped clients — every interaction is logged</p></div>
      <div className="tc2">
        {/* Select client & contact */}
        <div className="panel">
          <div className="ptitle">🔍 Select client / lead</div>
          <div className="fgrid fg2">
            <div className="fgrp"><label>Search UCC or name</label>
              <input placeholder="e.g. NV20031 or Faiz…" value={search} onChange={e => setSearch(e.target.value)} onBlur={() => setSelectedUcc(search.split(' ')[0])} />
            </div>
            <div className="fgrp"><label>Type</label>
              <select><option>Lead</option><option>Mapped client</option></select>
            </div>
          </div>
          <div className="ptitle">📞 Contact methods</div>
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            <button className="btn" onClick={() => alert('Fetching mobile via API…\nClick-to-call initiated on 1600 series')}>📞 Click-to-call (1600 series)</button>
            <button className="btn" onClick={() => alert('Fetching email via API…\nOpening email composer')}>✉️ Send email (personal RM)</button>
            <button className="btn" onClick={() => alert('Sending WhatsApp template via BSP API…')}>💬 Send WhatsApp template</button>
          </div>
          <div className="alert a-i" style={{marginTop:'10px'}}>🔒 Mobile &amp; email fetched at runtime — never stored</div>
        </div>

        {/* Log interaction */}
        <div className="panel">
          <div className="ptitle">✏️ Log interaction</div>
          <div className="fgrid fg2">
            <div className="fgrp"><label>Type</label>
              <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
                <option>Phone call (personal)</option><option>Click-to-call</option><option>Email</option><option>WhatsApp</option><option>Meeting</option>
              </select>
            </div>
            <div className="fgrp"><label>Outcome</label>
              <select value={form.outcome} onChange={e=>setForm({...form,outcome:e.target.value})}>
                <option>Connected — interested</option><option>Connected — not interested</option><option>No answer</option><option>Call back requested</option>
              </select>
            </div>
            <div className="fgrp"><label>Date &amp; time</label><input type="datetime-local" value={form.datetime} onChange={e=>setForm({...form,datetime:e.target.value})} /></div>
            <div className="fgrp"><label>Duration (mins)</label><input type="number" placeholder="0" min="0" value={form.duration} onChange={e=>setForm({...form,duration:e.target.value})} /></div>
          </div>
          <div className="fgrp" style={{marginBottom:'10px'}}><label>Notes</label>
            <textarea placeholder="Client interested in MTF facility. Will send email." value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />
          </div>
          <div className="fgrp" style={{marginBottom:'12px'}}><label>Update lead state</label>
            <select value={form.state_update} onChange={e=>setForm({...form,state_update:e.target.value})}>
              <option>— No change —</option><option>Mark as interested</option><option>Mark as not interested</option>
            </select>
          </div>
          <button className="btn bp" onClick={handleSave} disabled={saving}>
            {saving?'Saving…':saved?'✅ Saved!':'💾 Save interaction'}
          </button>
        </div>
      </div>

      {/* Interaction history */}
      {(history.length > 0 || selectedUcc) && (
        <div className="panel">
          <div className="ptitle">🕐 Recent interactions — {selectedUcc}</div>
          {history.length === 0 ? (
            <div style={{padding:'20px',textAlign:'center',color:'var(--tx3)'}}>No interactions logged yet</div>
          ) : (
            <ul style={{listStyle:'none'}}>
              {history.map((h,i) => (
                <li key={i} style={{display:'flex',gap:'12px',padding:'8px 0',borderBottom:'0.5px solid var(--br)'}}>
                  <div style={{width:'28px',height:'28px',borderRadius:'50%',background:'var(--ibg)',color:'var(--ic)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',flexShrink:0}}>
                    {iconMap[h.type]||'📝'}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'12.5px',fontWeight:'500'}}>{h.type} — {h.outcome}</div>
                    <div style={{fontSize:'11px',color:'var(--tx2)'}}>{h.interaction_date?new Date(h.interaction_date).toLocaleString('en-IN'):''}</div>
                    {h.notes && <div style={{fontSize:'12px',marginTop:'3px',color:'var(--tx2)'}}>{h.notes}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
export default ContactLog;
