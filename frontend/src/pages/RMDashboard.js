import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const fmt = v => { const n=parseFloat(v)||0; if(n>=10000000) return '₹'+(n/10000000).toFixed(2)+'Cr'; if(n>=100000) return '₹'+(n/100000).toFixed(1)+'L'; if(n>=1000) return '₹'+(n/1000).toFixed(0)+'K'; return '₹'+Math.round(n); };
const sc = s => s>=70?'h':s>=50?'m':'l';                 // lead score is 0–100
const tb = t => t?.toLowerCase().includes('nri')?'b-nri':t?.toLowerCase().includes('hv')?'b-hv':'b-ri';
const isPaying = p => /pay/i.test(p||'');

// Real cross-sell signal derived from the client's own attributes (no fabricated amounts).
const crossSellSignal = (c) => {
  if (c.mtf_eligible) return 'MTF eligible — pitch margin funding';
  if ((c.client_type||'').toLowerCase().includes('nri')) return 'NRI — remittance opportunity';
  if ((Number(c.latest_holdings)||0) > 1000000) return 'Large holdings → PMS / AIF';
  if (!isPaying(c.plan)) return 'Zero-brokerage → upgrade to paying';
  return 'Review for cross-sell';
};

const RMDashboard = () => {
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [xsell, setXsell] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.get('/dashboard/rm'), api.get('/leads/my'), api.get('/clients/my/clients')])
      .then(([s,l,c]) => {
        setStats(s.data);
        setLeads((l.data||[]).slice(0,4));
        // Cross-sell: the RM's own mapped clients, prioritising those with a real signal.
        const mine = c.data || [];
        const ranked = mine.filter(x => x.mtf_eligible
              || (x.client_type||'').toLowerCase().includes('nri')
              || (Number(x.latest_holdings)||0) > 1000000
              || !isPaying(x.plan));
        setXsell((ranked.length ? ranked : mine).slice(0,3));
      })
      .catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="ph"><p>Loading dashboard...</p></div>;

  const cap = stats?.capacity;
  const mtdBrok = stats?.mtd_brokerage || 0;
  const mtdMtf  = stats?.mtd_mtf || 0;
  const streamMax = Math.max(mtdBrok, mtdMtf, 1);
  const streams = [
    { label:'Brokerage', amt: mtdBrok, color:'var(--ic)' },
    { label:'MTF interest', amt: mtdMtf, color:'var(--sc)' },
  ];
  const hasStreamData = (mtdBrok + mtdMtf) > 0;

  return (
    <div>
      <div className="ph">
        <h2>My dashboard</h2>
        <p>{stats?.rm_name||'RM'} · {new Date().toLocaleDateString('en-IN',{month:'long',year:'numeric'})} · {stats?.my_clients||0} mapped clients · {stats?.my_leads||0} active leads{stats?.data_as_of ? ` · As of ${stats.data_as_of}` : ''}</p>
      </div>

      <div className="cards">
        <div className="card ci">
          <div className="clbl">MTD Revenue (attributed)</div>
          <div className="cval">{fmt(stats?.mtd_revenue ?? 0)}</div>
          <div className="csub">{(stats?.revenue_clients||0) > 0 ? `From ${stats.revenue_clients} client(s) · YTD ${fmt(stats?.ytd_revenue||0)}` : 'No attributed revenue yet'}</div>
        </div>
        <div className="card cs">
          <div className="clbl">Mapped clients</div>
          <div className="cval">{stats?.my_clients||0}</div>
          <div className="csub">{cap != null ? `Capacity ${cap} · ${Math.max(0, cap-(stats?.my_clients||0))} free` : 'Capacity not set'}</div>
        </div>
        <div className="card cp">
          <div className="clbl">Active leads</div>
          <div className="cval">{stats?.my_leads||0}</div>
          <div className="csub">{stats?.interested_leads||0} interested · {stats?.to_contact||0} to contact</div>
        </div>
        <div className="card cd">
          <div className="clbl">Churn risk alerts</div>
          <div className="cval">{stats?.churn_alerts||0}</div>
          <div className="csub">Action needed this week</div>
        </div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📊 Revenue by stream MTD</div>
          {!hasStreamData ? (
            <div style={{padding:'18px 4px',color:'var(--tx3)',fontSize:'13px'}}>No attributed revenue recorded this month.</div>
          ) : streams.map((r,i) => (
            <div key={i} className="rrow">
              <span className="rlbl">{r.label}</span>
              <div className="rtrk"><div className="rbar" style={{width:(r.amt/streamMax*100)+'%',background:r.color}}></div></div>
              <span className="ramt">{fmt(r.amt)}</span>
            </div>
          ))}
          {hasStreamData && (
            <p style={{fontSize:'11px',color:'var(--tx3)',marginTop:'6px'}}>Brokerage + MTF interest from your mapped clients. Other streams (commission, remittance, partner) are not yet attributed per-RM.</p>
          )}
        </div>
        <div className="panel">
          <div className="ptitle">⭐ Lead pipeline</div>
          <table><thead><tr><th>Client</th><th>Score</th><th>State</th><th>Expires</th></tr></thead>
          <tbody>
            {leads.length===0 ? (
              <tr><td colSpan="4" style={{padding:'20px',textAlign:'center',color:'var(--tx3)'}}>No active leads</td></tr>
            ) : leads.map((l,i) => {
              const interested = l.status==='opted_in';
              return (
              <tr key={i}>
                <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:l.ucc}})}>{l.client_name||l.name}</span></td>
                <td><span className={`ais ${sc(l.lead_score)}`}>{Math.round(l.lead_score||0)}</span></td>
                <td><span className={`badge ${interested?'b-int':'b-blank'}`}>{interested?'Interested':'To contact'}</span></td>
                <td style={{color:l.assignment_expires_at&&new Date(l.assignment_expires_at)<new Date()?'var(--dc)':'inherit'}}>
                  {l.assignment_expires_at?new Date(l.assignment_expires_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'—'}
                </td>
              </tr>
            );})}
          </tbody></table>
          <div style={{marginTop:'10px'}}><button className="btn bp" onClick={() => navigate('/assigned-leads')}>→ All leads</button></div>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">🤖 Cross-sell — your clients</div>
        <table><thead><tr><th>Client</th><th>Type</th><th>Plan</th><th>Opportunity</th><th>Action</th></tr></thead>
        <tbody>
          {xsell.length===0 ? (
            <tr><td colSpan="5" style={{padding:'20px',textAlign:'center',color:'var(--tx3)'}}>No cross-sell opportunities — you have no mapped clients yet.</td></tr>
          ) : xsell.map((c,i) => (
            <tr key={i}>
              <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:c.ucc}})}>{c.name}</span></td>
              <td><span className={`badge ${tb(c.client_type)}`}>{c.client_type}</span></td>
              <td><span className={`badge ${isPaying(c.plan)?'b-pay':'b-zero'}`}>{isPaying(c.plan)?'Paying':'Zero-brk'}</span></td>
              <td style={{fontSize:'12px',color:'var(--tx2)'}}>{crossSellSignal(c)}</td>
              <td><button className="btn sm" onClick={() => navigate('/contact-log',{state:{ucc:c.ucc}})}>Contact</button></td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
};
export default RMDashboard;
