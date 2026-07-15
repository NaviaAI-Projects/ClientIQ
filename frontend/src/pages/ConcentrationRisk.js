import React from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const revConc  = [{name:"Top 10",pct:16},{name:"Top 25",pct:24},{name:"Top 50",pct:38},{name:"Top 100",pct:52},{name:"Top 200",pct:64},{name:"Top 500",pct:78},{name:"Rest",pct:100}];
const floatConc= [{name:"Top 10",pct:18},{name:"Top 25",pct:28},{name:"Top 50",pct:42},{name:"Top 100",pct:57},{name:"Top 200",pct:70},{name:"Rest",pct:100}];
const MO8 = ["Oct'25","Nov'25","Dec'25","Jan'26","Feb'26","Mar'26","Apr'26","May'26"];
const trendData= MO8.map((m,i)=>({ month:m, top10:[19,18,17,18,17,16,17,16][i], top50:[43,42,41,40,40,39,39,38][i], target:35 }));
const SEG_PIE  = [{name:"Eq Options clearing (40%)",value:40,color:"#185fa5"},{name:"Equity brokerage (30%)",value:30,color:"#9FE1CB"},{name:"Float income (20%)",value:20,color:"#AFA9EC"},{name:"MTF interest (10%)",value:10,color:"#FAC775"}];
const TOP20 = [
  {rank:1,ucc:"NV10234",name:"Priya Krishnan",  type:"RI-HV", to:"₹4.8Cr",rev:"₹22,000",pct:"0.77%",cum:"0.77%", rm:"Arjun",     flag:""},
  {rank:2,ucc:"NV50089",name:"David Mathew",    type:"RI-HV", to:"₹4.1Cr",rev:"₹18,400",pct:"0.65%",cum:"1.42%", rm:"—",         flag:<span className="badge b-pend">Unmapped</span>},
  {rank:3,ucc:"NV10045",name:"Kavitha Sharma",  type:"NRE-HV",to:"₹3.9Cr",rev:"₹5,400", pct:"0.19%",cum:"1.61%", rm:"Mubarak",   flag:<span className="badge b-lead">Zero-brk</span>},
  {rank:4,ucc:"NV60214",name:"Meenakshi Pillai",type:"NRE",   to:"₹3.2Cr",rev:"₹4,100", pct:"0.14%",cum:"1.75%", rm:"Srinivasan",flag:""},
  {rank:5,ucc:"NV80112",name:"Vasantha Rajan",  type:"RI",    to:"₹2.9Cr",rev:"₹3,700", pct:"0.13%",cum:"1.88%", rm:"—",         flag:<span className="badge b-pend">Unmapped</span>},
];
const MTF_TOP = [
  {rank:1,ucc:"NV10234",name:"Priya Krishnan", bal:"₹82L",pct:"9.3%",int:"₹1,460",status:<span className="badge b-act">OK</span>},
  {rank:2,ucc:"NV10021",name:"Rajan Pillai",   bal:"₹68L",pct:"7.7%",int:"₹1,210",status:<span className="badge b-act">OK</span>},
  {rank:3,ucc:"NV40112",name:"Sunita Kapoor",  bal:"₹64L",pct:"7.3%",int:"₹1,140",status:<span className="badge b-pend">Watch</span>},
  {rank:4,ucc:"NV30088",name:"Kaveri Nair",    bal:"₹58L",pct:"6.6%",int:"₹1,030",status:<span className="badge b-act">OK</span>},
  {rank:5,ucc:"NV20156",name:"Deepa Iyer",     bal:"₹47L",pct:"5.3%",int:"₹840",  status:<span className="badge b-act">OK</span>},
];
const FLOAT_TOP = [
  {rank:1,name:"David Mathew",   type:"RI-HV",  bal:"₹42L",pct:"1.8%",cum:"1.8%", act:<span className="badge b-act">Active</span>, util:<span className="badge b-act">High</span>},
  {rank:2,name:"Priya Krishnan", type:"RI-HV",  bal:"₹38L",pct:"1.6%",cum:"3.4%", act:<span className="badge b-act">Active</span>, util:<span className="badge b-act">High</span>},
  {rank:3,name:"Ramesh Babu",    type:"RI",     bal:"₹31L",pct:"1.3%",cum:"4.7%", act:<span className="badge b-pend">Low</span>,  util:<span className="badge b-pend">Idle</span>},
  {rank:4,name:"Rajan Pillai",   type:"NRE",    bal:"₹28L",pct:"1.2%",cum:"5.9%", act:<span className="badge b-act">Active</span>, util:<span className="badge b-act">High</span>},
  {rank:5,name:"Krishnadas V",   type:"RI-HV",  bal:"₹24L",pct:"1.0%",cum:"6.9%", act:<span className="badge b-pend">Low</span>,  util:<span className="badge b-pend">Idle</span>},
];

const ConcentrationRisk = () => (
  <div>
    <div className="ph"><h2>Concentration risk</h2><p>Revenue, float, MTF, options volume and client-type concentration — identify over-dependence before it becomes a problem</p></div>
    <div className="alert a-w">⚠️ Top 50 clients contribute <strong>38% of total options clearing revenue</strong>. Top 10 clients contribute <strong>16%</strong>. Monitor for sudden inactivity in high-concentration accounts.</div>
    <div className="cards">
      <div className="card cd"><div className="clbl">Top 10 clients — % of revenue</div><div className="cval">16%</div><div className="csub">₹4.5L of ₹28.4L MTD</div></div>
      <div className="card cw"><div className="clbl">Top 50 clients — % of revenue</div><div className="cval">38%</div><div className="csub">₹10.8L of ₹28.4L MTD</div></div>
      <div className="card ci"><div className="clbl">Top 10 — % of float</div><div className="cval">18%</div><div className="csub">₹41.6Cr of ₹231Cr total</div></div>
      <div className="card cp"><div className="clbl">Top 5 — % of MTF book</div><div className="cval">42%</div><div className="csub">₹3.7Cr of ₹8.81Cr book</div></div>
    </div>
    <div className="tc2">
      <div className="panel">
        <div className="ptitle">📊 Revenue concentration — cumulative client contribution</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={revConc} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="name" tick={{fontSize:10}} />
            <YAxis tick={{fontSize:10}} tickFormatter={v=>v+"%"} domain={[0,100]} />
            <Tooltip formatter={v=>v+"%"} />
            <Bar dataKey="pct" name="Cumulative % of options revenue" fill="#185fa5" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        <p style={{fontSize:"11px",color:"var(--tx3)",marginTop:"6px"}}>Pareto view: top N clients vs % of total options clearing revenue. Healthy = top 100 below 60%.</p>
      </div>
      <div className="panel">
        <div className="ptitle">📊 Float concentration — top clients by ledger balance</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={floatConc} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="name" tick={{fontSize:10}} />
            <YAxis tick={{fontSize:10}} tickFormatter={v=>v+"%"} domain={[0,100]} />
            <Tooltip formatter={v=>v+"%"} />
            <Bar dataKey="pct" name="% of total float" fill="#FAC775" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
    <div className="panel">
      <div className="ptitle">📈 Monthly concentration trend — are we moving in the right direction?</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={trendData} margin={{top:8,right:8,bottom:8,left:8}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="month" tick={{fontSize:10}} />
          <YAxis tick={{fontSize:10}} tickFormatter={v=>v+"%"} domain={[0,50]} />
          <Tooltip formatter={v=>v+"%"} />
          <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
          <Line type="monotone" dataKey="top10" name="Top 10 clients % of revenue" stroke="#a32d2d" strokeWidth={2} dot={{r:4}} fill="rgba(163,45,45,.07)" />
          <Line type="monotone" dataKey="top50" name="Top 50 clients % of revenue" stroke="#185fa5" strokeWidth={2} dot={{r:4}} fill="rgba(24,95,165,.06)" />
          <Line type="monotone" dataKey="target" name="Target — top 50 below 35%" stroke="#3b6d11" strokeDasharray="6 4" dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
      <p style={{fontSize:"11px",color:"var(--tx3)",marginTop:"8px"}}>Target: top-50 client revenue concentration below 35%. Current: 38% — declining from 43% in Oct &apos;25.</p>
    </div>
    <div className="panel">
      <div className="ptitle">📋 Top 20 clients by options revenue — concentration watch</div>
      <div className="tw"><table>
        <thead><tr><th>Rank</th><th>UCC</th><th>Name</th><th>Type</th><th>Options TO (MTD)</th><th>Revenue (MTD)</th><th>% of total rev</th><th>Cum %</th><th>RM</th><th>Risk flag</th></tr></thead>
        <tbody>
          {TOP20.map((r,i)=>(
            <tr key={i}>
              <td>{r.rank}</td><td><span className="lc">{r.ucc}</span></td><td>{r.name}</td>
              <td><span className="badge b-nri">{r.type}</span></td>
              <td>{r.to}</td><td>{r.rev}</td><td>{r.pct}</td><td>{r.cum}</td><td>{r.rm}</td><td>{r.flag}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
    <div className="tc2">
      <div className="panel">
        <div className="ptitle">💰 MTF book concentration — top 10 exposures</div>
        <div className="tw"><table>
          <thead><tr><th>Rank</th><th>UCC</th><th>Client</th><th>MTF balance</th><th>% of book</th><th>Interest/day</th><th>Margin status</th></tr></thead>
          <tbody>
            {MTF_TOP.map((r,i)=><tr key={i}><td>{r.rank}</td><td>{r.ucc}</td><td>{r.name}</td><td>{r.bal}</td><td>{r.pct}</td><td>{r.int}</td><td>{r.status}</td></tr>)}
            <tr style={{borderTop:"0.5px solid var(--br)",fontWeight:"500"}}><td colSpan="2">Top 5 total</td><td></td><td>₹3.19Cr</td><td>36.2%</td><td>₹5,680</td><td></td></tr>
          </tbody>
        </table></div>
      </div>
      <div className="panel">
        <div className="ptitle">📊 Segment &amp; revenue-stream concentration</div>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={SEG_PIE} dataKey="value" cx="40%" cy="50%" outerRadius={75} innerRadius={40}>
              {SEG_PIE.map((e,i)=><Cell key={i} fill={e.color} />)}
            </Pie>
            <Tooltip formatter={v=>v+"%"} />
            <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={10} wrapperStyle={{fontSize:11}} />
          </PieChart>
        </ResponsiveContainer>
        <p style={{fontSize:"11px",color:"var(--tx3)",marginTop:"6px"}}>Revenue dependency by segment. Regulatory change to Eq Options (40% driver) is the primary concentration risk.</p>
      </div>
    </div>
    <div className="panel">
      <div className="ptitle">📋 Float concentration — top 20 clients by opening balance</div>
      <div className="tw"><table>
        <thead><tr><th>Rank</th><th>Client</th><th>Type</th><th>Avg opening balance</th><th>% of total float</th><th>Cum %</th><th>Trading activity</th><th>Float utilisation</th></tr></thead>
        <tbody>
          {FLOAT_TOP.map((r,i)=><tr key={i}><td>{r.rank}</td><td>{r.name}</td><td><span className="badge b-ri">{r.type}</span></td><td>{r.bal}</td><td>{r.pct}</td><td>{r.cum}</td><td>{r.act}</td><td>{r.util}</td></tr>)}
        </tbody>
      </table></div>
      <div className="alert a-i" style={{marginTop:"10px"}}>💡 Clients with high float but low trading activity (Idle) are both a retention risk and a cross-sell opportunity.</div>
    </div>
  </div>
);
export default ConcentrationRisk;