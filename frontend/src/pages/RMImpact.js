import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const revData = [
  {rm:"Arjun",     pre:0,post:82000},
  {rm:"Mubarak",   pre:0,post:61000},
  {rm:"Srinivasan",pre:0,post:94000},
  {rm:"Scott",     pre:0,post:88000},
];
const volData = [
  {rm:"Arjun",     pre:12.4,post:18.2},
  {rm:"Mubarak",   pre:8.8, post:13.4},
  {rm:"Srinivasan",pre:15.2,post:22.6},
  {rm:"Scott",     pre:13.1,post:20.8},
];
const TABLE = [
  {rm:"Arjun",     measured:22, revPre:"—", revPost:"₹82,000",  revChg:<span className="ais l">New</span>, toPre:"₹12.4Cr",toPost:"₹18.2Cr",toChg:"+47%",floatChg:"+22%",unmap:4},
  {rm:"Mubarak",   measured:18, revPre:"—", revPost:"₹61,000",  revChg:<span className="ais l">New</span>, toPre:"₹8.8Cr", toPost:"₹13.4Cr",toChg:"+52%",floatChg:"+14%",unmap:6},
  {rm:"Srinivasan",measured:28, revPre:"—", revPost:"₹94,000",  revChg:<span className="ais l">New</span>, toPre:"₹15.2Cr",toPost:"₹22.6Cr",toChg:"+49%",floatChg:"+28%",unmap:3},
  {rm:"Scott",     measured:26, revPre:"—", revPost:"₹88,000",  revChg:<span className="ais l">New</span>, toPre:"₹13.1Cr",toPost:"₹20.8Cr",toChg:"+59%",floatChg:"+19%",unmap:3},
];
const UNMAP = [
  {ucc:"NV10278",name:"Farida Begum",rm:"Arjun",  since:"Jun 25", toPre:"₹4.2Cr",toPost:"₹0 (dormant)",  revPre:"₹18,000",revPost:"₹0",   rec:<span className="badge b-dor">Unmap</span>},
  {ucc:"NV40188",name:"Mohan Das",   rm:"Mubarak",since:"Aug 25", toPre:"₹3.1Cr",toPost:"₹1.8Cr (–42%)", revPre:"₹12,000",revPost:"₹7,000",rec:<span className="badge b-dor">Unmap</span>},
  {ucc:"NV50221",name:"Reena Thomas",rm:"Scott",  since:"Oct 25", toPre:"₹5.8Cr",toPost:"₹5.9Cr (+2%)",  revPre:"₹21,000",revPost:"₹22,000",rec:<span className="badge b-pend">Monitor</span>},
];

const RMImpact = () => (
  <div>
    <div className="ph"><h2>RM impact analysis</h2><p>Revenue and volume change per client — 3 months before RM mapping vs 3 months after</p></div>
    <div className="alert a-i">ℹ️ Only clients mapped for at least 3 months are included. Revenue attribution starts from opt-in date. Pre-mapping baseline uses the 3 calendar months before opt-in.</div>
    <div className="cards">
      <div className="card cs"><div className="clbl">Clients with revenue increase</div><div className="cval">68%</div><div className="csub">of all mapped clients</div></div>
      <div className="card ci"><div className="clbl">Avg options TO increase</div><div className="cval">+42%</div><div className="csub">post-mapping vs pre</div></div>
      <div className="card cw"><div className="clbl">Avg float increase</div><div className="cval">+18%</div><div className="csub">ledger balance change</div></div>
      <div className="card cd"><div className="clbl">Clients with no improvement</div><div className="cval">32%</div><div className="csub">Unmap candidates</div></div>
    </div>
    <div className="tc2">
      <div className="panel">
        <div className="ptitle">📊 RM attributed revenue — pre vs post mapping (avg/month)</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={revData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="rm" tick={{fontSize:10}} />
            <YAxis tick={{fontSize:10}} tickFormatter={v=>v?"₹"+(v/1000).toFixed(0)+"K":"₹0"} />
            <Tooltip formatter={v=>"₹"+v.toLocaleString("en-IN")} />
            <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
            <Bar dataKey="pre"  name="Avg monthly rev 3M pre-mapping (₹)" fill="#d3d1c7" />
            <Bar dataKey="post" name="Avg monthly rev 3M post-mapping (₹)" fill="#185fa5" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="panel">
        <div className="ptitle">📊 Options turnover — pre vs post mapping (₹Cr avg/month)</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={volData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="rm" tick={{fontSize:10}} />
            <YAxis tick={{fontSize:10}} />
            <Tooltip />
            <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
            <Bar dataKey="pre"  name="Avg options TO 3M pre (₹Cr)"  fill="#d3d1c7" />
            <Bar dataKey="post" name="Avg options TO 3M post (₹Cr)" fill="#9FE1CB" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
    <div className="panel">
      <div className="ptitle">📋 Per-RM summary — impact metrics</div>
      <div className="tw"><table>
        <thead><tr><th>RM</th><th>Clients measured</th><th>Avg rev pre</th><th>Avg rev post</th><th>Rev change</th><th>Avg options TO pre</th><th>Avg options TO post</th><th>TO change</th><th>Float change</th><th>Unmap candidates</th></tr></thead>
        <tbody>
          {TABLE.map((r,i)=>(
            <tr key={i}>
              <td>{r.rm}</td><td>{r.measured}</td><td>{r.revPre}</td><td>{r.revPost}</td><td>{r.revChg}</td>
              <td>{r.toPre}</td><td>{r.toPost}</td>
              <td style={{color:"var(--sc)"}}>{r.toChg}</td>
              <td style={{color:"var(--sc)"}}>{r.floatChg}</td>
              <td>{r.unmap}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
    <div className="panel">
      <div className="ptitle">👤 Clients showing no revenue improvement (unmap candidates)</div>
      <div className="tw"><table>
        <thead><tr><th>UCC</th><th>Client</th><th>RM</th><th>Mapped since</th><th>Options TO pre</th><th>Options TO post</th><th>Rev pre</th><th>Rev post</th><th>AI recommendation</th></tr></thead>
        <tbody>
          {UNMAP.map((r,i)=>(
            <tr key={i}>
              <td><span className="lc">{r.ucc}</span></td>
              <td>{r.name}</td><td>{r.rm}</td><td>{r.since}</td>
              <td>{r.toPre}</td><td>{r.toPost}</td>
              <td>{r.revPre}</td><td>{r.revPost}</td><td>{r.rec}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  </div>
);
export default RMImpact;