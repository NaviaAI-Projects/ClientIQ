import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const tb = t => t?.toLowerCase().includes('nri')?'b-nri':t?.toLowerCase().includes('hv')?'b-hv':'b-ri';
const sc = s => s>=70?'h':s>=50?'m':'l';

const ToCallToday = () => {
  const [aiCalls, setAiCalls]     = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [expanded, setExpanded]   = useState({});
  const [logPanel, setLogPanel]   = useState(null);
  const [form, setForm]           = useState({ channel:'Click-to-call', outcome:'Connected — positive', followup:'', duration:'', notes:'' });
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [loading, setLoading]     = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get('/leads/to-call-today'),
      api.get('/interactions/scheduled-today'),
    ]).then(([a, s]) => {
      setAiCalls(a.data || []);
      setScheduled(s.data || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const completed = [...aiCalls, ...scheduled].filter(c => c.contacted_today).length;
  const remaining = aiCalls.length + scheduled.length - completed;

  const handleSave = async () => {
    if (!logPanel) return;
    setSaving(true);
    try {
      await api.post('/contact-logs', { ucc: logPanel.ucc, ...form });
      setSaved(true);
      setLogPanel(null);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { alert('Error saving'); }
    finally { setSaving(false); }
  };

  const reasonBadge = reason => {
    if (!reason) return null;
    if (reason.toLowerCase().includes('expir')) return <span className="badge b-dor" style={{marginRight:'6px'}}>Lead expiring</span>;
    if (reason.toLowerCase().includes('churn')) return <span className="badge b-dor" style={{marginRight:'6px'}}>Churn risk</span>;
    if (reason.toLowerCase().includes('cross')) return <span className="badge b-lead" style={{marginRight:'6px'}}>Cross-sell</span>;
    if (reason.toLowerCase().includes('dormant')) return <span className="badge b-dor" style={{marginRight:'6px'}}>Dormant</span>;
    return <span className="badge b-int" style={{marginRight:'6px'}}>Revenue growth</span>;
  };

  // Split the AI brief "Why: … Talk about: …" into its two parts for the expander.
  const splitBrief = text => {
    if (!text) return { why:'', talk:'' };
    const idx = text.search(/talk about\s*:/i);
    if (idx === -1) return { why: text.trim(), talk:'' };
    return {
      why:  text.slice(0, idx).replace(/^\s*why\s*:/i, '').trim(),
      talk: text.slice(idx).replace(/^talk about\s*:/i, '').trim()
    };
  };

  const AiReason = ({ c, i }) => {
    const { why, talk } = splitBrief(c.reason_detail || c.reason || 'AI identified priority');
    const open = !!expanded[i];
    return (
      <td style={{fontSize:'12px',color:'var(--tx2)',maxWidth:'340px'}}>
        {reasonBadge(c.reason)}
        <span>{why}</span>
        {talk && (
          <>
            {' '}
            <button
              onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}
              style={{border:'none',background:'none',color:'var(--ic)',cursor:'pointer',fontSize:'11px',fontWeight:600,padding:0}}>
              {open ? '▲ Less' : '▼ Details'}
            </button>
            {open && (
              <div style={{marginTop:'6px',padding:'8px 10px',background:'var(--ibg)',borderRadius:'6px',lineHeight:1.6}}>
                <div style={{fontWeight:600,fontSize:'11px',color:'var(--ic)',marginBottom:'3px'}}>💬 What to talk about</div>
                <div style={{fontSize:'12px',color:'var(--tx2)'}}>{talk}</div>
              </div>
            )}
          </>
        )}
      </td>
    );
  };

  return (
    <div>
      <div className="ph">
        <h2>To call today</h2>
        <p>AI-prioritised outreach list · {new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · Click-to-call enabled</p>
      </div>

      <div className="cards">
        <div className="card cd"><div className="clbl">AI priority calls</div><div className="cval">{aiCalls.length}</div><div className="csub">New AI-identified today</div></div>
        <div className="card cw"><div className="clbl">Scheduled follow-ups</div><div className="cval">{scheduled.length}</div><div className="csub">From previous interactions</div></div>
        <div className="card ci"><div className="clbl">Completed today</div><div className="cval">{completed}</div><div className="csub">Logged this session</div></div>
        <div className="card cs"><div className="clbl">Remaining</div><div className="cval">{remaining}</div></div>
      </div>

      {/* AI Priority Calls */}
      <div className="panel" style={{borderLeft:'3px solid var(--dc)'}}>
        <div className="ptitle">🤖 AI priority calls — urgent today</div>
        <div className="tw"><table>
          <thead><tr><th>Client</th><th>Type</th><th>AI reason</th><th>Priority</th><th>Last contact</th><th>Best time</th><th>Action</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>Loading...</td></tr>
            ) : aiCalls.length===0 ? (
              <tr><td colSpan="7" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>No AI priority calls today — all caught up!</td></tr>
            ) : aiCalls.map((c,i) => (
              <tr key={i}>
                <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:c.ucc}})}>{c.client_name||c.name}</span></td>
                <td><span className={`badge ${tb(c.client_type)}`}>{c.client_type}</span></td>
                <AiReason c={c} i={i} />
                <td><span className={`ais ${c.priority==='Critical'?'h':c.priority==='High'?'h':'m'}`}>{c.priority||'High'}</span></td>
                <td style={{color:!c.last_contact?'var(--dc)':'inherit'}}>{c.last_contact?new Date(c.last_contact).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'Never'}</td>
                <td>{c.best_time||'Flexible'}</td>
                <td style={{display:'flex',gap:'4px'}}>
                  <button className="btn sm bp" onClick={() => alert('Fetching mobile via API…\nClick-to-call initiated on 1600 series')}>📞 Call</button>
                  <button className="btn sm" onClick={() => setLogPanel(c)}>✏️ Log</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {/* Scheduled Follow-ups */}
      <div className="panel" style={{borderLeft:'3px solid var(--wc)'}}>
        <div className="ptitle">🕐 Scheduled follow-ups today</div>
        <div className="tw"><table>
          <thead><tr><th>Client</th><th>Type</th><th>Scheduled by</th><th>Context</th><th>Time</th><th>Action</th></tr></thead>
          <tbody>
            {scheduled.length===0 ? (
              <tr><td colSpan="6" style={{padding:'20px',textAlign:'center',color:'var(--tx3)'}}>No scheduled follow-ups today</td></tr>
            ) : scheduled.map((s,i) => (
              <tr key={i}>
                <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:s.ucc}})}>{s.client_name||s.name}</span></td>
                <td><span className={`badge ${tb(s.client_type)}`}>{s.client_type}</span></td>
                <td style={{fontSize:'12px',color:'var(--tx2)'}}>{s.scheduled_by||'You'} · {s.scheduled_date?new Date(s.scheduled_date).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):''}</td>
                <td style={{fontSize:'12px',color:'var(--tx2)'}}>{s.context||s.notes||'Follow-up'}</td>
                <td><strong style={{color:'var(--ic)'}}>{s.scheduled_time||'—'}</strong></td>
                <td style={{display:'flex',gap:'4px'}}>
                  <button className="btn sm bp" onClick={() => alert('Click-to-call initiated')}>📞 Call</button>
                  <button className="btn sm" onClick={() => setLogPanel(s)}>✏️ Log</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {/* Quick Log Panel */}
      {logPanel && (
        <div className="panel" style={{borderLeft:'3px solid var(--sc)'}}>
          <div className="phd">
            <div className="ptitle">✏️ Log interaction — {logPanel.client_name||logPanel.name} ({logPanel.ucc})</div>
            <button className="btn sm" onClick={() => setLogPanel(null)}>✕ Close</button>
          </div>
          <div className="fgrid">
            <div className="fgrp"><label>Channel</label>
              <select value={form.channel} onChange={e=>setForm({...form,channel:e.target.value})}>
                <option>Click-to-call</option><option>Personal call</option><option>Email</option><option>WhatsApp</option>
              </select>
            </div>
            <div className="fgrp"><label>Outcome</label>
              <select value={form.outcome} onChange={e=>setForm({...form,outcome:e.target.value})}>
                <option>Connected — positive</option><option>Connected — neutral</option><option>No answer</option><option>Callback requested</option><option>Not interested</option>
              </select>
            </div>
            <div className="fgrp"><label>Follow-up date</label><input type="date" value={form.followup} onChange={e=>setForm({...form,followup:e.target.value})} /></div>
            <div className="fgrp"><label>Duration (mins)</label><input type="number" min="0" placeholder="0" value={form.duration} onChange={e=>setForm({...form,duration:e.target.value})} /></div>
          </div>
          <div className="fgrp" style={{marginBottom:'12px'}}><label>Notes</label>
            <textarea placeholder="Key points from the conversation…" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />
          </div>
          <div className="brow">
            <button className="btn bp" onClick={handleSave} disabled={saving}>{saving?'Saving…':saved?'✅ Saved!':'💾 Save &amp; mark done'}</button>
            <button className="btn" onClick={() => { handleSave(); }}>📅 Save &amp; schedule follow-up</button>
          </div>
        </div>
      )}
    </div>
  );
};
export default ToCallToday;