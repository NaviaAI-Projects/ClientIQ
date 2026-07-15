import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const sc = s => s>=70?'h':s>=50?'m':'l';
const tb = t => t?.toLowerCase().includes('nri')?'b-nri':t?.toLowerCase().includes('hv')?'b-hv':'b-ri';

const AssignedLeads = () => {
  const [leads, setLeads]     = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/leads/my').then(r => setLeads(r.data||[])).catch(console.error).finally(() => setLoading(false));
  }, []);

  const interested = leads.filter(l => l.state==='interested').length;
  const toContact  = leads.filter(l => l.state!=='interested').length;
  const expiring   = leads.filter(l => {
    if (!l.assignment_expires_at) return false;
    const diff = (new Date(l.assignment_expires_at)-new Date())/(1000*60*60*24);
    return diff < 7;
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
                  <td><span className={`badge ${l.plan==='paying'?'b-pay':'b-zero'}`}>{l.plan==='paying'?'Paying':'Zero-brk'}</span></td>
                  <td><span className={`ais ${sc(l.lead_score)}`}>{Math.round(l.lead_score)}</span></td>
                  <td><span className={`ais ${sc(l.churn_risk_score)}`}>{Math.round(l.churn_risk_score||0)}</span></td>
                  <td>{l.assigned_at?new Date(l.assigned_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'—'}</td>
                  <td><span className={`badge ${l.state==='interested'?'b-int':'b-blank'}`}>{l.state==='interested'?'Interested':'To contact'}</span></td>
                  <td style={{color:isUrgent?'var(--dc)':'inherit',fontWeight:isUrgent?'500':'normal'}}>
                    {expires?expires.toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'—'}{isUrgent?'!':''}
                  </td>
                  <td>
                    <button className={`btn sm ${isUrgent?'bd':'bp'}`} onClick={() => navigate('/contact-log')}>
                      {isUrgent?'Urgent':'Contact'}
                    </button>
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
