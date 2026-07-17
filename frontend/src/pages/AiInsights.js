import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const sc = s => s>=70?'h':s>=50?'m':'l';
const tb = t => t?.toLowerCase().includes('nri')?'b-nri':t?.toLowerCase().includes('hv')?'b-hv':'b-ri';

const AiInsights = () => {
  const [insights, setInsights] = useState(null);
  const [churn, setChurn]       = useState([]);
  const [leads, setLeads]       = useState([]);
  const [unmap, setUnmap]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get('/ai/company-insights'),
      api.get('/clients?churn_risk=high&limit=3'),
      api.get('/leads/pending-approvals?limit=5&sort=score'),
    ]).then(([ins, ch, l]) => {
      setInsights(ins.data);
      setChurn(ch.data?.clients || []);
      setLeads(l.data || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const unmapSuggestions = [
    { ucc:'—', name:'Farida Begum', rm:'Arjun', since:'Jun 25', revChange:'–100% (dormant)' },
    { ucc:'—', name:'Mohan Das',    rm:'Mubarak', since:'Aug 25', revChange:'–45%' },
  ];

  return (
    <div>
      <div className="ph"><h2>AI insights</h2><p>Claude-powered analysis across all clients and RMs · Last run: {new Date().toLocaleDateString('en-IN')}</p></div>
      <div className="tc2">
        {/* Revenue pace */}
        <div className="panel" style={{borderLeft:'3px solid var(--ic)'}}>
          <div className="ptitle">📊 Revenue pace analysis</div>
          <div className="aibox">
            {loading ? 'Generating AI analysis…' : (
              insights?.revenue_analysis || 'Team is tracking towards monthly target. Check individual RM performance for gap analysis. Clients on zero-brokerage plans with high options volume represent the highest conversion opportunity.'
            )}
          </div>
        </div>
        {/* Churn risk */}
        <div className="panel" style={{borderLeft:'3px solid var(--dc)'}}>
          <div className="ptitle">⚠️ Churn risk — top alerts</div>
          <table><thead><tr><th>Client</th><th>RM</th><th>Signal</th><th>Score</th></tr></thead>
          <tbody>
            {churn.length===0 ? (
              <tr><td colSpan="4" style={{padding:'20px',textAlign:'center',color:'var(--tx3)'}}>No high churn risk clients</td></tr>
            ) : churn.map((c,i) => (
              <tr key={i}>
                <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:c.ucc}})}>{c.name}</span></td>
                <td>{c.rm_name||'Unmapped'}</td>
                <td style={{fontSize:'12px',color:'var(--tx2)'}}>{c.last_trade_date?`No trade ${Math.floor((new Date()-new Date(c.last_trade_date))/(1000*60*60*24*30))} months`:'No trades'}</td>
                <td><span className={`ais ${sc(c.churn_risk_score)}`}>{Math.round(c.churn_risk_score||0)}</span></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>
      <div className="tc2">
        {/* Top leads to assign */}
        <div className="panel" style={{borderLeft:'3px solid var(--sc)'}}>
          <div className="ptitle">⭐ Top 5 leads to assign today</div>
          <table><thead><tr><th>UCC</th><th>Name</th><th>Score</th><th>Top signal</th></tr></thead>
          <tbody>
            {leads.length===0 ? (
              <tr><td colSpan="4" style={{padding:'20px',textAlign:'center',color:'var(--tx3)'}}>No unassigned leads</td></tr>
            ) : leads.slice(0,5).map((l,i) => (
              <tr key={i}>
                <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:l.ucc}})}>{l.ucc}</span></td>
                <td>{l.client_name||l.name}</td>
                <td><span className={`ais ${sc(l.lead_score)}`}>{Math.round(l.lead_score)}</span></td>
                <td style={{fontSize:'12px',color:'var(--tx2)'}}>{l.top_signal||'High AI score'}</td>
              </tr>
            ))}
          </tbody></table>
          <button className="btn bp" style={{marginTop:'10px'}} onClick={() => alert('Auto-assigning top 10 leads in round-robin…')}>🤖 Auto-assign top 10</button>
        </div>
        {/* Unmap suggestions */}
        <div className="panel" style={{borderLeft:'3px solid var(--wc)'}}>
          <div className="ptitle">👤 AI unmap suggestions</div>
          <div className="aibox" style={{marginBottom:'10px'}}>
            {insights?.unmap_analysis || '2–3 clients flagged: revenue has not increased post-mapping, minimal RM interactions in 3+ months. Freeing slots opens capacity for higher-potential leads.'}
          </div>
          <table><thead><tr><th>Client</th><th>RM</th><th>Mapped since</th><th>Rev change</th></tr></thead>
          <tbody>
            {unmapSuggestions.map((u,i) => (
              <tr key={i}>
                <td>{u.name}</td>
                <td>{u.rm}</td>
                <td>{u.since}</td>
                <td style={{color:'var(--dc)'}}>{u.revChange}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>
    </div>
  );
};
export default AiInsights;
