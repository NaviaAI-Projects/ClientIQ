import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const tb = t => { if(!t) return 'b-ri'; const l=t.toLowerCase(); if(l.includes('nri')||l.includes('nre')||l.includes('nro')) return 'b-nri'; if(l.includes('hv')) return 'b-hv'; return 'b-ri'; };
const sc = s => s>=70?'h':s>=50?'m':'l';
const fmt = v => { const n=parseFloat(v)||0; if(n>=10000000) return '₹'+(n/10000000).toFixed(1)+'Cr'; if(n>=100000) return '₹'+(n/100000).toFixed(1)+'L'; if(n>=1000) return '₹'+(n/1000).toFixed(0)+'K'; return v?'₹'+n:'—'; };

const AllClients = () => {
  const [clients, setClients] = useState([]);
  const [stats, setStats]     = useState({});
  const [search, setSearch]   = useState('');
  const [typeF, setTypeF]     = useState('');
  const [planF, setPlanF]     = useState('');
  const [statusF, setStatusF] = useState('');
  const [activityF, setActivity] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams();
    if (typeF)     params.append('type', typeF);
    if (planF)     params.append('plan', planF);
    if (statusF)   params.append('status', statusF);
    if (activityF) params.append('activity', activityF);
    if (search)    params.append('search', search);
    params.append('limit', '100');

    Promise.all([api.get(`/clients?${params}`), api.get('/dashboard/company')])
      .then(([c, s]) => { setClients(c.data?.clients || c.data || []); setStats(s.data || {}); })
      .catch(console.error).finally(() => setLoading(false));
  }, [typeF, planF, statusF, activityF]);

  const handleSearch = () => {
    setLoading(true);
    const params = new URLSearchParams({ search, limit: 100 });
    if (typeF)   params.append('type', typeF);
    if (planF)   params.append('plan', planF);
    api.get(`/clients?${params}`).then(r => setClients(r.data?.clients || r.data || [])).catch(console.error).finally(() => setLoading(false));
  };

  const statusBadge = c => {
    if (c.mapping_date) return <span className="badge b-act">Active</span>;
    if (c.lead_state)   return <span className="badge b-lead">Lead</span>;
    if (!c.is_active)   return <span className="badge b-dor">Dormant</span>;
    return <span className="badge b-act">Active</span>;
  };

  return (
    <div>
      <div className="ph"><h2>All {(stats.total_clients||0).toLocaleString('en-IN')} clients</h2><p>Complete client universe — mapped, unmapped, paying, zero-brokerage</p></div>
      <div className="cards">
        <div className="card ci"><div className="clbl">Total clients</div><div className="cval">{(stats.total_clients||0).toLocaleString('en-IN')}</div></div>
        <div className="card cs"><div className="clbl">Mapped to RM</div><div className="cval">{stats.mapped_clients||0}</div><div className="csub">{stats.total_clients?((stats.mapped_clients||0)/stats.total_clients*100).toFixed(1):0}% of base</div></div>
        <div className="card cw"><div className="clbl">Unmapped</div><div className="cval">{(stats.total_clients||0)-(stats.mapped_clients||0)}</div></div>
        <div className="card cp"><div className="clbl">In lead pipeline</div><div className="cval">{stats.active_leads||0}</div></div>
      </div>
      <div className="panel">
        <div className="phd">
          <div className="ptitle" style={{marginBottom:0}}>🔍 Filter</div>
          <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
            <select style={{width:'110px'}} value={typeF} onChange={e=>setTypeF(e.target.value)}>
              <option value="">All types</option><option value="nri">NRI</option><option value="hv">HV</option><option value="ri">RI</option>
            </select>
            <select style={{width:'120px'}} value={planF} onChange={e=>setPlanF(e.target.value)}>
              <option value="">All plans</option><option value="paying">Paying</option><option value="zero-brokerage">Zero-brk</option>
            </select>
            <select style={{width:'110px'}} value={statusF} onChange={e=>setStatusF(e.target.value)}>
              <option value="">All status</option><option value="mapped">Mapped</option><option value="unmapped">Unmapped</option><option value="lead">Lead</option>
            </select>
            <select style={{width:'130px'}} value={activityF} onChange={e=>setActivity(e.target.value)}>
              <option value="">All activity</option><option value="active_30d">Active 30d</option><option value="dormant_3mo">Dormant 3mo+</option><option value="never_traded">Never traded</option>
            </select>
            <input style={{width:'160px'}} placeholder="UCC or name…" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSearch()} />
            <button className="btn sm bp" onClick={handleSearch}>🔍 Search</button>
            <button className="btn sm">⬇ Export</button>
          </div>
        </div>
        <div className="tw"><table>
          <thead><tr><th>UCC</th><th>Name</th><th>Type</th><th>Plan</th><th>Status</th><th>Last trade</th><th>MTD TO</th><th>MTD Rev</th><th>AI Score</th><th>RM</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="10" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>Loading clients...</td></tr>
            ) : clients.length===0 ? (
              <tr><td colSpan="10" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>No clients found</td></tr>
            ) : clients.map((c,i) => (
              <tr key={i}>
                <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:c.ucc}})}>{c.ucc}</span></td>
                <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:c.ucc}})}>{c.name}</span></td>
                <td><span className={`badge ${tb(c.client_type)}`}>{c.client_type}</span></td>
                <td><span className={`badge ${c.plan==='paying'?'b-pay':'b-zero'}`}>{c.plan==='paying'?'Paying':'Zero-brk'}</span></td>
                <td>{statusBadge(c)}</td>
                <td>{c.last_trade_date?new Date(c.last_trade_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'}):'—'}</td>
                <td>{fmt(c.mtd_turnover)}</td>
                <td>{fmt(c.mtd_revenue)}</td>
                <td><span className={`ais ${sc(c.lead_score)}`}>{Math.round(c.lead_score||0)}</span></td>
                <td>{c.rm_name||'—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};
export default AllClients;
