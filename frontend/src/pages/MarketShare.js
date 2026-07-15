import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const MO9 = ["Oct'25","Nov'25","Dec'25","Jan'26","Feb'26","Mar'26","Apr'26","May'26","Jun'26"];
const shareData = MO9.map((m,i)=>({ month:m, EqOpt:[0.109,0.104,0.098,0.091,0.091,0.085,0.091,0.092,0.079][i], EqFut:[0.013,0.015,0.014,0.009,0.008,0.010,0.011,0.007,0.007][i] }));
const volData   = MO9.map((m,i)=>({ month:m, Navia:[63.3,56.7,47.9,60.4,64.0,79.9,58.9,61.8,67.4][i], Exchange:[57.8,54.6,49.1,66.5,70.1,93.8,64.2,67.2,85.8][i] }));
const TABLE = [
  { m:"Jun '26",  nEq:67.4,  xEq:"85,754", sEq:"0.079%", nComm:6.6, xComm:"3,41,571", sComm:"0.002%", nFut:7.0,  sFut:"0.007%" },
  { m:"May '26",  nEq:61.8,  xEq:"67,249", sEq:"0.092%", nComm:5.4, xComm:"9,24,888", sComm:"0.001%", nFut:12.0, sFut:"0.007%" },
  { m:"Apr '26",  nEq:58.9,  xEq:"64,158", sEq:"0.092%", nComm:4.8, xComm:"8,79,619", sComm:"0.001%", nFut:17.4, sFut:"0.011%" },
  { m:"Mar '26",  nEq:79.9,  xEq:"93,792", sEq:"0.085%", nComm:7.8, xComm:"6,38,076", sComm:"0.001%", nFut:18.3, sFut:"0.010%" },
  { m:"Feb '26",  nEq:64.0,  xEq:"70,056", sEq:"0.091%", nComm:4.0, xComm:"5,79,782", sComm:"0.001%", nFut:13.5, sFut:"0.008%" },
  { m:"Jan '26",  nEq:60.4,  xEq:"66,463", sEq:"0.091%", nComm:5.0, xComm:"5,64,328", sComm:"0.001%", nFut:15.8, sFut:"0.009%" },
  { m:"Dec '25",  nEq:47.9,  xEq:"49,089", sEq:"0.098%", nComm:4.0, xComm:"7,17,716", sComm:"0.001%", nFut:19.5, sFut:"0.014%" },
  { m:"Nov '25",  nEq:56.7,  xEq:"54,574", sEq:"0.104%", nComm:4.3, xComm:"6,94,246", sComm:"0.001%", nFut:24.1, sFut:"0.015%" },
  { m:"Oct '25",  nEq:63.3,  xEq:"57,780", sEq:"0.109%", nComm:4.6, xComm:"6,32,135", sComm:"0.001%", nFut:20.7, sFut:"0.013%" },
];

const MarketShare = () => (
  <div>
    <div className="ph"><h2>Market share analysis</h2><p>Navia's share of exchange volumes — monthly view · Data auto-fetched from configured exchange feed URLs</p></div>
    <div className="cards">
      <div className="card ci"><div className="clbl">Eq Options mkt share (Jun)</div><div className="cval">0.079%</div><div className="csub">vs May 0.092% · –14%</div></div>
      <div className="card cs"><div className="clbl">Peak mkt share (Eq Opt)</div><div className="cval">0.109%</div><div className="csub">Oct 2025</div></div>
      <div className="card cw"><div className="clbl">Exchange Eq Options avg/day</div><div className="cval">₹85,754Cr</div><div className="csub">Jun 2026</div></div>
      <div className="card cd"><div className="clbl">Navia Eq Options avg/day</div><div className="cval">₹67.4Cr</div><div className="csub">Jun 2026</div></div>
    </div>
    <div className="alert a-i">🔄 Exchange volumes last fetched: 2 Jun 2026 10:30 AM. Configure feed URLs in Admin → MIS Settings. <button className="btn sm" style={{marginLeft:"8px"}}>🔄 Refresh now</button></div>
    <div className="panel">
      <div className="ptitle">📈 Navia market share trend by segment (%)</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={shareData} margin={{top:8,right:8,bottom:8,left:8}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="month" tick={{fontSize:10}} />
          <YAxis tick={{fontSize:10}} tickFormatter={v=>v.toFixed(3)+"%"} />
          <Tooltip formatter={v=>v.toFixed(3)+"%"} />
          <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
          <Line type="monotone" dataKey="EqOpt" name="Eq Options mkt share (%)" stroke="#185fa5" strokeWidth={2} dot={{r:4}} fill="rgba(24,95,165,0.08)" />
          <Line type="monotone" dataKey="EqFut" name="Eq Futures mkt share (%)" stroke="#FAC775" strokeWidth={2} dot={{r:4}} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="panel">
      <div className="ptitle">📋 Monthly market share table</div>
      <div className="tw"><table>
        <thead><tr><th>Month</th><th>Navia Eq Opt (₹Cr/d)</th><th>Exchange (₹Cr/d)</th><th>Mkt share</th><th>Navia Comm Opt</th><th>Exchange Comm</th><th>Comm share</th><th>Navia Eq Fut</th><th>Eq Fut share</th></tr></thead>
        <tbody>
          {TABLE.map((r,i)=>(
            <tr key={i}>
              <td>{r.m}</td><td>{r.nEq}</td><td>{r.xEq}</td>
              <td style={{fontWeight:i===0?"600":"normal",color:i===2?"var(--sc)":"inherit"}}>{r.sEq}</td>
              <td>{r.nComm}</td><td>{r.xComm}</td><td>{r.sComm}</td><td>{r.nFut}</td><td>{r.sFut}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
    <div className="panel">
      <div className="ptitle">📊 Navia volume vs exchange benchmark (Eq Options)</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={volData} margin={{top:8,right:8,bottom:8,left:8}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="month" tick={{fontSize:10}} />
          <YAxis tick={{fontSize:10}} />
          <Tooltip />
          <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
          <Bar dataKey="Navia"    name="Navia Eq Options (₹Cr/day)" fill="#b5d4f4" />
          <Bar dataKey="Exchange" name="Exchange Eq Options avg (÷1000)" fill="#e0e0e0" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);
export default MarketShare;