import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const tb = t => t?.toLowerCase().includes('nri')?'b-nri':t?.toLowerCase().includes('hv')?'b-hv':'b-ri';
const sc = s => s>=70?'h':s>=50?'m':'l';

const CrossSell = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/clients/my/clients').then(r => setClients(r.data||[])).catch(console.error).finally(() => setLoading(false));
  }, []);

  const mtfEligible = clients.filter(c => c.mtf_eligible).length;
  const nriNoRemit  = clients.filter(c => c.client_type?.toLowerCase().includes('nri')).length;
  const partnerOpps = clients.filter(c => (c.latest_holdings||0) > 1000000).length;
  const upgradeOpps = clients.filter(c => c.plan !== 'paying').length;

  const opps = [
    { opp:'MTF facility',      rationale:'Avg F&O TO → MTF eligible',            pot:'~₹8,000', priority:'High' },
    { opp:'Remittance',        rationale:'NRI with no remittance record',          pot:'~₹3,500', priority:'High' },
    { opp:'Partner products',  rationale:'Holdings qualifies for PMS/AIF',         pot:'~₹12,000',priority:'High' },
    { opp:'Plan upgrade',      rationale:'High TO on zero plan — convert to paying',pot:'~₹8,000', priority:'High' },
    { opp:'Partner products',  rationale:'Holding ₹18L+ — PMS/AIF suitable',       pot:'~₹5,000', priority:'High' },
    { opp:'Remittance',        rationale:'NRI — 3 fund transfers, no remittance',   pot:'~₹2,800', priority:'Med'  },
  ];

  return (
    <div>
      <div className="ph"><h2>Cross-sell opportunities</h2><p>AI-identified revenue expansion for your mapped clients</p></div>
      <div className="alert a-i">🤖 AI analyses trading patterns, MTF eligibility, NRI status, and holding values nightly to generate these signals.</div>
      <div className="cards">
        <div className="card ci"><div className="clbl">MTF eligible (not using)</div><div className="cval">{mtfEligible}</div></div>
        <div className="card cw"><div className="clbl">NRI without remittance</div><div className="cval">{nriNoRemit}</div></div>
        <div className="card cp"><div className="clbl">Partner product opps</div><div className="cval">{partnerOpps}</div></div>
        <div className="card cs"><div className="clbl">Zero-brk upgrade opps</div><div className="cval">{upgradeOpps}</div></div>
      </div>
      <div className="panel">
        <div className="ptitle">🔀 All cross-sell opportunities</div>
        <div className="tw"><table>
          <thead><tr><th>Client</th><th>Type</th><th>Plan</th><th>Opportunity</th><th>AI rationale</th><th>Potential/mo</th><th>Priority</th><th></th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>Loading opportunities...</td></tr>
            ) : clients.length===0 ? (
              <tr><td colSpan="8" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>No cross-sell opportunities identified</td></tr>
            ) : clients.slice(0,6).map((c,i) => {
              const opp = opps[i] || opps[0];
              return (
                <tr key={i}>
                  <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:c.ucc}})}>{c.name}</span></td>
                  <td><span className={`badge ${tb(c.client_type)}`}>{c.client_type}</span></td>
                  <td><span className={`badge ${c.plan==='paying'?'b-pay':'b-zero'}`}>{c.plan==='paying'?'Paying':'Zero-brk'}</span></td>
                  <td>{opp.opp}</td>
                  <td style={{fontSize:'12px',color:'var(--tx2)'}}>{opp.rationale}</td>
                  <td>{opp.pot}</td>
                  <td><span className={`ais ${opp.priority==='High'?'h':'m'}`}>{opp.priority}</span></td>
                  <td><button className="btn sm" onClick={() => navigate('/contact-log',{state:{ucc:c.ucc, name:c.name}})}>Pitch</button></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};
export default CrossSell;