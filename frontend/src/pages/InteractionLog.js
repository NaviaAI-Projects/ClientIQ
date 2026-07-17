import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const InteractionLog = () => {
  const [logs, setLogs]       = useState([]);
  const [type, setType]       = useState('');
  const [scope, setScope]     = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/contact-logs?limit=50').then(r => setLogs(r.data||[])).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter(l => {
    if (type  && l.type !== type) return false;
    return true;
  });

  const calls    = logs.filter(l => l.type?.toLowerCase().includes('call')).length;
  const emails   = logs.filter(l => l.type?.toLowerCase().includes('email')).length;
  const unique   = new Set(logs.map(l => l.ucc)).size;
  const leadsCtd = new Set(logs.filter(l => l.is_lead).map(l => l.ucc)).size;

  const chanIcon = t => {
    if (!t) return '📝';
    const tl = t.toLowerCase();
    if (tl.includes('call')) return '📞';
    if (tl.includes('email')) return '✉️';
    if (tl.includes('whatsapp')) return '💬';
    if (tl.includes('meeting')) return '🤝';
    return '📝';
  };
  const outColor = o => {
    if (!o) return 'inherit';
    if (o.toLowerCase().includes('interested') || o.toLowerCase().includes('sent') || o.toLowerCase().includes('delivered') || o.toLowerCase().includes('connected')) return 'var(--sc)';
    if (o.toLowerCase().includes('no answer') || o.toLowerCase().includes('not interested')) return 'var(--dc)';
    return 'inherit';
  };

  return (
    <div>
      <div className="ph"><h2>Interaction log</h2><p>All logged interactions with leads and mapped clients — calls, emails, WhatsApp, meetings</p></div>
      <div className="cards">
        <div className="card ci"><div className="clbl">Total interactions MTD</div><div className="cval">{logs.length}</div></div>
        <div className="card cs"><div className="clbl">Unique clients contacted</div><div className="cval">{unique}</div></div>
        <div className="card cw"><div className="clbl">Leads contacted</div><div className="cval">{leadsCtd}</div></div>
        <div className="card cp"><div className="clbl">Avg interactions/client</div><div className="cval">{unique>0?(logs.length/unique).toFixed(1):'0'}</div></div>
      </div>
      <div className="panel">
        <div className="phd">
          <div className="ptitle" style={{marginBottom:0}}>📋 All interactions</div>
          <div style={{display:'flex',gap:'8px'}}>
            <select style={{width:'120px'}} value={type} onChange={e=>setType(e.target.value)}>
              <option value="">All types</option><option>Call</option><option>Email</option><option>WhatsApp</option><option>Meeting</option>
            </select>
            <select style={{width:'160px'}} value={scope} onChange={e=>setScope(e.target.value)}>
              <option value="">Leads &amp; clients</option><option>Leads only</option><option>Mapped clients</option>
            </select>
            <button className="btn sm">⬇ Export</button>
          </div>
        </div>
        <div className="tw"><table>
          <thead><tr><th>Date/time</th><th>UCC</th><th>Client</th><th>Type</th><th>Channel</th><th>Outcome</th><th>Dur</th><th>Notes</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>Loading interactions...</td></tr>
            ) : filtered.length===0 ? (
              <tr><td colSpan="8" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>No interactions logged yet</td></tr>
            ) : filtered.map((l,i) => (
              <tr key={i}>
                <td style={{fontSize:'12px'}}>{l.interaction_date?new Date(l.interaction_date).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—'}</td>
                <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:l.ucc}})}>{l.ucc}</span></td>
                <td>{l.client_name||l.name||'—'}</td>
                <td>{l.type||'—'}</td>
                <td>{l.channel||l.type||'—'}</td>
                <td style={{color:outColor(l.outcome)}}>{l.outcome||'—'}</td>
                <td>{l.duration_minutes?l.duration_minutes+'m':'—'}</td>
                <td style={{fontSize:'12px',color:'var(--tx2)',maxWidth:'200px'}}>{l.notes||'—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};
export default InteractionLog;
