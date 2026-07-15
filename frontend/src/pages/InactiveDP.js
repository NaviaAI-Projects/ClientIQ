import React from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const BAND_DATA = [
  {band:"30–90 days", withDP:820, noDP:2840},
  {band:"90–180 days",withDP:640, noDP:1980},
  {band:"180–365 days",withDP:480,noDP:1240},
  {band:"365+ days",  withDP:220, noDP:890},
  {band:"Never traded",withDP:380,noDP:3828},
];
const TYPE_PIE = [
  {name:"RI",color:"#d3d1c7",value:1840},{name:"RI-HV",color:"#FAC775",value:480},
  {name:"NRE/NRO",color:"#185fa5",value:340},{name:"NRE-HV/NRO-HV",color:"#9FE1CB",value:140},{name:"FN",color:"#AFA9EC",value:40},
];
const HOLD_DATA = [{range:"<₹50K",c:480},{range:"₹50K–₹2L",c:820},{range:"₹2L–₹5L",c:640},{range:"₹5L–₹10L",c:420},{range:"₹10L–₹25L",c:280},{range:">₹25L",c:200}];
const PRIORITY = [
  {ucc:"NV11201",name:"Subramaniam R",type:"RI-HV",last:"Nov 2025",days:196,hold:"₹8.4L",stocks:12,age:"4.2 yrs",rm:"—"},
  {ucc:"NV22408",name:"Fatima Sheikh", type:"NRE",  last:"Dec 2025",days:162,hold:"₹6.1L",stocks:8, age:"2.8 yrs",rm:"—"},
  {ucc:"NV33812",name:"Mohan Pillai",  type:"RI",   last:"Jan 2026",days:142,hold:"₹4.8L",stocks:6, age:"6.1 yrs",rm:"Arjun"},
  {ucc:"NV44201",name:"Anitha Krishnan",type:"RI-HV",last:"Oct 2025",days:228,hold:"₹11.2L",stocks:18,age:"3.4 yrs",rm:"—"},
  {ucc:"NV55318",name:"Prakash Nair",  type:"NRO",  last:"Feb 2026",days:112,hold:"₹3.2L",stocks:5, age:"1.9 yrs",rm:"—"},
];

const InactiveDP = () => (
  <div>
    <div className="ph"><h2>Inactive accounts &amp; DP holdings</h2><p>Accounts with no trades — segmented by inactivity duration and whether they hold securities in DP.</p></div>
    <div className="alert a-w">⚠️ Clients with DP holdings are significantly more valuable to reactivate — they have assets already custodied with you. An options or equity trade from these clients is one conversation away.</div>
    <div className="cards">
      <div className="card cd"><div className="clbl">Total inactive accounts</div><div className="cval">14,591</div><div className="csub">No trade in last 30 days</div></div>
      <div className="card cw"><div className="clbl">Inactive with DP holdings</div><div className="cval">2,840</div><div className="csub">Hold securities — highest priority</div></div>
      <div className="card cp"><div className="clbl">Holding value (inactive DP)</div><div className="cval">₹284Cr</div><div className="csub">Avg ₹1.0L per inactive DP client</div></div>
    </div>
    <div className="tc2">
      <div className="panel">
        <div className="ptitle">📊 Inactive accounts by duration band</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={BAND_DATA} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="band" tick={{fontSize:9}} />
            <YAxis tick={{fontSize:10}} />
            <Tooltip />
            <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
            <Bar dataKey="withDP" name="With DP holdings"      fill="#185fa5" stackId="s" />
            <Bar dataKey="noDP"   name="No holdings or balance" fill="#d3d1c7" stackId="s" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="panel">
        <div className="ptitle">📊 Inactive with DP holdings — by client type</div>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={TYPE_PIE} dataKey="value" cx="40%" cy="50%" outerRadius={75} innerRadius={40}>
              {TYPE_PIE.map((e,i)=><Cell key={i} fill={e.color} />)}
            </Pie>
            <Tooltip />
            <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={10} wrapperStyle={{fontSize:11}} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
    <div className="panel">
      <div className="ptitle">💼 Inactive accounts WITH DP holdings — priority reactivation list</div>
      <p style={{fontSize:"12px",color:"var(--tx2)",marginBottom:"10px"}}>These clients have securities custodied with Navia but are not trading. They are the highest-value reactivation targets.</p>
      <div className="brow">
        <select style={{width:"140px"}}><option>All durations</option><option>30–90 days inactive</option><option>90–180 days</option><option>180+ days</option></select>
        <select style={{width:"120px"}}><option>All types</option><option>NRE/NRO</option><option>RI-HV</option><option>RI</option></select>
        <button className="btn bp">🤖 Auto-assign as leads</button>
        <button className="btn">⬇ Export list</button>
      </div>
      <div className="tw"><table>
        <thead><tr><th>UCC</th><th>Name</th><th>Type</th><th>Last trade</th><th>Inactive (days)</th><th>Holding value</th><th>No. of stocks</th><th>Account age</th><th>RM</th><th>Action</th></tr></thead>
        <tbody>
          {PRIORITY.map((r,i)=>(
            <tr key={i}>
              <td><span className="lc">{r.ucc}</span></td>
              <td>{r.name}</td>
              <td><span className={`badge ${r.type.includes("NR")?"b-nri":r.type.includes("HV")?"b-hv":"b-ri"}`}>{r.type}</span></td>
              <td>{r.last}</td><td>{r.days}</td>
              <td style={{fontWeight:"500",color:"var(--sc)"}}>{r.hold}</td>
              <td>{r.stocks}</td><td>{r.age}</td><td>{r.rm}</td>
              <td><button className={`btn sm ${r.rm==="—"?"bp":""}`}>{r.rm==="—"?"Assign lead":"Contact"}</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
    <div className="panel">
      <div className="ptitle">📊 DP holding value distribution — inactive clients with holdings</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={HOLD_DATA} margin={{top:8,right:8,bottom:8,left:8}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="range" tick={{fontSize:9}} />
          <YAxis tick={{fontSize:10}} />
          <Tooltip />
          <Bar dataKey="c" name="Inactive clients with DP holdings" fill="#185fa5" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
      <p style={{fontSize:"11px",color:"var(--tx3)",marginTop:"6px"}}>Clients with holdings &gt;₹2L are the most actionable reactivation targets.</p>
    </div>
    <div className="panel">
      <div className="ptitle">📅 Never-traded accounts — opened but no trade recorded</div>
      <div className="tc2" style={{marginBottom:0}}>
        <div>
          <div className="cards" style={{marginBottom:0}}>
            <div className="card cd"><div className="clbl">Never traded</div><div className="cval">4,820</div><div className="csub">Account opened, zero trades ever</div></div>
            <div className="card cw"><div className="clbl">With DP holdings</div><div className="cval">380</div><div className="csub">Transferred in stocks, never traded</div></div>
            <div className="card cp"><div className="clbl">Opened &lt;90 days ago</div><div className="cval">2,140</div><div className="csub">Still in activation window</div></div>
          </div>
        </div>
        <div>
          <div className="alert a-i">💡 Never-traded clients who funded their account are the highest-conversion reactivation target. The 380 who transferred DP holdings are the highest-priority — they moved assets to you and then stopped.</div>
          <div className="brow" style={{marginTop:"8px"}}>
            <button className="btn bp">🤖 Generate outreach list (never-traded with DP holdings)</button>
            <button className="btn">⬇ Export</button>
          </div>
        </div>
      </div>
    </div>
  </div>
);
export default InactiveDP;