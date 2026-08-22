import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const fmt = v => { const n=parseFloat(v)||0; if(n>=10000000) return '₹'+(n/10000000).toFixed(1)+'Cr'; if(n>=100000) return '₹'+(n/100000).toFixed(1)+'L'; if(n>=1000) return '₹'+(n/1000).toFixed(0)+'K'; return v?'₹'+n:'—'; };
const tb = t => t?.toLowerCase().includes('nri')?'b-nri':t?.toLowerCase().includes('hv')?'b-hv':'b-ri';
const sc = s => s>=70?'h':s>=50?'m':'l';
// Plan values are stored as 'paying-brokerage' / 'zero-brokerage' — match on substring, not
// an exact 'paying', otherwise every paying client wrongly renders as Zero-brk.
const isPaying = p => /pay/i.test(p || '');

const MappedClients = () => {
  const [clients, setClients] = useState([]);
  const [stats, setStats]     = useState({});
  const [search, setSearch]   = useState('');
  const [typeF, setTypeF]     = useState('');
  const [planF, setPlanF]     = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Load the client list and the RM stats INDEPENDENTLY — a failure in the stats call
    // (e.g. /dashboard/rm 500) must not blank the mapped-client list. (Promise.all failed
    // both together, which is why an erroring /dashboard/rm made this page look empty.)
    Promise.allSettled([api.get('/clients/my/clients'), api.get('/dashboard/rm')])
      .then(([c, s]) => {
        if (c.status === 'fulfilled') setClients(c.value.data || []);
        else console.error('my/clients failed:', c.reason);
        if (s.status === 'fulfilled') setStats(s.value.data || {});
        else console.error('dashboard/rm failed:', s.reason);
      })
      .finally(() => setLoading(false));
  }, []);

  // Real SmartFlo click-to-call: POST /calls/click-to-call { ucc }. Client is dialled first,
  // then the RM is bridged. Confirms, then surfaces the API's success/failure message.
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

  const filtered = clients.filter(c => {
    if (search && !c.name?.toLowerCase().includes(search.toLowerCase()) && !c.ucc?.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeF && !c.client_type?.toLowerCase().includes(typeF.toLowerCase())) return false;
    if (planF === 'paying' && !isPaying(c.plan)) return false;
    if (planF === 'zero'   &&  isPaying(c.plan)) return false;
    return true;
  });

  const active   = clients.filter(c => c.is_active).length;
  const dormant  = clients.filter(c => !c.is_active).length;
  const single   = clients.filter(c => !c.is_active).length;

  return (
    <div>
      <div className="ph"><h2>Mapped clients</h2><p>{clients.length} clients attributed to you from opt-in date</p></div>
      <div className="cards">
        <div className="card ci"><div className="clbl">Total mapped</div><div className="cval">{clients.length}</div></div>
        <div className="card cs"><div className="clbl">Active (traded 30d)</div><div className="cval">{active}</div></div>
        <div className="card cd"><div className="clbl">Dormant &gt;3 months</div><div className="cval">{dormant}</div></div>
        <div className="card cw"><div className="clbl">Single-stream only</div><div className="cval">{single}</div><div className="csub">Cross-sell opportunity</div></div>
      </div>
      <div className="panel">
        <div className="phd">
          <div className="ptitle" style={{marginBottom:0}}>👥 Client list</div>
          <div style={{display:'flex',gap:'8px'}}>
            <select style={{width:'110px'}} value={typeF} onChange={e=>setTypeF(e.target.value)}>
              <option value="">All types</option><option value="nri">NRI</option><option value="hv">HV</option><option value="ri">RI</option>
            </select>
            <select style={{width:'120px'}} value={planF} onChange={e=>setPlanF(e.target.value)}>
              <option value="">All plans</option><option value="paying">Paying</option><option value="zero">Zero-brk</option>
            </select>
            <input style={{width:'170px'}} placeholder="UCC or name…" value={search} onChange={e=>setSearch(e.target.value)} />
            <button className="btn sm">⬇ Export</button>
          </div>
        </div>
        <div className="tw"><table>
          <thead><tr><th>UCC</th><th>Name</th><th>Type</th><th>Plan</th><th>Last trade</th><th>MTD TO</th><th>MTD Revenue</th><th>Churn</th><th>Mapped since</th><th>Action</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="10" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>Loading clients...</td></tr>
            ) : filtered.length===0 ? (
              <tr><td colSpan="10" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>No clients found</td></tr>
            ) : filtered.map((c,i) => (
              <tr key={i}>
                <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:c.ucc}})}>{c.ucc}</span></td>
                <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:c.ucc}})}>{c.name}</span></td>
                <td><span className={`badge ${tb(c.client_type)}`}>{c.client_type}</span></td>
                <td><span className={`badge ${isPaying(c.plan)?'b-pay':'b-zero'}`}>{isPaying(c.plan)?'Paying':'Zero-brk'}</span></td>
                <td>{c.last_trade_date?new Date(c.last_trade_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'}):'—'}</td>
                <td>{fmt(c.mtd_turnover)}</td>
                <td>{fmt(c.mtd_revenue)}</td>
                <td><span className={`ais ${sc(c.churn_risk_score)}`}>{Math.round(c.churn_risk_score||0)}</span></td>
                <td>{c.mapped_at?new Date(c.mapped_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'}):'—'}</td>
                <td><button className="btn sm bp" onClick={() => callClient(c.ucc, c.name)}>📞 Call</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};
export default MappedClients;