import React, { useState } from 'react';

const MISSettings = () => {
  const [floatRate, setFloatRate] = useState("6.5");
  const [saving, setSaving] = useState(false);

  return (
    <div>
      <div className="ph"><h2>MIS settings</h2><p>Configure float income rate, exchange volume feed URLs, expiry calendar, and AI scoring weights for Navia's revenue model</p></div>

      <div className="panel">
        <div className="ptitle">💰 Float income settings</div>
        <p style={{fontSize:"12px",color:"var(--tx2)",marginBottom:"12px"}}>Float income is estimated daily as: total client ledger balance × rate ÷ 365. Displayed in the Corporate Daily MIS as an estimated income line.</p>
        <div className="fgrid">
          <div className="fgrp"><label>Float deployment rate (% p.a.)</label><input type="number" step="0.1" value={floatRate} onChange={e=>setFloatRate(e.target.value)} placeholder="e.g. 6.5" /></div>
          <div className="fgrp"><label>Effective from</label><input type="date" defaultValue="2026-04-01" /></div>
          <div className="fgrp"><label>Total client float (₹Cr) — last computed</label><input type="text" defaultValue="₹231.4Cr" readOnly style={{background:"var(--bg2)"}} /></div>
          <div className="fgrp"><label>Estimated daily float income</label><input type="text" defaultValue="₹41,200 / day" readOnly style={{background:"var(--bg2)"}} /></div>
        </div>
        <button className="btn bp" onClick={()=>{setSaving(true);setTimeout(()=>setSaving(false),1500);}}>{saving?"Saving…":"💾 Save rate"}</button>
      </div>

      <div className="panel">
        <div className="ptitle">📅 Expiry calendar settings</div>
        <p style={{fontSize:"12px",color:"var(--tx2)",marginBottom:"12px"}}>System highlights expiry days in the MIS and applies the expiry signal in AI churn scoring for options traders.</p>
        <div className="fgrid">
          <div className="fgrp"><label>NSE weekly expiry days</label><select><option>Tuesday &amp; Thursday</option><option>Thursday only</option><option>Tuesday only</option><option>Custom</option></select></div>
          <div className="fgrp"><label>BSE weekly expiry days</label><select><option>Monday &amp; Wednesday</option><option>Wednesday only</option><option>Custom</option></select></div>
          <div className="fgrp"><label>MCX weekly expiry</label><select><option>Monday</option><option>Tuesday</option><option>Custom</option></select></div>
          <div className="fgrp"><label>Monthly expiry rule</label><select><option>Last Thursday of month</option><option>Last Wednesday of month</option><option>Manual</option></select></div>
        </div>
        <div className="fgrp" style={{marginBottom:"12px"}}><label>Custom expiry dates (comma-separated, DD/MM/YYYY)</label>
          <input placeholder="e.g. 26/06/2026, 03/07/2026 for special expiries" />
        </div>
        <p style={{fontSize:"11px",color:"var(--tx3)",marginBottom:"10px"}}>Dormancy threshold for options traders: missing <input type="number" defaultValue="2" style={{width:"50px",display:"inline"}} /> consecutive expiry weeks = dormancy alert</p>
        <button className="btn bp">💾 Save expiry settings</button>
      </div>

      <div className="panel">
        <div className="ptitle">🌐 Exchange volume feed URLs</div>
        <p style={{fontSize:"12px",color:"var(--tx2)",marginBottom:"12px"}}>System fetches exchange volumes monthly for market share computation. Data is fetched on the 1st of each month for the prior month.</p>
        <div className="fgrid fg1">
          <div className="fgrp"><label>NSE Equity Options volume feed URL</label><input type="url" placeholder="https://www.nseindia.com/api/..." /></div>
          <div className="fgrp"><label>NSE Equity Futures volume feed URL</label><input type="url" placeholder="https://..." /></div>
          <div className="fgrp"><label>MCX Commodity Options volume feed URL</label><input type="url" placeholder="https://www.mcxindia.com/..." /></div>
          <div className="fgrp"><label>MCX Commodity Futures volume feed URL</label><input type="url" placeholder="https://..." /></div>
          <div className="fgrp"><label>NSE Equity Cash volume feed URL</label><input type="url" placeholder="https://..." /></div>
        </div>
        <div className="brow"><button className="btn bp">💾 Save URLs</button><button className="btn">🔄 Test fetch now</button></div>
      </div>

      <div className="panel">
        <div className="ptitle">📊 Revenue model weights (for AI scoring)</div>
        <p style={{fontSize:"12px",color:"var(--tx2)",marginBottom:"12px"}}>These reflect Navia's actual revenue split and drive lead scoring priorities.</p>
        <table><thead><tr><th>Revenue stream</th><th>Your revenue share (%)</th><th>AI lead scoring weight (%)</th></tr></thead>
        <tbody>
          {[["Options clearing / turnover","40%"],["Equity brokerage","30%"],["Client float (ledger balance)","20%"],["MTF interest","10%"]].map(([s,share],i)=>(
            <tr key={i}><td>{s}</td><td>{share}</td><td><input type="number" style={{width:"70px"}} defaultValue={parseInt(share)} /></td></tr>
          ))}
        </tbody></table>
        <button className="btn bp" style={{marginTop:"10px"}}>💾 Save weights</button>
      </div>
    </div>
  );
};
export default MISSettings;