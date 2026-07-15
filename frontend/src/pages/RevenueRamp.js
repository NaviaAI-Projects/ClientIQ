import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const MTHS8 = ["M1","M2","M3","M4","M5","M6","M7","M8"];
const rampData = MTHS8.map((m,i)=>({ month:m, all:[280,380,510,580,610,620,618,615][i], optAct:[420,610,840,980,1050,1100,1090,1085][i], nonOpt:[180,220,280,310,320,325,322,320][i] }));
const COHORTS = ["Jun'25","Sep'25","Dec'25","Feb'26","Apr'26"];
const optActData = COHORTS.map((m,i)=>({ cohort:m, pct:[41,43,44,46,44][i] }));
const splitData = [{label:"Options activated",m3:840,m6:1100},{label:"Equity only",m3:280,m6:325},{label:"Never options",m3:90,m6:110}];
const TABLE = [
  { cohort:"Jun '25", clients:963,  m1:"₹242",m2:"₹318",m3:"₹468",m6:"₹598",m12:"₹612",optAct:"41%",idx:<span className="ais l">98</span> },
  { cohort:"Sep '25", clients:1207, m1:"₹268",m2:"₹341",m3:"₹489",m6:"₹624",m12:"—",   optAct:"43%",idx:<span className="ais l">102</span> },
  { cohort:"Dec '25", clients:1167, m1:"₹271",m2:"₹352",m3:"₹498",m6:"—",   m12:"—",   optAct:"44%",idx:"—" },
  { cohort:"Feb '26", clients:1072, m1:"₹284",m2:"₹368",m3:"—",   m6:"—",   m12:"—",   optAct:"46%",idx:"—" },
  { cohort:"Apr '26", clients:859,  m1:"₹291",m2:"—",   m3:"—",   m6:"—",   m12:"—",   optAct:"—",  idx:"—" },
];

const RevenueRamp = () => (
  <div>
    <div className="ph"><h2>Client revenue ramp</h2><p>How quickly do new clients generate revenue? Average monthly contribution at M1, M3, M6, M12 by opening cohort</p></div>
    <div className="cards">
      <div className="card ci"><div className="clbl">Avg M1 revenue/new client</div><div className="cval">₹280</div><div className="csub">Month 1 after account opening</div></div>
      <div className="card cs"><div className="clbl">Avg M3 revenue/new client</div><div className="cval">₹510</div><div className="csub">Month 3 — +82% from M1</div></div>
      <div className="card cw"><div className="clbl">Avg M6 revenue/new client</div><div className="cval">₹620</div><div className="csub">Month 6 — ramp stabilises</div></div>
      <div className="card cp"><div className="clbl">Options activation by M2</div><div className="cval">44%</div><div className="csub">New clients who trade options within 60d</div></div>
    </div>
    <div className="panel">
      <div className="ptitle">📈 Revenue ramp curve — avg monthly revenue per client from opening month</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={rampData} margin={{top:8,right:8,bottom:8,left:8}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="month" tick={{fontSize:10}} />
          <YAxis tick={{fontSize:10}} tickFormatter={v=>"₹"+v} />
          <Tooltip formatter={v=>"₹"+v} />
          <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
          <Line type="monotone" dataKey="all"    name="All new clients (avg ₹/month)"                stroke="#185fa5" strokeWidth={2} dot={{r:4}} fill="rgba(24,95,165,0.08)" />
          <Line type="monotone" dataKey="optAct" name="Options-activated by M2 (avg ₹/month)"        stroke="#3b6d11" strokeWidth={2} dot={{r:4}} fill="rgba(59,109,17,0.06)" />
          <Line type="monotone" dataKey="nonOpt" name="Non-options clients (avg ₹/month)"            stroke="#854f0b" strokeDasharray="4 4" dot={{r:3}} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
      <p style={{fontSize:"11px",color:"var(--tx3)",marginTop:"6px"}}>Revenue per client peaks around M4–M5 then stabilises. M1–M3 is the critical window where RM contact drives the steepest gains.</p>
    </div>
    <div className="tc2">
      <div className="panel">
        <div className="ptitle">📊 Options activation rate by cohort — % who trade options within 60 days</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={optActData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="cohort" tick={{fontSize:10}} />
            <YAxis tick={{fontSize:10}} tickFormatter={v=>v+"%"} domain={[0,60]} />
            <Tooltip formatter={v=>v+"%"} />
            <Bar dataKey="pct" name="% activated options within 60 days" fill="#185fa5" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        <p style={{fontSize:"11px",color:"var(--tx3)",marginTop:"6px"}}>Options-activated clients generate 3× more revenue at M6.</p>
      </div>
      <div className="panel">
        <div className="ptitle">📊 Avg revenue at M6 — options vs non-options activated clients</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={splitData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="label" tick={{fontSize:10}} />
            <YAxis tick={{fontSize:10}} tickFormatter={v=>"₹"+v} />
            <Tooltip formatter={v=>"₹"+v} />
            <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
            <Bar dataKey="m3" name="M3 avg rev/client" fill="#9FE1CB" />
            <Bar dataKey="m6" name="M6 avg rev/client" fill="#185fa5" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
    <div className="panel">
      <div className="ptitle">📋 Cohort revenue ramp — by opening month (₹ avg/client/month)</div>
      <div className="tw"><table>
        <thead><tr><th>Opening cohort</th><th>Clients</th><th>M1 avg rev</th><th>M2 avg rev</th><th>M3 avg rev</th><th>M6 avg rev</th><th>M12 avg rev</th><th>Options activation %</th><th>M6 revenue index</th></tr></thead>
        <tbody>
          {TABLE.map((r,i)=>(
            <tr key={i}><td>{r.cohort}</td><td>{r.clients.toLocaleString("en-IN")}</td><td>{r.m1}</td><td>{r.m2}</td><td>{r.m3}</td><td>{r.m6}</td><td>{r.m12}</td><td>{r.optAct}</td><td>{r.idx}</td></tr>
          ))}
        </tbody>
      </table></div>
    </div>
  </div>
);
export default RevenueRamp;