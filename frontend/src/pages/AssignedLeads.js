import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const sc = s => s>=70?'h':s>=50?'m':'l';              // lead score is 0–100
const scChurn = s => s>=7?'h':s>=4?'m':'l';           // churn risk is 0–10
const isPaying = p => /pay/i.test(p||'');             // plan value is 'paying-brokerage' / 'zero-brokerage'
const tb = t => t?.toLowerCase().includes('nri')?'b-nri':t?.toLowerCase().includes('hv')?'b-hv':'b-ri';

const AssignedLeads = () => {
  const [leads, setLeads]     = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/leads/my').then(r => setLeads(r.data||[])).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Real SmartFlo click-to-call: POST /calls/click-to-call { ucc }. The client is dialled
  // first, then the RM is bridged — same flow as To Call Today / Mapped Clients.
  const callClient = async (ucc, name) => {
    if (!ucc) return;
    if (!window.confirm(`Start a click-to-call with ${name || ucc}?\nThe client is called first, then you are connected.`)) return;
    try {
      const res = await api.post('/calls/click-to-call', { ucc });
      alert(res.data?.message || 'Call initiated.');
    } catch (e) {
      alert(e.response?.data?.message || 'Could not place the call. Check the client mobile and your SmartFlo setup.');
    }
  };

  const interested = leads.filter(l => l.state==='interested').length;
  const toContact  = leads.filter(l => l.state!=='interested').length;
  const expiring   = leads.filter(l => {
    if (!l.assignment_expires_at) return false;
    const diff = (new Date(l.assignment_expires_at)-new Date())/(1000*60*60*24);
    return diff >= 0 && diff < 7;   // expiring within the next 7 days (not already expired)
  }).length;

  return (
    <div>
      <div className="ph"><h2>Assigned leads</h2><p>AI-identified clients assigned to you. Contact, log, and update state within 30 days.</p></div>
      <div className="cards">
        <div className="card cp"><div className="clbl">Total assigned</div><div className="cval">{leads.length}</div></div>
        <div className="card ci"><div className="clbl">Interested</div><div className="cval">{interested}</div></div>
        <div className="card cw"><div className="clbl">To contact</div><div className="cval">{toContact}</div></div>
        <div className="card cd"><div className="clbl">Expiring &lt;7 days</div><div className="cval">{expiring}</div></div>
      </div>
      <div className="panel">
        <div className="tw"><table>
          <thead><tr><th>UCC</th><th>Name</th><th>Type</th><th>Plan</th><th>AI Score</th><th>Churn</th><th>Assigned</th><th>State</th><th>Expires</th><th>Action</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="10" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>Loading leads...</td></tr>
            ) : leads.length===0 ? (
              <tr><td colSpan="10" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>No leads assigned</td></tr>
            ) : leads.map((l,i) => {
              const expires = l.assignment_expires_at ? new Date(l.assignment_expires_at) : null;
              const isUrgent = expires && (expires-new Date())/(1000*60*60*24) < 7;
              return (
                <tr key={i}>
                  <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:l.ucc}})}>{l.ucc}</span></td>
                  <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:l.ucc}})}>{l.client_name||l.name}</span></td>
                  <td><span className={`badge ${tb(l.client_type)}`}>{l.client_type}</span></td>
                  <td><span className={`badge ${isPaying(l.plan)?'b-pay':'b-zero'}`}>{isPaying(l.plan)?'Paying':'Zero-brk'}</span></td>
                  <td><span className={`ais ${sc(l.lead_score)}`}>{Math.round(l.lead_score||0)}</span></td>
                  <td><span className={`ais ${scChurn(l.churn_risk_score)}`}>{Math.round(l.churn_risk_score||0)}</span></td>
                  <td>{l.assigned_at?new Date(l.assigned_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'—'}</td>
                  <td><span className={`badge ${l.state==='interested'?'b-int':'b-blank'}`}>{l.state==='interested'?'Interested':'To contact'}</span></td>
                  <td style={{color:isUrgent?'var(--dc)':'inherit',fontWeight:isUrgent?'500':'normal'}}>
                    {expires?expires.toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'—'}{isUrgent?'!':''}
                  </td>
                  <td style={{display:'flex',gap:'4px'}}>
                    <button className={`btn sm ${isUrgent?'bd':'bp'}`} onClick={() => callClient(l.ucc, l.client_name||l.name)}>
                      {isUrgent?'📞 Urgent':'📞 Call'}
                    </button>
                    <button className="btn sm" onClick={() => navigate('/contact-log',{state:{ucc:l.ucc}})}>✏️ Log</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};
export default AssignedLeads;
