import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const sc = s => s>=70?'h':s>=50?'m':'l';              // lead score is 0–100
const scChurn = s => s>=7?'h':s>=4?'m':'l';           // churn risk is 0–10
const isPaying = p => /pay/i.test(p||'');             // plan value is 'paying-brokerage' / 'zero-brokerage'
const tb = t => t?.toLowerCase().includes('nri')?'b-nri':t?.toLowerCase().includes('hv')?'b-hv':'b-ri';

// Lead-funnel state (lead_pool.status) → label + badge colours. This is the "before vs
// after opt-in" distinction: assigned = RM working it (pre-opt-in); optin_sent = consent
// link sent, awaiting the client; opted_in = client consented, pending supervisor approval.
const stateMeta = (s) => ({
  assigned:   ['To contact',          '#48566b', 'rgba(15,27,45,.06)'],
  optin_sent: ['Opt-in sent',         '#b7791f', 'rgba(245,159,43,.16)'],
  opted_in:   ['Opted in · pending',  '#1a7f4b', 'rgba(38,201,126,.16)'],
  declined:   ['Declined',            '#c0392b', 'rgba(240,57,78,.14)'],
}[s] || ['To contact', '#48566b', 'rgba(15,27,45,.06)']);

const AssignedLeads = () => {
  const [leads, setLeads]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState('');
  const navigate = useNavigate();

  const load = () => api.get('/leads/my').then(r => setLeads(r.data||[])).catch(console.error).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

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

  // RM sends the opt-in consent link AFTER speaking to the client. Resend-safe.
  const sendOptin = async (ucc, name, resend) => {
    if (!ucc) return;
    if (!window.confirm(`${resend ? 'Re-send' : 'Send'} the opt-in consent link to ${name || ucc}?\nThey'll receive an email to confirm you as their Relationship Manager.`)) return;
    setBusy(ucc);
    try {
      const res = await api.post('/leads/optin/send', { ucc });
      alert(res.data?.emailed
        ? 'Opt-in link emailed to the client. It appears in Mapping Approvals once they confirm.'
        : 'Opt-in link generated, but the client has no email on file — check the logs / update their email.');
      await load();
    } catch (e) {
      alert(e.response?.data?.message || 'Could not send the opt-in link.');
    } finally { setBusy(''); }
  };

  const cAssigned = leads.filter(l => l.status==='assigned').length;
  const cSent     = leads.filter(l => l.status==='optin_sent').length;
  const cOpted    = leads.filter(l => l.status==='opted_in').length;

  return (
    <div>
      <div className="ph"><h2>Assigned leads</h2><p>Clients assigned to you. Speak to the client, then send the opt-in link — mapping is confirmed only after the client consents and a supervisor approves.</p></div>
      <div className="cards">
        <div className="card cp"><div className="clbl">Total assigned</div><div className="cval">{leads.length}</div></div>
        <div className="card cw"><div className="clbl">To contact</div><div className="cval">{cAssigned}</div><div className="csub">Before opt-in</div></div>
        <div className="card ci"><div className="clbl">Opt-in sent</div><div className="cval">{cSent}</div><div className="csub">Awaiting client consent</div></div>
        <div className="card cs"><div className="clbl">Opted in</div><div className="cval">{cOpted}</div><div className="csub">Pending supervisor approval</div></div>
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
              const m = stateMeta(l.status);
              const canSend = l.status==='assigned' || l.status==='optin_sent';
              return (
                <tr key={i}>
                  <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:l.ucc}})}>{l.ucc}</span></td>
                  <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:l.ucc}})}>{l.client_name||l.name}</span></td>
                  <td><span className={`badge ${tb(l.client_type)}`}>{l.client_type}</span></td>
                  <td><span className={`badge ${isPaying(l.plan)?'b-pay':'b-zero'}`}>{isPaying(l.plan)?'Paying':'Zero-brk'}</span></td>
                  <td><span className={`ais ${sc(l.lead_score)}`}>{Math.round(l.lead_score||0)}</span></td>
                  <td><span className={`ais ${scChurn(l.churn_risk_score)}`}>{Math.round(l.churn_risk_score||0)}</span></td>
                  <td>{l.assigned_at?new Date(l.assigned_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'—'}</td>
                  <td><span style={{display:'inline-block',padding:'3px 9px',borderRadius:'6px',fontSize:'11px',fontWeight:600,color:m[1],background:m[2],whiteSpace:'nowrap'}}>{m[0]}</span></td>
                  <td style={{color:isUrgent?'var(--dc)':'inherit',fontWeight:isUrgent?'500':'normal'}}>
                    {expires?expires.toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'—'}{isUrgent?'!':''}
                  </td>
                  <td style={{display:'flex',gap:'4px',flexWrap:'wrap'}}>
                    <button className={`btn sm ${isUrgent?'bd':'bp'}`} onClick={() => callClient(l.ucc, l.client_name||l.name)}>
                      {isUrgent?'📞 Urgent':'📞 Call'}
                    </button>
                    <button className="btn sm" onClick={() => navigate('/contact-log',{state:{ucc:l.ucc}})}>✏️ Log</button>
                    {canSend && (
                      <button className="btn sm" disabled={busy===l.ucc}
                        onClick={() => sendOptin(l.ucc, l.client_name||l.name, l.status==='optin_sent')}>
                        {busy===l.ucc ? '…' : (l.status==='optin_sent' ? '✉️ Resend opt-in' : '✉️ Send opt-in')}
                      </button>
                    )}
                    {l.status==='opted_in' && <span style={{fontSize:'11px',color:'var(--tx3)',alignSelf:'center'}}>Awaiting approval</span>}
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
