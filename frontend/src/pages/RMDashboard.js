import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api';

const fmt = v => { const n=parseFloat(v)||0; if(n>=10000000) return '₹'+(n/10000000).toFixed(2)+'Cr'; if(n>=100000) return '₹'+(n/100000).toFixed(1)+'L'; if(n>=1000) return '₹'+(n/1000).toFixed(0)+'K'; return '₹'+n; };
const sc = s => s>=70?'h':s>=50?'m':'l';
const tb = t => t?.toLowerCase().includes('nri')?'b-nri':t?.toLowerCase().includes('hv')?'b-hv':'b-ri';

const RMDashboard = () => {
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [xsell, setXsell] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.get('/dashboard/rm'), api.get('/leads/my'), api.get('/clients?limit=3')])
      .then(([s,l,c]) => { setStats(s.data); setLeads((l.data||[]).slice(0,4)); setXsell((c.data?.clients||[]).slice(0,3)); })
      .catch(console.error).finally(() => setLoading(false));
  }, []);

  const streams = [
    { label:'Brokerage (paying)',    pct:75, color:'var(--ic)', amt: fmt(stats?.mtd_brokerage||82000) },
    { label:'Commission (zero-brk)', pct:16, color:'var(--pc)', amt:'₹18,000' },
    { label:'MTF Interest',          pct:22, color:'var(--sc)', amt:'₹24,000' },
    { label:'Remittance',            pct:11, color:'var(--wc)', amt:'₹12,000' },
    { label:'Partner products',      pct:5,  color:'#888',      amt:'₹6,000'  },
  ];

  const xsellData = [
    { opp:'High F&O TO → MTF eligible',       pot:'~₹8,000' },
    { opp:'NRI — no remittance yet',           pot:'~₹3,500' },
    { opp:'Large holdings → partner products', pot:'~₹5,000' },
  ];

  if (loading) return <div className="ph"><p>Loading dashboard...</p></div>;

  return (
    <div>
      <div className="ph">
        <h2>My dashboard</h2>
        <p>{stats?.rm_name||'RM'} · {new Date().toLocaleDateString('en-IN',{month:'long',year:'numeric'})} · {stats?.my_clients||0} mapped clients · {stats?.my_leads||0} active leads</p>
      </div>

      {(stats?.dormant_alerts||0) > 0 && (
        <div className="alert a-w">⚠️ {stats.dormant_alerts} mapped clients showing declining trading pattern this month. <span className="lc" onClick={() => navigate('/dormant-clients')}>Review dormant list →</span></div>
      )}

      <div className="cards">
        <div className="card ci"><div className="clbl">MTD Revenue (attributed)</div><div className="cval">{fmt(stats?.mtd_revenue||142000)}</div><div className="csub">Target ₹1.8L · {stats?.revenue_pct||79}% pace</div></div>
        <div className="card cs"><div className="clbl">Mapped clients</div><div className="cval">{stats?.my_clients||0}</div><div className="csub">Capacity 100 · {100-(stats?.my_clients||0)} free</div></div>
        <div className="card cp"><div className="clbl">Active leads</div><div className="cval">{stats?.my_leads||0}</div><div className="csub">{stats?.interested_leads||0} interested · {stats?.to_contact||0} to contact</div></div>
        <div className="card cd"><div className="clbl">Churn risk alerts</div><div className="cval">{stats?.churn_alerts||0}</div><div className="csub">Action needed this week</div></div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📊 Revenue by stream MTD</div>
          {streams.map((r,i) => (
            <div key={i} className="rrow">
              <span className="rlbl">{r.label}</span>
              <div className="rtrk"><div className="rbar" style={{width:r.pct+'%',background:r.color}}></div></div>
              <span className="ramt">{r.amt}</span>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="ptitle">⭐ Lead pipeline</div>
          <table><thead><tr><th>Client</th><th>Score</th><th>State</th><th>Expires</th></tr></thead>
          <tbody>
            {leads.length===0 ? (
              <tr><td colSpan="4" style={{padding:'20px',textAlign:'center',color:'var(--tx3)'}}>No active leads</td></tr>
            ) : leads.map((l,i) => (
              <tr key={i}>
                <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:l.ucc}})}>{l.client_name||l.name}</span></td>
                <td><span className={`ais ${sc(l.lead_score)}`}>{Math.round(l.lead_score)}</span></td>
                <td><span className={`badge ${l.state==='interested'?'b-int':'b-blank'}`}>{l.state==='interested'?'Interested':'To contact'}</span></td>
                <td style={{color:l.assignment_expires_at&&new Date(l.assignment_expires_at)<new Date()?'var(--dc)':'inherit'}}>
                  {l.assignment_expires_at?new Date(l.assignment_expires_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'—'}
                </td>
              </tr>
            ))}
          </tbody></table>
          <div style={{marginTop:'10px'}}><button className="btn bp" onClick={() => navigate('/assigned-leads')}>→ All leads</button></div>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">🤖 AI cross-sell top 3</div>
        <table><thead><tr><th>Client</th><th>Type</th><th>Plan</th><th>Opportunity</th><th>Potential/mo</th><th>Action</th></tr></thead>
        <tbody>
          {xsell.length===0 ? (
            <tr><td colSpan="6" style={{padding:'20px',textAlign:'center',color:'var(--tx3)'}}>No cross-sell opportunities</td></tr>
          ) : xsell.map((c,i) => (
            <tr key={i}>
              <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:c.ucc}})}>{c.name}</span></td>
              <td><span className={`badge ${tb(c.client_type)}`}>{c.client_type}</span></td>
              <td><span className={`badge ${c.plan==='paying'?'b-pay':'b-zero'}`}>{c.plan==='paying'?'Paying':'Zero-brk'}</span></td>
              <td style={{fontSize:'12px',color:'var(--tx2)'}}>{xsellData[i]?.opp||'Cross-sell opportunity'}</td>
              <td>{xsellData[i]?.pot||'—'}</td>
              <td><button className="btn sm" onClick={() => navigate('/contact-log')}>Contact</button></td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
};
export default RMDashboard;
