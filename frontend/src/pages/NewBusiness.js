import React from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const MONTHS = ["Apr'25","May'25","Jun'25","Jul'25","Aug'25","Sep'25","Oct'25","Nov'25","Dec'25","Jan'26","Feb'26","Mar'26","Apr'26"];
const clientData = MONTHS.map((m,i)=>({ month:m, EqCash:[null,null,null,null,2201,2364,2470,2280,2385,2370,2354,2160,2201][i], EqOpt:[null,null,null,null,3270,3478,3536,3498,3595,3600,3719,3621,3585][i], EqFut:[null,null,null,null,146,147,144,152,161,148,134,129,136][i] }));
const volData    = MONTHS.map((m,i)=>({ month:m, EqOpt:[null,null,null,null,50.9,50.9,63.3,56.7,47.9,60.4,64.0,79.9,58.9][i], CommFO:[null,null,null,null,38.8,38.7,44.2,35.0,29.4,32.7,21.5,31.4,22.8][i] }));
const newAcctData= MONTHS.map((m,i)=>({ month:m, opened:[1369,1151,963,1065,963,1207,1095,1299,1167,1046,1072,1202,859][i], trading:[1023,1141,1147,1051,889,1079,1110,973,934,840,914,840,924][i] }));
const ledgerData = MONTHS.map((m,i)=>({ month:m, balance:[28077409,18974294,12664293,14221151,18602042,15200827,25142191,19166068,17473276,16453057,21796154,19719519,25895723][i] }));
const SEG_TABLE = [
  { seg:"Equity Cash",      apr26:2201, aprVol:20.9, mar:2160, marVol:17.4, feb:2354, chg:"-3.8%", chgC:"var(--dc)" },
  { seg:"Equity Futures",   apr26:136,  aprVol:17.4, mar:129,  marVol:18.3, feb:134,  chg:"-0.7%", chgC:"var(--dc)" },
  { seg:"Equity Options",   apr26:3585, aprVol:58.9, mar:3621, marVol:79.9, feb:3719, chg:"-1.7%", chgC:"var(--dc)" },
  { seg:"Commodity Futures",apr26:321,  aprVol:17.7, mar:311,  marVol:23.6, feb:290,  chg:"+0.8%", chgC:"var(--sc)" },
  { seg:"Commodity Options",apr26:722,  aprVol:5.2,  mar:731,  marVol:7.8,  feb:727,  chg:"-1.4%", chgC:"var(--dc)" },
  { seg:"Total (unique)",   apr26:5714, aprVol:120.0,mar:5686, marVol:147.1,feb:5933, chg:"-1.7%", chgC:"var(--dc)" },
];
const NEW_TABLE = [
  { seg:"Equity Cash",      newC:482, vol:2.61, chgC:"+19.4%", cC:"var(--sc)", chgV:"+82.6%", vC:"var(--sc)" },
  { seg:"Equity Futures",   newC:9,   vol:1.71, chgC:"+42.1%", cC:"var(--sc)", chgV:"+142%",  vC:"var(--sc)" },
  { seg:"Equity Options",   newC:600, vol:4.02, chgC:"+0.9%",  cC:"var(--sc)", chgV:"-11.6%", vC:"var(--dc)" },
  { seg:"Commodity Futures",newC:48,  vol:3.21, chgC:"+9.9%",  cC:"var(--sc)", chgV:"-20.4%", vC:"var(--dc)" },
  { seg:"Commodity Options",newC:145, vol:0.78, chgC:"+7.7%",  cC:"var(--sc)", chgV:"+70.2%", vC:"var(--sc)" },
  { seg:"Total (new)",      newC:924, vol:12.34,chgC:"+6.9%",  cC:"var(--sc)", chgV:"+7.4%",  vC:"var(--sc)" },
];
const fmt = v => { const n=parseFloat(v)||0; if(n>=100000) return "₹"+(n/100000).toFixed(1)+"L"; if(n>=1000) return "₹"+(n/1000).toFixed(0)+"K"; return "₹"+n; };

const NewBusiness = () => (
  <div>
    <div className="ph"><h2>New business report</h2><p>Monthly client acquisition, segment-wise active clients, volume contribution, and new account analytics</p></div>
    <div className="cards">
      <div className="card ci"><div className="clbl">New accounts opened (Apr &apos;26)</div><div className="cval">859</div><div className="csub">vs Mar &apos;26: 1,202 (–29%)</div></div>
      <div className="card cs"><div className="clbl">New clients trading (Apr &apos;26)</div><div className="cval">924</div><div className="csub">107.6% of accounts opened</div></div>
      <div className="card cw"><div className="clbl">New client ledger balance</div><div className="cval">₹2.59Cr</div><div className="csub">Apr &apos;26 opening deposits</div></div>
      <div className="card cp"><div className="clbl">Navia exchange contribution</div><div className="cval">0.16%</div><div className="csub">New client share of exchange TO</div></div>
    </div>
    <div className="tc2">
      <div className="panel">
        <div className="ptitle">📊 Active clients by segment — monthly trend</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={clientData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{fontSize:9}} />
            <YAxis tick={{fontSize:10}} />
            <Tooltip />
            <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
            <Bar dataKey="EqCash" name="Eq Cash"    stackId="s" fill="#185fa5" />
            <Bar dataKey="EqOpt"  name="Eq Options" stackId="s" fill="#9FE1CB" />
            <Bar dataKey="EqFut"  name="Eq Futures" stackId="s" fill="#FAC775" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="panel">
        <div className="ptitle">📈 Avg daily volume by key segment (₹Cr/day)</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={volData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{fontSize:9}} />
            <YAxis tick={{fontSize:10}} />
            <Tooltip />
            <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
            <Line type="monotone" dataKey="EqOpt"  name="Eq Options (₹Cr avg/day)" stroke="#185fa5" strokeWidth={2} dot={{r:3}} fill="rgba(24,95,165,0.08)" />
            <Line type="monotone" dataKey="CommFO" name="Commodity F&O (₹Cr avg/day)" stroke="#9FE1CB" strokeWidth={2} dot={{r:3}} fill="rgba(28,158,117,0.08)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
    <div className="tc2">
      <div className="panel">
        <div className="ptitle">📊 New accounts opened vs new clients trading</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={newAcctData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{fontSize:9}} />
            <YAxis tick={{fontSize:10}} />
            <Tooltip />
            <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
            <Bar dataKey="opened"  name="New accounts opened"  fill="#185fa5" />
            <Bar dataKey="trading" name="New clients trading"  fill="#9FE1CB" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="panel">
        <div className="ptitle">📊 New client ledger balance (₹)</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={ledgerData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{fontSize:9}} />
            <YAxis tick={{fontSize:10}} tickFormatter={fmt} />
            <Tooltip formatter={fmt} />
            <Bar dataKey="balance" name="New client ledger balance" fill="#FAC775" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
    <div className="panel">
      <div className="ptitle">📋 All-clients segment summary — monthly (averages)</div>
      <div className="tw"><table>
        <thead><tr><th>Segment</th><th>Apr &apos;26 clients</th><th>Apr vol (₹Cr/d)</th><th>Mar &apos;26 clients</th><th>Mar vol</th><th>Feb &apos;26 clients</th><th>3M avg change</th></tr></thead>
        <tbody>
          {SEG_TABLE.map((r,i)=>(
            <tr key={i} style={{fontWeight:i===SEG_TABLE.length-1?"500":"normal"}}>
              <td>{r.seg}</td><td>{r.apr26.toLocaleString("en-IN")}</td><td>{r.aprVol}</td>
              <td>{r.mar.toLocaleString("en-IN")}</td><td>{r.marVol}</td>
              <td>{r.feb.toLocaleString("en-IN")}</td>
              <td style={{color:r.chgC}}>{r.chg}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
    <div className="panel">
      <div className="ptitle">📋 New clients — segment distribution (Apr &apos;26)</div>
      <div className="tw"><table>
        <thead><tr><th>Segment</th><th>New clients trading</th><th>Avg daily volume (₹Cr)</th><th>3M avg change (clients)</th><th>3M avg change (volume)</th></tr></thead>
        <tbody>
          {NEW_TABLE.map((r,i)=>(
            <tr key={i} style={{fontWeight:i===NEW_TABLE.length-1?"500":"normal"}}>
              <td>{r.seg}</td><td>{r.newC}</td><td>{r.vol}</td>
              <td style={{color:r.cC}}>{r.chgC}</td>
              <td style={{color:r.vC}}>{r.chgV}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  </div>
);
export default NewBusiness;