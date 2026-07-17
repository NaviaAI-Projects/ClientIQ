import React from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const fmt = v => { const n=parseFloat(v)||0; if(n>=100000) return '₹'+(n/100000).toFixed(1)+'L'; if(n>=1000) return '₹'+(n/1000).toFixed(0)+'K'; return '₹'+n; };

const PERF_DATA = [
  { month:"Jan '26", Arjun:84000, Mubarak:71000, Srinivasan:98000, Scott:94000 },
  { month:"Feb '26", Arjun:102000, Mubarak:88000, Srinivasan:118000, Scott:112000 },
  { month:"Mar '26", Arjun:121000, Mubarak:104000, Srinivasan:138000, Scott:132000 },
  { month:"Apr '26", Arjun:133000, Mubarak:114000, Srinivasan:152000, Scott:148000 },
  { month:"May '26", Arjun:142000, Mubarak:118000, Srinivasan:161000, Scott:157000 },
];

const TABLE = [
  { rm:'Arjun',     clients:34, mtd:'₹1.42L', pct:79,  ytd:'₹2.84L', leads:19, conv:12, convPct:'63%', inter:47, churn:4 },
  { rm:'Mubarak',   clients:29, mtd:'₹1.18L', pct:65,  ytd:'₹2.36L', leads:16, conv:8,  convPct:'50%', inter:31, churn:5 },
  { rm:'Srinivasan',clients:41, mtd:'₹1.61L', pct:88,  ytd:'₹3.22L', leads:24, conv:18, convPct:'75%', inter:62, churn:3 },
  { rm:'Scott',     clients:38, mtd:'₹1.57L', pct:91,  ytd:'₹3.14L', leads:22, conv:17, convPct:'77%', inter:58, churn:2 },
];

const sc = p => p>=80?'l':p>=65?'m':'h';

const RMPerformance = () => (
  <div>
    <div className="ph"><h2>RM performance</h2><p>Cross-RM analysis — revenue, lead conversion, client growth, activity</p></div>
    <div className="cards">
      <div className="card cs"><div className="clbl">Best performing MTD</div><div className="cval">Scott</div><div className="csub">91% of target · ₹1.57L</div></div>
      <div className="card cw"><div className="clbl">Needs attention</div><div className="cval">Mubarak</div><div className="csub">65% of target · ₹1.18L</div></div>
      <div className="card ci"><div className="clbl">Team MTD revenue</div><div className="cval">₹5.78L</div><div className="csub">Target ₹7.2L · 80%</div></div>
      <div className="card cp"><div className="clbl">Leads converted MTD</div><div className="cval">19</div></div>
    </div>
    <div className="panel">
      <div className="ptitle">📊 RM revenue comparison (5 months)</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={PERF_DATA} margin={{top:8,right:8,bottom:8,left:8}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="month" tick={{fontSize:10}} />
          <YAxis tick={{fontSize:10}} tickFormatter={fmt} />
          <Tooltip formatter={fmt} />
          <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
          <Bar dataKey="Arjun"      fill="#b5d4f4" />
          <Bar dataKey="Mubarak"    fill="#9FE1CB" />
          <Bar dataKey="Srinivasan" fill="#FAC775" />
          <Bar dataKey="Scott"      fill="#AFA9EC" />
        </BarChart>
      </ResponsiveContainer>
    </div>
    <div className="panel">
      <div className="ptitle">📋 Detailed comparison</div>
      <div className="tw"><table>
        <thead><tr><th>RM</th><th>Clients</th><th>MTD Rev</th><th>Target%</th><th>YTD Rev</th><th>Leads</th><th>Converted</th><th>Conv%</th><th>Interactions</th><th>Churn alerts</th></tr></thead>
        <tbody>
          {TABLE.map((r,i) => (
            <tr key={i}>
              <td>{r.rm}</td><td>{r.clients}</td><td>{r.mtd}</td>
              <td><span className={`ais ${sc(r.pct)}`}>{r.pct}%</span></td>
              <td>{r.ytd}</td><td>{r.leads}</td><td>{r.conv}</td>
              <td>{r.convPct}</td><td>{r.inter}</td><td>{r.churn}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  </div>
);
export default RMPerformance;
