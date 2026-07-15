import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const MO12 = ["Jun'25","Jul'25","Aug'25","Sep'25","Oct'25","Nov'25","Dec'25","Jan'26","Feb'26","Mar'26","Apr'26","May'26"];
const activeData = MO12.map((m,i)=>({ month:m, clients:[5240,5380,5620,5810,5831,5656,5860,5823,5933,5686,5714,5409][i] }));
const MTHS = ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11','M12'];
const cohortData = MTHS.map((m,i)=>({ month:m, navia:[72,58,44,38,34,32,30,29,28,27,25,22][i], industry:[65,50,38,32,28,26,24,23,22,21,20,18][i] }));
const reactiveData = MO12.map((m,i)=>({ month:m, reactivated:[41,38,44,52,48,55,61,58,49,64,71,68][i], rmAssisted:[0,0,0,8,12,18,22,24,20,28,34,31][i] }));
const COHORT_ROWS = [
  { cohort:"Jun '25", opened:963,  m1:"72%", m3:"44%", m6:"38%", m9:"29%", m12:"22%", m1c:"var(--sc)", m3c:"var(--wc)", m6c:"var(--wc)", m9c:"var(--dc)", m12c:"var(--dc)" },
  { cohort:"Sep '25", opened:1207, m1:"74%", m3:"46%", m6:"40%", m9:"31%", m12:"—",   m1c:"var(--sc)", m3c:"var(--wc)", m6c:"var(--wc)", m9c:"var(--dc)", m12c:"inherit" },
  { cohort:"Dec '25", opened:1167, m1:"76%", m3:"48%", m6:"—",   m9:"—",   m12:"—",   m1c:"var(--sc)", m3c:"var(--wc)", m6c:"inherit",   m9c:"inherit",   m12c:"inherit" },
  { cohort:"Feb '26", opened:1072, m1:"71%", m3:"—",   m6:"—",   m9:"—",   m12:"—",   m1c:"var(--sc)", m3c:"inherit",   m6c:"inherit",   m9c:"inherit",   m12c:"inherit" },
  { cohort:"Apr '26", opened:859,  m1:"68%", m3:"—",   m6:"—",   m9:"—",   m12:"—",   m1c:"var(--sc)", m3c:"inherit",   m6c:"inherit",   m9c:"inherit",   m12c:"inherit" },
];
const MONTHLY_ROWS = [
  { m:"Jun '26 (MTD)",eqOpt:2010,cash:714,commFO:322,eqFut:141,total:"5,409 est.",mom:"-5.3%",momC:"var(--dc)",newAct:739,churned:486 },
  { m:"May '26",      eqOpt:3334,cash:2135,commFO:683,eqFut:126,total:"5,409",    mom:"-5.3%",momC:"var(--dc)",newAct:739,churned:486 },
  { m:"Apr '26",      eqOpt:3585,cash:2201,commFO:722,eqFut:136,total:"5,714",    mom:"+0.5%",momC:"var(--sc)",newAct:924,churned:421 },
  { m:"Mar '26",      eqOpt:3621,cash:2160,commFO:731,eqFut:129,total:"5,686",    mom:"-4.2%",momC:"var(--dc)",newAct:840,churned:484 },
  { m:"Feb '26",      eqOpt:3719,cash:2354,commFO:727,eqFut:134,total:"5,933",    mom:"+1.9%",momC:"var(--sc)",newAct:914,churned:392 },
  { m:"Jan '26",      eqOpt:3600,cash:2370,commFO:739,eqFut:148,total:"5,823",    mom:"-0.6%",momC:"var(--dc)",newAct:840,churned:471 },
];
const heatCell = (val,color) => val==="—" ? <td>—</td> : <td><span style={{background:color==="var(--sc)"?"var(--sbg)":color==="var(--wc)"?"var(--wbg)":"var(--dbg)",padding:"2px 8px",borderRadius:"4px",fontSize:"11px",fontWeight:"500",color}}>{val}</span></td>;

const Retention = () => (
  <div>
    <div className="ph"><h2>Client retention &amp; cohort analysis</h2><p>Of clients who opened in month X — what % are still trading at 1, 3, 6, 12 months?</p></div>
    <div className="cards">
      <div className="card ci"><div className="clbl">Monthly active clients (May '26)</div><div className="cval">5,409</div><div className="csub">vs Apr 5,714 · –5.3%</div></div>
      <div className="card cs"><div className="clbl">30-day retention (new clients)</div><div className="cval">68%</div><div className="csub">of new clients trade again within 30d</div></div>
      <div className="card cw"><div className="clbl">90-day retention</div><div className="cval">41%</div><div className="csub">industry avg ~35% · Navia above avg</div></div>
      <div className="card cd"><div className="clbl">Churn this month</div><div className="cval">486</div><div className="csub">Active in Apr, not in May</div></div>
    </div>
    <div className="panel">
      <div className="ptitle">📈 Monthly unique active clients — 12 month trend</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={activeData} margin={{top:8,right:8,bottom:8,left:8}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="month" tick={{fontSize:10}} />
          <YAxis tick={{fontSize:10}} domain={[4800,'auto']} />
          <Tooltip />
          <Line type="monotone" dataKey="clients" name="Monthly active clients" stroke="#185fa5" strokeWidth={2} dot={{r:4}} fill="rgba(24,95,165,0.08)" />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="panel">
      <div className="ptitle">📊 Cohort retention heatmap — % still trading at N months after opening</div>
      <div className="tw"><table>
        <thead><tr><th>Opening cohort</th><th>Accounts opened</th><th>M1 active %</th><th>M3 active %</th><th>M6 active %</th><th>M9 active %</th><th>M12 active %</th></tr></thead>
        <tbody>
          {COHORT_ROWS.map((r,i)=>(
            <tr key={i}>
              <td>{r.cohort}</td>
              <td>{r.opened.toLocaleString("en-IN")}</td>
              {heatCell(r.m1,r.m1c)}{heatCell(r.m3,r.m3c)}{heatCell(r.m6,r.m6c)}{heatCell(r.m9,r.m9c)}{heatCell(r.m12,r.m12c)}
            </tr>
          ))}
        </tbody>
      </table></div>
      <div className="alert a-i" style={{marginTop:"10px"}}>💡 M1 retention is healthy at 68–76%. M3 drop to ~45% is the critical intervention window.</div>
    </div>
    <div className="tc2">
      <div className="panel">
        <div className="ptitle">📈 Retention curve — Jun '25 cohort (963 clients)</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={cohortData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{fontSize:10}} />
            <YAxis tick={{fontSize:10}} tickFormatter={v=>v+"%"} domain={[0,100]} />
            <Tooltip formatter={v=>v+"%"} />
            <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
            <Line type="monotone" dataKey="navia"    name="Navia retention %" stroke="#185fa5" strokeWidth={2} dot={{r:4}} fill="rgba(24,95,165,0.08)" />
            <Line type="monotone" dataKey="industry" name="Industry avg"      stroke="#9FE1CB" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="panel">
        <div className="ptitle">🔄 Reactivation — dormant clients who returned</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={reactiveData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{fontSize:10}} />
            <YAxis tick={{fontSize:10}} />
            <Tooltip />
            <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
            <Bar dataKey="reactivated" name="Reactivated clients" fill="#9FE1CB" />
            <Bar dataKey="rmAssisted"  name="RM-assisted"         fill="#185fa5" />
          </BarChart>
        </ResponsiveContainer>
        <p style={{fontSize:"11px",color:"var(--tx3)",marginTop:"6px"}}>Dormant = no trade for 60+ days then traded again.</p>
      </div>
    </div>
    <div className="panel">
      <div className="ptitle">📋 Monthly active client trend — by segment</div>
      <div className="tw"><table>
        <thead><tr><th>Month</th><th>Eq Options</th><th>Eq Cash</th><th>Comm F&O</th><th>Eq Futures</th><th>Total unique</th><th>MoM change</th><th>New activations</th><th>Churned</th></tr></thead>
        <tbody>
          {MONTHLY_ROWS.map((r,i)=>(
            <tr key={i}>
              <td>{r.m}</td><td>{r.eqOpt.toLocaleString("en-IN")}</td><td>{r.cash.toLocaleString("en-IN")}</td>
              <td>{r.commFO}</td><td>{r.eqFut}</td><td>{r.total}</td>
              <td style={{color:r.momC}}>{r.mom}</td><td>{r.newAct}</td><td>{r.churned}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  </div>
);
export default Retention;