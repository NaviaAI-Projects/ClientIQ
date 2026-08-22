import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api';

const ContactLog = () => {
  const [search, setSearch]   = useState('');
  const [form, setForm]       = useState({ type:'Phone call (personal)', outcome:'Connected — interested', datetime:'', duration:'', notes:'', state_update:'— No change —', follow_up:'', follow_up_time:'' });
  const [history, setHistory] = useState([]);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [selectedUcc, setSelectedUcc] = useState('');
  const [selName, setSelName] = useState('');
  const [selKind, setSelKind] = useState('');
  const [options, setOptions] = useState([]);   // the RM's own clients + leads
  const [open, setOpen]       = useState(false); // dropdown visibility
  const navigate = useNavigate();
  const location = useLocation();

  // Load the RM's mapped clients + assigned leads into one searchable list.
  useEffect(() => {
    Promise.allSettled([api.get('/clients/my/clients'), api.get('/leads/my')])
      .then(([c, l]) => {
        const clients = (c.status === 'fulfilled' ? c.value.data : []) || [];
        const leads   = (l.status === 'fulfilled' ? l.value.data : []) || [];
        const map = {};
        clients.forEach(x => { const u = String(x.ucc || ''); if (u) map[u] = { ucc: u, name: x.name || x.client_name || '', kind: 'Client' }; });
        leads.forEach(x   => { const u = String(x.ucc || ''); if (u && !map[u]) map[u] = { ucc: u, name: x.client_name || x.name || '', kind: 'Lead' }; });
        setOptions(Object.values(map).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      })
      .catch(console.error);
  }, []);

  // Pre-fill the client when arriving from another page (Cross-sell "Pitch",
  // Assigned Leads "Log", dashboard "Contact", etc. pass { state: { ucc, name } }).
  useEffect(() => {
    const s = location.state;
    if (s && s.ucc) { setSelectedUcc(String(s.ucc)); setSelName(s.name || ''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Once the list loads, enrich the selected client's name/kind (e.g. after a pre-fill).
  useEffect(() => {
    if (!selectedUcc) return;
    const o = options.find(x => x.ucc === selectedUcc);
    if (o) { if (!selName) setSelName(o.name); setSelKind(o.kind); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, selectedUcc]);

  const pickClient = (o) => { setSelectedUcc(o.ucc); setSelName(o.name); setSelKind(o.kind); setSearch(''); setOpen(false); };
  const clearClient = () => { setSelectedUcc(''); setSelName(''); setSelKind(''); setSearch(''); setHistory([]); };

  const q = search.trim().toLowerCase();
  const filtered = (!q ? options : options.filter(o => o.ucc.toLowerCase().includes(q) || (o.name || '').toLowerCase().includes(q))).slice(0, 60);

  useEffect(() => {
    if (selectedUcc) {
      api.get(`/contact-logs?ucc=${selectedUcc}&limit=5`).then(r => setHistory(r.data||[])).catch(console.error);
    }
  }, [selectedUcc]);

  const handleSave = async () => {
    if (!selectedUcc) return alert('Please select a client first');
    setSaving(true);
    try {
      await api.post('/contact-logs', { ucc: selectedUcc, ...form, follow_up_date: form.follow_up || null, follow_up_time: form.follow_up_time || null });
      setSaved(true);
      setForm({ type:'Phone call (personal)', outcome:'Connected — interested', datetime:'', duration:'', notes:'', state_update:'— No change —', follow_up:'', follow_up_time:'' });
      setTimeout(() => setSaved(false), 3000);
      // Refresh history
      api.get(`/contact-logs?ucc=${selectedUcc}&limit=5`).then(r => setHistory(r.data||[])).catch(console.error);
    } catch (e) { alert('Error saving interaction'); }
    finally { setSaving(false); }
  };

  // Real SmartFlo click-to-call for the selected client (same flow as To Call Today /
  // Assigned Leads): POST /calls/click-to-call { ucc }. Refreshes history so the logged call shows.
  const callClient = async () => {
    if (!selectedUcc) return alert('Select a client first (search by UCC or name).');
    if (!window.confirm(`Start a click-to-call with ${selName || selectedUcc}?\nThe client is called first, then you are connected.`)) return;
    try {
      const res = await api.post('/calls/click-to-call', { ucc: selectedUcc });
      alert(res.data?.message || 'Call initiated.');
      api.get(`/contact-logs?ucc=${selectedUcc}&limit=5`).then(r => setHistory(r.data||[])).catch(()=>{});
    } catch (e) {
      alert(e.response?.data?.message || 'Could not place the call. Check the client mobile and your SmartFlo setup.');
    }
  };

  const iconMap = { 'Phone call (personal)':'📞', 'Click-to-call':'📞', 'Email':'✉️', 'WhatsApp':'💬', 'Meeting':'🤝' };

  return (
    <div>
      <div className="ph"><h2>Contact &amp; log</h2><p>Reach out to leads and mapped clients — every interaction is logged</p></div>
      <div className="tc2">
        {/* Select client & contact */}
        <div className="panel">
          <div className="ptitle">🔍 Select client / lead</div>
          <div className="fgrp" style={{position:'relative',marginBottom:'12px'}}>
            <label>Search &amp; select {options.length ? `— ${options.length} of your clients & leads` : ''}</label>
            {selectedUcc && !open ? (
              <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'9px 12px',border:'1px solid var(--br2)',borderRadius:'8px',background:'var(--ibg)'}}>
                <span style={{fontWeight:600}}>{selectedUcc}</span>
                <span style={{color:'var(--tx2)',flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{selName||'—'}</span>
                {selKind && <span className={`badge ${selKind==='Client'?'b-hv':'b-lead'}`}>{selKind}</span>}
                <button className="btn sm" onClick={clearClient}>✕ Change</button>
              </div>
            ) : (
              <input
                autoComplete="off"
                placeholder="Type a UCC or name, or click to browse your list…"
                value={search}
                onChange={e => { setSearch(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
              />
            )}
            {open && (
              <div style={{position:'absolute',zIndex:30,top:'100%',left:0,right:0,marginTop:'4px',background:'var(--surface)',border:'1px solid var(--br2)',borderRadius:'8px',boxShadow:'var(--shadow-lg)',maxHeight:'260px',overflowY:'auto'}}>
                {filtered.length === 0 ? (
                  <div style={{padding:'12px',color:'var(--tx3)',fontSize:'13px'}}>{options.length===0?'Loading your clients…':'No match — check the UCC or name.'}</div>
                ) : filtered.map(o => (
                  <div key={o.ucc} onMouseDown={() => pickClient(o)}
                    style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 12px',cursor:'pointer',borderBottom:'0.5px solid var(--br)'}}
                    onMouseEnter={e=>{e.currentTarget.style.background='var(--bg2)';}}
                    onMouseLeave={e=>{e.currentTarget.style.background='transparent';}}>
                    <span style={{fontWeight:600,minWidth:'88px',fontFamily:'var(--font-mono)',fontSize:'12px'}}>{o.ucc}</span>
                    <span style={{flex:1,color:'var(--tx2)',fontSize:'13px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{o.name||'—'}</span>
                    <span className={`badge ${o.kind==='Client'?'b-hv':'b-lead'}`}>{o.kind}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="ptitle">📞 Contact methods</div>
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            <button className="btn" onClick={callClient}>📞 Click-to-call (1600 series)</button>
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
          <div className="fgrid fg2">
            <div className="fgrp"><label>Update lead state</label>
              <select value={form.state_update} onChange={e=>setForm({...form,state_update:e.target.value})}>
                <option>— No change —</option><option>Mark as interested</option><option>Mark as not interested</option>
              </select>
            </div>
            <div className="fgrp"><label>Follow-up date <span style={{fontSize:'11px',color:'var(--tx3)',fontWeight:400}}>(schedules next call)</span></label>
              <input type="date" value={form.follow_up} onChange={e=>setForm({...form,follow_up:e.target.value})} />
            </div>
          </div>
          <div className="fgrp" style={{marginBottom:'12px'}}><label>Follow-up time <span style={{fontSize:'11px',color:'var(--tx3)',fontWeight:400}}>(optional — shows in the Time column)</span></label>
            <input type="time" value={form.follow_up_time} disabled={!form.follow_up} onChange={e=>setForm({...form,follow_up_time:e.target.value})} />
          </div>
          <div className="alert a-i" style={{marginBottom:'12px',fontSize:'12px'}}>📅 A follow-up date makes this client appear in <strong>To Call Today → Scheduled follow-ups</strong> on that date. Pick today to see it there now.</div>
          <button className="btn bp" onClick={handleSave} disabled={saving}>
            {saving?'Saving…':saved?'✅ Saved!':'💾 Save interaction'}
          </button>
        </div>
      </div>

      {/* Interaction history */}
      {(history.length > 0 || selectedUcc) && (
        <div className="panel">
          <div className="ptitle">🕐 Recent interactions — {selName ? `${selName} (${selectedUcc})` : selectedUcc}</div>
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
