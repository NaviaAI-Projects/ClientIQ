import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api';

const fmt = v => { const n=parseFloat(v)||0; if(n>=100000) return '₹'+(n/100000).toFixed(1)+'L'; if(n>=1000) return '₹'+(n/1000).toFixed(0)+'K'; return v?'₹'+n:'—'; };

const MONTHS = ['Dec 25','Jan 26','Feb 26','Mar 26','Apr 26','May 26 (MTD)'];
const DEFAULT_DATA = [
  { month:'Dec 25', Brokerage:48000, Commission:8000,  MTF:12000, Remit:6000 },
  { month:'Jan 26', Brokerage:52000, Commission:9000,  MTF:14000, Remit:9000 },
  { month:'Feb 26', Brokerage:61000, Commission:11000, MTF:18000, Remit:12000 },
  { month:'Mar 26', Brokerage:72000, Commission:14000, MTF:21000, Remit:14000 },
  { month:'Apr 26', Brokerage:78000, Commission:16000, MTF:22000, Remit:17000 },
  { month:'May 26', Brokerage:82000, Commission:18000, MTF:24000, Remit:18000 },
];

const TABLE_DATA = [
  { month:'Dec 25', brok:'₹48,000', comm:'₹8,000', mtf:'₹12,000', remit:'₹4,000', partner:'₹2,000', total:'₹74,000' },
  { month:'Jan 26', brok:'₹52,000', comm:'₹9,000', mtf:'₹14,000', remit:'₹6,000', partner:'₹3,000', total:'₹84,000' },
  { month:'Feb 26', brok:'₹61,000', comm:'₹11,000',mtf:'₹18,000', remit:'₹8,000', partner:'₹4,000', total:'₹1.02L' },
  { month:'Mar 26', brok:'₹72,000', comm:'₹14,000',mtf:'₹21,000', remit:'₹9,000', partner:'₹5,000', total:'₹1.21L' },
  { month:'Apr 26', brok:'₹78,000', comm:'₹16,000',mtf:'₹22,000', remit:'₹11,000',partner:'₹6,000', total:'₹1.33L' },
  { month:'May 26 (MTD)', brok:'₹82,000', comm:'₹18,000',mtf:'₹24,000', remit:'₹12,000',partner:'₹6,000', total:'₹1.42L' },
];

const RevenueTracker = () => {
  const [stats, setStats]     = useState(null);
  const [trend, setTrend]     = useState([]);
  const [topClients, setTop]  = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.get('/dashboard/rm'), api.get('/reports/monthly-brokerage'), api.get('/reports/top-clients?limit=5')])
      .then(([s,t,c]) => { setStats(s.data); setTrend(t.data||[]); setTop(c.data||[]); })
      .catch(console.error).finally(() => setLoading(false));
  }, []);

  const chartData = trend.length > 0 ? trend.slice(-6) : DEFAULT_DATA;

  return (
    <div>
      <div className="ph"><h2>Revenue tracker</h2><p>Attributed revenue from opt-in date · FY 2026-27</p></div>
      <div className="cards">
        <div className="card ci"><div className="clbl">MTD attributed</div><div className="cval">{fmt(stats?.mtd_revenue||142000)}</div><div className="csub">Target ₹1.8L · {stats?.revenue_pct||79}%</div></div>
        <div className="card cs"><div className="clbl">YTD attributed</div><div className="cval">{fmt(stats?.ytd_revenue||284000)}</div><div className="csub">vs same period LY</div></div>
        <div className="card cw"><div className="clbl">Brokerage share</div><div className="cval">58%</div><div className="csub">Target &lt;60% diversification</div></div>
        <div className="card cp"><div className="clbl">Clients generating rev</div><div className="cval">{stats?.revenue_clients||0}/{stats?.my_clients||0}</div></div>
      </div>

      <div className="panel">
        <div className="ptitle">📊 Monthly revenue by stream (6 months)</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{fontSize:10}} />
            <YAxis tick={{fontSize:10}} tickFormatter={v=>fmt(v)} />
            <Tooltip formatter={v=>fmt(v)} />
            <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
            <Bar dataKey="Brokerage"  stackId="s" fill="#b5d4f4" />
            <Bar dataKey="Commission" stackId="s" fill="#AFA9EC" />
            <Bar dataKey="MTF"        stackId="s" fill="#9FE1CB" />
            <Bar dataKey="Remit"      stackId="s" fill="#FAC775" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📋 Monthly stream breakdown</div>
          <div className="tw"><table>
            <thead><tr><th>Month</th><th>Brokerage</th><th>Commission</th><th>MTF</th><th>Remit.</th><th>Partner</th><th>Total</th></tr></thead>
            <tbody>
              {TABLE_DATA.map((r,i) => (
                <tr key={i}><td>{r.month}</td><td>{r.brok}</td><td>{r.comm}</td><td>{r.mtf}</td><td>{r.remit}</td><td>{r.partner}</td><td style={{fontWeight:'500'}}>{r.total}</td></tr>
              ))}
            </tbody>
          </table></div>
        </div>
        <div className="panel">
          <div className="ptitle">👥 Top 5 clients MTD</div>
          <div className="tw"><table>
            <thead><tr><th>Client</th><th>MTD Revenue</th><th>% of total</th><th>Streams</th></tr></thead>
            <tbody>
              {topClients.length===0 ? (
                <tr><td colSpan="4" style={{padding:'20px',textAlign:'center',color:'var(--tx3)'}}>No data available</td></tr>
              ) : topClients.map((c,i) => (
                <tr key={i}>
                  <td><span className="lc" onClick={() => navigate('/client-360',{state:{ucc:c.ucc}})}>{c.name}</span></td>
                  <td>{fmt(c.mtd_revenue)}</td>
                  <td>{c.pct||'—'}%</td>
                  <td>{c.streams||'1'}/5</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
};
export default RevenueTracker;
