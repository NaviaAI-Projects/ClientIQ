import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api';

const fmt = v => { const n=parseFloat(v)||0; if(n>=100000) return '₹'+(n/100000).toFixed(1)+'L'; if(n>=1000) return '₹'+(n/1000).toFixed(0)+'K'; return v?'₹'+n:'—'; };
const sc = s => s>=80?'l':s>=60?'m':'h'; // for % achieved: high=green, medium=yellow, low=red

const PERF_DATA = [
  { month:'Dec 25', actual:74000,  target:180000, clients:22, leads:6,  converted:3, interactions:28 },
  { month:'Jan 26', actual:84000,  target:180000, clients:24, leads:7,  converted:3, interactions:31 },
  { month:'Feb 26', actual:102000, target:180000, clients:26, leads:7,  converted:2, interactions:35 },
  { month:'Mar 26', actual:121000, target:180000, clients:29, leads:8,  converted:2, interactions:40 },
  { month:'Apr 26', actual:133000, target:180000, clients:32, leads:8,  converted:5, interactions:38 },
  { month:'May 26', actual:142000, target:180000, clients:34, leads:9,  converted:2, interactions:47 },
];

const MyPerformance = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/rm').then(r => setStats(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const pct = stats?.revenue_pct || 79;

  return (
    <div>
      <div className="ph"><h2>My performance</h2><p>FY 2026-27 · Revenue, leads, client growth</p></div>
      <div className="cards">
        <div className="card ci"><div className="clbl">YTD vs target</div><div className="cval">{pct}%</div><div className="csub">{fmt(stats?.ytd_revenue||284000)} of ₹3.60L (Apr–May)</div></div>
        <div className="card cs"><div className="clbl">Clients mapped YTD</div><div className="cval">+12</div><div className="csub">Started FY with {(stats?.my_clients||34)-12}, now {stats?.my_clients||34}</div></div>
        <div className="card cw"><div className="clbl">Leads converted</div><div className="cval">12/19</div><div className="csub">63% conversion rate</div></div>
        <div className="card cp"><div className="clbl">Revenue per client (MTD)</div><div className="cval">{fmt((stats?.mtd_revenue||142000)/(stats?.my_clients||34))}</div><div className="csub">Up from ₹3,200 last month</div></div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📊 Monthly revenue vs target</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={PERF_DATA} margin={{top:8,right:8,bottom:8,left:8}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{fontSize:10}} />
              <YAxis tick={{fontSize:10}} tickFormatter={fmt} />
              <Tooltip formatter={fmt} />
              <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
              <Bar dataKey="actual" name="Actual" fill="#b5d4f4" />
              <Line type="monotone" dataKey="target" name="Target" stroke="#a32d2d" strokeDasharray="4 4" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <div className="ptitle">📈 Client count growth</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={PERF_DATA} margin={{top:8,right:8,bottom:8,left:8}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{fontSize:10}} />
              <YAxis tick={{fontSize:10}} />
              <Tooltip />
              <Line type="monotone" dataKey="clients" name="Mapped clients" stroke="#185fa5" strokeWidth={2} dot={{r:4}} fill="rgba(24,95,165,0.08)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📋 Month-wise summary</div>
        <div className="tw"><table>
          <thead><tr><th>Month</th><th>Revenue</th><th>Target</th><th>Achieved</th><th>Leads assigned</th><th>Converted</th><th>Clients EOM</th><th>Interactions</th></tr></thead>
          <tbody>
            {PERF_DATA.map((r,i) => {
              const achieved = Math.round(r.actual/r.target*100);
              return (
                <tr key={i}>
                  <td>{r.month}</td>
                  <td>{fmt(r.actual)}</td>
                  <td>{fmt(r.target)}</td>
                  <td><span className={`ais ${achieved>=80?'l':achieved>=60?'m':'h'}`}>{achieved}%</span></td>
                  <td>{r.leads}</td>
                  <td>{r.converted}</td>
                  <td>{r.clients}</td>
                  <td>{r.interactions}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};
export default MyPerformance;
