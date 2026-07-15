import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const tb = t => t?.toLowerCase().includes('nri')?'b-nri':t?.toLowerCase().includes('hv')?'b-hv':'b-ri';
const sc = s => s>=70?'h':s>=50?'m':'l';
const fmt = v => { const n=parseFloat(v)||0; if(n>=100000) return '₹'+(n/100000).toFixed(1)+'L'; if(n>=1000) return '₹'+(n/1000).toFixed(0)+'K'; return v?'₹'+n:'—'; };

const DormantClients = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/clients/my/clients?dormant=true').then(r => setClients(r.data||[])).catch(console.error).finally(() => setLoading(false));
  }, []);

  const dormantCount = clients.filter(c => !c.is_active).length;
  const highRisk     = clients.filter(c => (c.churn_risk_score||0) >= 70).length;

  return (
    <div>
      <div className="ph"><h2>Dormant mapped clients</h2><p>Clients with no trade &gt;3 months who previously traded at least monthly</p></div>
      {highRisk > 0 && (
        <div className="alert a-d">⚠️ {highRisk} clients at high churn risk. Contact this week to prevent revenue loss.</div>
      )}
      <div className="panel">
        <div className="tw"><table>
          <thead><tr><th>UCC</th><th>Name</th><th>Type</th><th>Last trade</th><th>Dormant (mo)</th><th>Peak avg brokerage</th><th>Churn risk</th><th>Action</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>Loading dormant clients...</td></tr>
            ) : clients.length===0 ? (
              <tr><td colSpan="8" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>No dormant clients — great work!</td></tr>
            ) : clients.map((c,i) => {
              const lastTrade = c.last_trade_date ? new Date(c.last_trade_date) : null;
              const monthsDormant = lastTrade ? Math.floor((new Date()-lastTrade)/(1000*60*60*24*30)) : '—';
              return (
                <tr key={i}>
                  <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:c.ucc}})}>{c.ucc}</span></td>
                  <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:c.ucc}})}>{c.name}</span></td>
                  <td><span className={`badge ${tb(c.client_type)}`}>{c.client_type}</span></td>
                  <td>{lastTrade?lastTrade.toLocaleDateString('en-IN',{month:'short',year:'numeric'}):'—'}</td>
                  <td>{monthsDormant}</td>
                  <td>{fmt(c.peak_revenue)}/mo</td>
                  <td><span className={`ais ${sc(c.churn_risk_score)}`}>{Math.round(c.churn_risk_score||0)}</span></td>
                  <td><button className="btn sm" onClick={() => navigate('/contact-log')}>Contact now</button></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};
export default DormantClients;
