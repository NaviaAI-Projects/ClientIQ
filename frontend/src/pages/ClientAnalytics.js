import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const DATES = ["4 May","5 May","6 May","7 May","8 May","11 May","12 May","13 May","14 May","15 May","18 May","19 May","20 May","21 May","22 May","1 Jun","2 Jun"];
const pnlData  = DATES.map((d,i)=>({ date:d, profit:[788,801,820,798,745,830,815,790,810,800,860,790,680,750,720,820,880][i], loss:[620,615,640,630,590,650,630,610,620,600,640,610,490,580,560,640,710][i] }));
const nriData  = DATES.map((d,i)=>({ date:d, NRI:[18,18,20,20,16,21,20,19,16,19,26,21,19,19,23,21,27][i], Resident:[173,201,184,200,164,182,210,179,203,169,187,204,177,200,160,174,213][i] }));
const TYPE_TABLE = [
  { type:"NRE",   cls:"b-nri",    active:14, eqOpt:12, cash:8, comm:3, mtf:4, avgOpt:"₹2.4Cr", avgBrk:"₹3,200" },
  { type:"NRO",   cls:"b-nri",    active:10, eqOpt:8,  cash:6, comm:2, mtf:2, avgOpt:"₹1.8Cr", avgBrk:"₹2,600" },
  { type:"NRE-HV",cls:"b-hv",     active:6,  eqOpt:6,  cash:3, comm:1, mtf:3, avgOpt:"₹4.8Cr", avgBrk:"₹6,200" },
  { type:"NRO-HV",cls:"b-hv",     active:4,  eqOpt:4,  cash:2, comm:1, mtf:2, avgOpt:"₹3.9Cr", avgBrk:"₹5,100" },
  { type:"RI-HV", cls:"b-hv",     active:48, eqOpt:44, cash:22,comm:10,mtf:18,avgOpt:"₹3.2Cr", avgBrk:"₹4,400" },
  { type:"RI",    cls:"b-ri",     active:2440,eqOpt:1860,cash:668,comm:322,mtf:100,avgOpt:"₹0.28Cr",avgBrk:"₹390" },
  { type:"FN",    cls:"b-fn",     active:5,  eqOpt:4,  cash:2, comm:1, mtf:1, avgOpt:"₹2.1Cr", avgBrk:"₹2,800" },
];
const HV_TABLE = [
  { ucc:"NV10234", name:"Priya Krishnan",  type:"RI-HV",  tc:"#fdefd0", tC:"#7a4510", to:"₹4.8Cr", brk:"₹22,000", float:"₹18L", mtf:"✓", rm:"Arjun",      status:<span className="badge b-act">Active</span> },
  { ucc:"NV50089", name:"David Mathew",    type:"RI-HV",  tc:"#fdefd0", tC:"#7a4510", to:"₹4.1Cr", brk:"₹18,400", float:"₹22L", mtf:"—", rm:"—",          status:<span className="badge b-lead">Unmapped</span> },
  { ucc:"NV10045", name:"Kavitha Sharma",  type:"NRE-HV", tc:"#c8e8f7", tC:"#0a5a80", to:"₹3.9Cr", brk:"₹5,400",  float:"₹14L", mtf:"—", rm:"Mubarak",    status:<span className="badge b-act">Active</span> },
  { ucc:"NV60214", name:"Meenakshi Pillai",type:"NRE",    tc:"",         tC:"",         to:"₹3.2Cr", brk:"₹4,100",  float:"₹9L",  mtf:"—", rm:"Srinivasan", status:<span className="badge b-int">Opt-in pending</span> },
];

const ClientAnalytics = () => (
  <div>
    <div className="ph"><h2>Client analytics</h2><p>Active client profile, trading behaviour, P&L outcomes, NRI vs Resident split, high-value client watch</p></div>
    <div className="cards">
      <div className="card ci"><div className="clbl">Total clients traded (Jun avg/day)</div><div className="cval">2,527</div><div className="csub">vs May 2,449 · +3.2%</div></div>
      <div className="card cs"><div className="clbl">Profitable clients (Jun avg/day)</div><div className="cval">820</div><div className="csub">32% of active traders</div></div>
      <div className="card cd"><div className="clbl">Loss clients (Jun avg/day)</div><div className="cval">640</div><div className="csub">25% of active traders</div></div>
      <div className="card cp"><div className="clbl">NRI clients (F&O avg/day)</div><div className="cval">24</div><div className="csub">vs May avg 20 · +20%</div></div>
    </div>
    <div className="tc2">
      <div className="panel">
        <div className="ptitle">📊 Profitable vs loss clients — daily F&O trend</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={pnlData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="date" tick={{fontSize:8}} interval={2} />
            <YAxis tick={{fontSize:10}} />
            <Tooltip />
            <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
            <Bar dataKey="profit" name="Profitable clients" fill="#3b6d11" />
            <Bar dataKey="loss"   name="Loss clients"       fill="#a32d2d" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="panel">
        <div className="ptitle">📈 NRI vs Resident F&O clients — daily trend</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={nriData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="date" tick={{fontSize:8}} interval={2} />
            <YAxis tick={{fontSize:10}} />
            <Tooltip />
            <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
            <Line type="monotone" dataKey="NRI"      name="NRI clients"         stroke="#185fa5" strokeWidth={2} dot={{r:3}} />
            <Line type="monotone" dataKey="Resident" name="Resident (÷100)"     stroke="#854f0b" strokeWidth={2} dot={{r:3}} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
    <div className="panel">
      <div className="ptitle">📋 Client type breakdown — active traders (Jun avg/day)</div>
      <div className="tw"><table>
        <thead><tr><th>Client type</th><th>Active/day</th><th>Eq Options</th><th>Eq Cash</th><th>Commodity</th><th>MTF users</th><th>Avg options TO/client</th><th>Avg brokerage/client</th></tr></thead>
        <tbody>
          {TYPE_TABLE.map((r,i)=>(
            <tr key={i}>
              <td><span className={`badge ${r.cls}`}>{r.type}</span></td>
              <td>{r.active.toLocaleString("en-IN")}</td><td>{r.eqOpt}</td><td>{r.cash}</td><td>{r.comm}</td><td>{r.mtf}</td>
              <td>{r.avgOpt}</td><td>{r.avgBrk}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p style={{fontSize:"11px",color:"var(--tx3)",marginTop:"6px"}}>NRE-HV and NRO-HV clients have 12–17× higher avg options TO per client than standard RI clients.</p>
    </div>
    <div className="tc2">
      <div className="panel">
        <div className="ptitle">⭐ High-value client watch (HV + NRI-HV) — Jun MTD</div>
        <div className="tw"><table>
          <thead><tr><th>UCC</th><th>Name</th><th>Type</th><th>Options TO</th><th>Brokerage</th><th>Float</th><th>MTF</th><th>RM</th><th>Status</th></tr></thead>
          <tbody>
            {HV_TABLE.map((r,i)=>(
              <tr key={i}>
                <td><span className="lc">{r.ucc}</span></td>
                <td>{r.name}</td>
                <td><span className="badge" style={{background:r.tc||"var(--ibg)",color:r.tC||"var(--ic)"}}>{r.type}</span></td>
                <td>{r.to}</td><td>{r.brk}</td><td>{r.float}</td><td>{r.mtf}</td><td>{r.rm}</td><td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      <div className="panel">
        <div className="ptitle">🔍 Individual client drill-down</div>
        <div className="brow" style={{marginBottom:"10px"}}>
          <input style={{width:"220px"}} placeholder="Enter UCC to analyse…" />
          <select style={{width:"130px"}}><option>Last 1 month</option><option>Last 3 months</option><option>Last 6 months</option></select>
          <button className="btn bp">🔍 Load client</button>
        </div>
        <div className="alert a-i">ℹ️ Enter any UCC to view their full trade profile: options premium TO, lot count, strike preference, expiry-week activity, win/loss ratio, float utilisation, and AI pattern analysis.</div>
      </div>
    </div>
  </div>
);
export default ClientAnalytics;