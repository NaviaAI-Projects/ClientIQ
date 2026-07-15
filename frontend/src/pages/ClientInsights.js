import React, { useState } from 'react';

const DISPATCH = [
  { month:"May 2026", sent:"3 Jun 2026", recipients:342, delivered:338, opened:211, rate:"62.4%", status:<span className="badge b-act">Sent</span> },
  { month:"Apr 2026", sent:"3 May 2026", recipients:310, delivered:308, opened:184, rate:"59.7%", status:<span className="badge b-act">Sent</span> },
  { month:"Mar 2026", sent:"3 Apr 2026", recipients:288, delivered:285, opened:162, rate:"56.8%", status:<span className="badge b-act">Sent</span> },
];

const ClientInsights = () => {
  const [config, setConfig] = useState({ day:3, sendTo:"All mapped clients", subject:"Your Navia trading summary — May 2026", sender:"Navia Markets — Client Services", options:true, holdings:true, float:"Yes — if avg float > ₹2L", ai:true });
  const [saving, setSaving] = useState(false);

  return (
    <div>
      <div className="ph"><h2>Client insight email</h2><p>Monthly auto-generated performance report emailed to clients — powered by Claude AI</p></div>
      <div className="alert a-i">💡 This is a high-value retention and loyalty feature. Clients who receive a personalised monthly summary of their own trading are significantly less likely to move to a competitor.</div>

      <div className="panel">
        <div className="ptitle">⚙️ Report configuration</div>
        <div className="fgrid">
          <div className="fgrp"><label>Send on (day of month)</label><input type="number" value={config.day} min="1" max="5" onChange={e=>setConfig({...config,day:e.target.value})} /></div>
          <div className="fgrp"><label>Send to</label>
            <select value={config.sendTo} onChange={e=>setConfig({...config,sendTo:e.target.value})}>
              <option>All mapped clients</option><option>RM-mapped clients only</option><option>HV and NRI clients only</option><option>Manual selection</option>
            </select>
          </div>
          <div className="fgrp"><label>Subject line</label><input value={config.subject} onChange={e=>setConfig({...config,subject:e.target.value})} /></div>
          <div className="fgrp"><label>Sender name</label><input value={config.sender} onChange={e=>setConfig({...config,sender:e.target.value})} /></div>
        </div>
        <div className="fgrid">
          <div className="fgrp"><label>Include options analysis</label><select><option>Yes</option><option>No</option></select></div>
          <div className="fgrp"><label>Include holdings summary</label><select><option>Yes</option><option>No</option></select></div>
          <div className="fgrp"><label>Include float nudge</label><select><option>Yes — if avg float &gt; ₹2L</option><option>No</option></select></div>
          <div className="fgrp"><label>Include AI narrative (Claude)</label><select><option>Yes</option><option>No — data only</option></select></div>
        </div>
        <div className="brow">
          <button className="btn bp" onClick={()=>{setSaving(true);setTimeout(()=>setSaving(false),1500);}}>💾 Save config</button>
          <button className="btn">👁 Preview sample report</button>
          <button className="btn">✉️ Send test to me</button>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">✉️ Sample client insight email — what clients receive</div>
        <div style={{background:"var(--bg2)",borderRadius:"var(--r2)",padding:"16px 20px",fontSize:"12.5px",lineHeight:"1.8",border:"0.5px solid var(--br)"}}>
          <p style={{fontSize:"13px",fontWeight:"500",marginBottom:"10px"}}>Subject: Your Navia trading summary — May 2026</p>
          <p>Dear Rajan,</p>
          <p style={{marginTop:"8px"}}>Here is your personalised trading summary for <strong>May 2026</strong>. This report is generated from your actual trading activity on the Navia platform.</p>
          <div style={{background:"var(--bg)",borderRadius:"var(--r)",padding:"12px",margin:"12px 0",border:"0.5px solid var(--br)"}}>
            <p style={{fontWeight:"500",marginBottom:"8px"}}>Options trading summary</p>
            <p>Premium turnover: <strong>₹48.2L</strong> across 142 lots · Expiry-week activity: <strong>4 out of 4 expiries</strong></p>
            <p>Win/loss ratio: <strong>58% profitable trades</strong> · Avg P&L per expiry: <strong>+₹4,200</strong></p>
            <p>Strike preference: You traded primarily <strong>OTM options</strong> (72% of lots). ATM options had better P&L outcomes in your profile this month.</p>
          </div>
          <div style={{background:"var(--bg)",borderRadius:"var(--r)",padding:"12px",margin:"12px 0",border:"0.5px solid var(--br)"}}>
            <p style={{fontWeight:"500",marginBottom:"8px"}}>Portfolio holdings</p>
            <p>Current holding value: <strong>₹12.4L</strong> across 8 stocks · Unrealised gain: <strong>+₹84,000 (+7.2%)</strong></p>
          </div>
          <div style={{background:"var(--ibg)",borderRadius:"var(--r)",padding:"12px",margin:"12px 0",border:"0.5px solid var(--br)",color:"var(--ic)"}}>
            <p style={{fontWeight:"500",marginBottom:"6px"}}>AI insight from your relationship manager</p>
            <p>Your average ledger balance this month was <strong>₹6.2L</strong>. This capital is available for deployment — have you considered using MTF to enhance your options positions on expiry days?</p>
          </div>
          <p style={{marginTop:"10px",fontSize:"11px",color:"var(--tx3)"}}>This report is auto-generated from your trading data. Your RM is available for any questions.</p>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📋 Dispatch log — last sent</div>
        <div className="tw"><table>
          <thead><tr><th>Month</th><th>Sent on</th><th>Recipients</th><th>Delivered</th><th>Opened</th><th>Open rate</th><th>Status</th></tr></thead>
          <tbody>
            {DISPATCH.map((r,i)=>(
              <tr key={i}><td>{r.month}</td><td>{r.sent}</td><td>{r.recipients}</td><td>{r.delivered}</td><td>{r.opened}</td><td>{r.rate}</td><td>{r.status}</td></tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};
export default ClientInsights;