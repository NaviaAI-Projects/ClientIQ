import React, { useState } from 'react';

const WEIGHTS = [
  { signal:"Options premium turnover",    desc:"High options TO on zero-brk plan — clearing revenue uplift on conversion",   driver:"40% of rev", dCls:"b-act", weight:35 },
  { signal:"Client float (ledger balance)",desc:"High avg opening balance — float income deployed in short-term FDs",         driver:"20% of rev", dCls:"b-lead",weight:20 },
  { signal:"Equity brokerage potential",  desc:"Active equity cash trading on zero plan — brokerage uplift opportunity",     driver:"30% of rev", dCls:"b-hv",  weight:20 },
  { signal:"MTF eligibility",             desc:"Active F&O with high net funding potential — MTF interest income",            driver:"10% of rev", dCls:"b-nri", weight:10 },
  { signal:"NRI status",                  desc:"NRI clients: remittance + higher brokerage potential",                        driver:"Bonus",       dCls:"b-ri",  weight:8 },
  { signal:"Expiry-week dormancy",        desc:"Options trader who missed 2+ consecutive expiry weeks",                       driver:"Retention",   dCls:"b-ri",  weight:7 },
  { signal:"Client TO vs Navia trend",    desc:"Client options volume growing slower than Navia segment average",             driver:"Drift",       dCls:"b-ri",  weight:5 },
  { signal:"RM interaction count",        desc:"Low RM interaction relative to peer clients = higher churn probability",       driver:"Engagement",  dCls:"b-ri",  weight:5 },
];

const AiScoring = () => {
  const [weights, setWeights] = useState(WEIGHTS);
  const [pipeline, setPipeline] = useState({ capacity:100, expiry:30, min_score:60, batch:20 });
  const [storage, setStorage] = useState({ raw_days:90 });
  const [saving, setSaving] = useState(false);

  return (
    <div>
      <div className="ph"><h2>AI scoring weights</h2><p>Lead scoring calibrated to Navia's revenue model — options turnover is the primary signal (40% of your revenue)</p></div>
      <div className="alert a-i">💡 Navia's revenue: <strong>40% options clearing</strong> · 30% equity brokerage · 20% float · 10% MTF. Scoring weights below reflect this. A client with ₹10Cr options premium TO + ₹5L float scores higher than a client with ₹50L equity TO + zero float.</div>

      <div className="panel">
        <div className="ptitle">🤖 Lead score signal weights — calibrated to Navia revenue model</div>
        <table><thead><tr><th>Signal</th><th>Description</th><th>Revenue driver</th><th>Weight (%)</th></tr></thead>
        <tbody>
          {weights.map((w,i)=>(
            <tr key={i}>
              <td><strong>{w.signal}</strong></td>
              <td style={{fontSize:"12px",color:"var(--tx2)"}}>{w.desc}</td>
              <td><span className={`badge ${w.dCls}`}>{w.driver}</span></td>
              <td><input type="number" style={{width:"70px"}} value={w.weight} onChange={e=>{const n=[...weights];n[i]={...n[i],weight:parseInt(e.target.value)||0};setWeights(n);}} /></td>
            </tr>
          ))}
        </tbody></table>
        <div className="brow" style={{marginTop:"12px"}}>
          <button className="btn bp" onClick={()=>{setSaving(true);setTimeout(()=>setSaving(false),1500);}}>💾 Save weights</button>
          <button className="btn">▶ Rescore all 20,000 clients now</button>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">⚙️ Lead pipeline settings</div>
        <div className="fgrid">
          <div className="fgrp"><label>RM capacity limit</label><input type="number" value={pipeline.capacity} onChange={e=>setPipeline({...pipeline,capacity:e.target.value})} /></div>
          <div className="fgrp"><label>Lead expiry (days)</label><input type="number" value={pipeline.expiry} onChange={e=>setPipeline({...pipeline,expiry:e.target.value})} /></div>
          <div className="fgrp"><label>Min score threshold</label><input type="number" value={pipeline.min_score} onChange={e=>setPipeline({...pipeline,min_score:e.target.value})} /></div>
          <div className="fgrp"><label>Auto-assign batch size</label><input type="number" value={pipeline.batch} onChange={e=>setPipeline({...pipeline,batch:e.target.value})} /></div>
        </div>
        <button className="btn bp">💾 Save settings</button>
      </div>

      <div className="panel">
        <div className="ptitle">🗄️ Data storage settings</div>
        <p style={{fontSize:"12px",color:"var(--tx2)",marginBottom:"12px"}}>Two-tier storage model: raw trades for recent options analysis, monthly summaries for permanent history.</p>
        <div className="fgrid">
          <div className="fgrp"><label>Raw trades retention window (days)</label><input type="number" value={storage.raw_days} onChange={e=>setStorage({...storage,raw_days:e.target.value})} /></div>
          <div className="fgrp"><label>Monthly summary permanent from</label><input type="month" defaultValue="2024-01" /></div>
        </div>
        <div className="alert a-i" style={{marginTop:"4px"}}>ℹ️ <code>trades_raw</code> (90-day rolling) → options strike analysis · <code>client_monthly_summary</code> (permanent) → monthly aggregates per UCC · <code>rm_mapping_performance</code> → pre/post RM mapping snapshots</div>
        <button className="btn bp" style={{marginTop:"10px"}}>💾 Save</button>
      </div>
    </div>
  );
};
export default AiScoring;