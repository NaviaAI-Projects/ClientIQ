import React, { useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const NUDGE_TYPES = [
  { trigger:"Strike type performance",     example:"Your last 14 Far OTM NIFTY CE trades: 38% win rate, avg loss 2,100. ATM trades: 64% win rate.", min:10, enabled:true },
  { trigger:"Consecutive loss today",      example:"You have had 3 losing trades today. Win rate on 4th+ trades after losses is 41% vs normal 58%.", min:15, enabled:true },
  { trigger:"Overtrading signal",          example:"You have placed 9 trades today. Days with 8+ trades show lower P&L outcomes in your history.",    min:20, enabled:true },
  { trigger:"Expiry day underperformance", example:"Your expiry-day win rate is 51% vs 62% on non-expiry days across 60 days of history.",            min:8,  enabled:true },
  { trigger:"Oversized position",          example:"This lot size is 2x your usual position. Larger trades have 44% win rate vs 61% for standard.",   min:12, enabled:true },
  { trigger:"Instrument underperformance", example:"Your last 20 FINNIFTY CE trades: 40% win rate, net P&L -14800. NIFTY CE trades: 63% win rate.",  min:10, enabled:true },
];

const statsCards = [
  { lbl:"Nudges delivered",        val:"1,842", sub:"Across 342 mapped clients", cls:"ci" },
  { lbl:"Clients who saw a nudge", val:"218",   sub:"",                          cls:"cs" },
  { lbl:"Opted out",               val:"4",     sub:"1.8% of nudge recipients",  cls:"cw" },
  { lbl:"Most triggered nudge",    val:"Strike type", sub:"",                    cls:"cp" },
];

const nudgeByType = [
  {type:"Strike type",pct:38},{type:"Consecutive loss",pct:22},{type:"Overtrading",pct:18},
  {type:"Expiry day",pct:12},{type:"Oversized pos",pct:7},{type:"Instrument",pct:3},
];
const nudgeByDay = ["Mon","Tue","Wed","Thu","Fri"].map((d,i)=>({day:d,nudges:[310,248,380,420,484][i]}));
const COLORS = ["#185fa5","#9FE1CB","#FAC775","#AFA9EC","#f0c0a0","#d3d1c7"];

const NudgeSettings = () => {
  const [nudges, setNudges] = useState(NUDGE_TYPES);
  const [saving, setSaving] = useState(false);

  const toggle = (i) => {
    const n = [...nudges];
    n[i] = {...n[i], enabled:!n[i].enabled};
    setNudges(n);
  };

  return (
    <div>
      <div className="ph"><h2>Nudge settings</h2><p>Configure live order-placement nudges based on client trade history insights</p></div>
      <div className="alert a-i">
        <strong>What nudges are:</strong> When a client is about to place an order, the system checks their 90-day trade history and surfaces a personalised data observation on the order screen. These are statistical summaries of the client data, not investment advice. Client opt-in consent is required.
      </div>
      <div className="panel">
        <div className="ptitle">Nudge types — enable / disable</div>
        <div className="tw"><table>
          <thead><tr><th>Nudge trigger</th><th>Example message shown to client</th><th>Min sample (trades)</th><th>Enabled</th></tr></thead>
          <tbody>
            {nudges.map((n,i)=>(
              <tr key={i}>
                <td><strong>{n.trigger}</strong></td>
                <td style={{fontSize:"12px",color:"var(--tx2)"}}>{n.example}</td>
                <td><input type="number" style={{width:"70px"}} defaultValue={n.min} /></td>
                <td>
                  <select style={{width:"80px"}} value={n.enabled?"On":"Off"} onChange={()=>toggle(i)}>
                    <option value="On">On</option>
                    <option value="Off">Off</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <div className="brow" style={{marginTop:"12px"}}>
          <button className="btn bp" onClick={()=>{setSaving(true);setTimeout(()=>setSaving(false),1500);}}>
            {saving ? "Saving..." : "Save nudge settings"}
          </button>
        </div>
      </div>
      <div className="panel">
        <div className="ptitle">Nudge API and OMS integration</div>
        <div className="fgrid">
          <div className="fgrp"><label>Nightly profile compute time</label><input type="time" defaultValue="02:00" /></div>
          <div className="fgrp"><label>Nudge API endpoint</label><input readOnly defaultValue="https://clientiq.navia.in/api/nudge" style={{background:"var(--bg2)",fontFamily:"monospace"}} /></div>
          <div className="fgrp"><label>ATM band (% from underlying)</label><input type="number" defaultValue="1" step="0.5" /></div>
          <div className="fgrp"><label>Far OTM threshold (%)</label><input type="number" defaultValue="3" step="0.5" /></div>
        </div>
        <div className="fgrp" style={{marginBottom:"12px"}}>
          <label>Client opt-in consent text</label>
          <textarea style={{minHeight:"60px"}} defaultValue="Navia may show you data-based observations from your own trading history during order placement. These are statistical summaries of your past trades, not investment advice." />
        </div>
        <div className="brow">
          <button className="btn bp">Save</button>
          <button className="btn">Test API endpoint</button>
        </div>
      </div>
      <div className="panel">
        <div className="ptitle">Nudge delivery stats (last 30 days)</div>
        <div className="cards">
          {statsCards.map((c,i)=>(
            <div key={i} className={`card ${c.cls}`}>
              <div className="clbl">{c.lbl}</div>
              <div className="cval">{c.val}</div>
              {c.sub && <div className="csub">{c.sub}</div>}
            </div>
          ))}
        </div>
        <div className="tc2">
          <div>
            <div style={{fontSize:"12px",fontWeight:"500",marginBottom:"8px",color:"var(--tx2)"}}>Nudges by type</div>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={nudgeByType} dataKey="pct" nameKey="type" cx="40%" cy="50%" outerRadius={70} innerRadius={35}>
                  {nudgeByType.map((e,i)=><Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={v=>v+"%"} />
                <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={10} wrapperStyle={{fontSize:11}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div>
            <div style={{fontSize:"12px",fontWeight:"500",marginBottom:"8px",color:"var(--tx2)"}}>Nudges by day of week</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={nudgeByDay} margin={{top:8,right:8,bottom:8,left:8}}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="day" tick={{fontSize:10}} />
                <YAxis tick={{fontSize:10}} />
                <Tooltip />
                <Bar dataKey="nudges" name="Nudges delivered" fill="#185fa5" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NudgeSettings;