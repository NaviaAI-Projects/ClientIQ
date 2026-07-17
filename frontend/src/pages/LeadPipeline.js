import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const tb = t => t?.toLowerCase().includes('nri')?'b-nri':t?.toLowerCase().includes('hv')?'b-hv':'b-ri';
const sc = s => s>=70?'h':s>=50?'m':'l';

const LeadPipeline = () => {
  const [leads, setLeads] = useState([]);
  const [rmFilter, setRm] = useState('');
  const [stateFilter, setState] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/leads/all?limit=100').then(r => setLeads(r.data||[])).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = leads.filter(l => {
    if (rmFilter && l.rm_name !== rmFilter) return false;
    if (stateFilter && l.state !== stateFilter) return false;
    return true;
  });

  const interested = leads.filter(l=>l.optin_clicked).length;
  const pending    = leads.filter(l=>l.state==='pending_approval').length;
  const expiring   = leads.filter(l=>{ if(!l.assignment_expires_at) return false; return (new Date(l.assignment_expires_at)-new Date())/(1000*60*60*24)<7; }).length;
  const rms        = [...new Set(leads.map(l=>l.rm_name).filter(Boolean))];

  const stateBadge = s => {
    if (s==='pending_approval') return <span className="badge b-pend">Pending approval</span>;
    if (s==='interested')       return <span className="badge b-int">Interested</span>;
    return <span className="badge b-blank">To contact</span>;
  };

  return (
    <div>
      <div className="ph"><h2>Lead pipeline</h2><p>All active leads across all RMs</p></div>
      <div className="cards">
        <div className="card cp"><div className="clbl">Total active leads</div><div className="cval">{leads.length}</div></div>
        <div className="card ci"><div className="clbl">Interested (opt-in sent)</div><div className="cval">{interested}</div></div>
        <div className="card cs"><div className="clbl">Pending approval</div><div className="cval">{pending}</div></div>
        <div className="card cd"><div className="clbl">Expiring this week</div><div className="cval">{expiring}</div></div>
      </div>
      <div className="panel">
        <div className="phd">
          <div className="ptitle" style={{marginBottom:0}}>📋 All leads</div>
          <div style={{display:'flex',gap:'8px'}}>
            <select style={{width:'120px'}} value={rmFilter} onChange={e=>setRm(e.target.value)}>
              <option value="">All RMs</option>
              {rms.map(r=><option key={r}>{r}</option>)}
            </select>
            <select style={{width:'160px'}} value={stateFilter} onChange={e=>setState(e.target.value)}>
              <option value="">All states</option>
              <option value="to_contact">To contact</option>
              <option value="interested">Interested</option>
              <option value="pending_approval">Pending approval</option>
            </select>
            <button className="btn sm">⬇ Export</button>
          </div>
        </div>
        <div className="tw"><table>
          <thead><tr><th>UCC</th><th>Name</th><th>Type</th><th>RM</th><th>Score</th><th>State</th><th>Opt-in</th><th>Assigned</th><th>Expires</th><th>Reassigns</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="10" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>Loading...</td></tr>
            : filtered.length===0 ? <tr><td colSpan="10" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>No leads found</td></tr>
            : filtered.map((l,i) => {
              const exp = l.assignment_expires_at ? new Date(l.assignment_expires_at) : null;
              const urgent = exp && (exp-new Date())/(1000*60*60*24)<7;
              return (
                <tr key={i}>
                  <td><span className="lc" onClick={()=>navigate('/client-360',{state:{ucc:l.ucc}})}>{l.ucc}</span></td>
                  <td>{l.client_name||l.name}</td>
                  <td><span className={`badge ${tb(l.client_type)}`}>{l.client_type}</span></td>
                  <td>{l.rm_name||'—'}</td>
                  <td><span className={`ais ${sc(l.lead_score)}`}>{Math.round(l.lead_score)}</span></td>
                  <td>{stateBadge(l.state)}</td>
                  <td><span className={`badge ${l.optin_clicked?'b-act':'b-blank'}`}>{l.optin_clicked?`Clicked ${l.optin_date?new Date(l.optin_date).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):''}` :'Not sent'}</span></td>
                  <td>{l.assigned_at?new Date(l.assigned_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'—'}</td>
                  <td style={{color:urgent?'var(--dc)':'inherit',fontWeight:urgent?'500':'normal'}}>
                    {exp?exp.toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'—'}{urgent?'!':''}
                  </td>
                  <td>{l.reassign_count||0}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};
export default LeadPipeline;
