import React, { useState } from 'react';

const RATES = [
  { seg:"Equity cash",      rate:0.003,  effective:"2026-04-01" },
  { seg:"Equity futures",   rate:0.002,  effective:"2026-04-01" },
  { seg:"Equity options",   rate:0.0015, effective:"2026-04-01" },
  { seg:"Commodity futures",rate:0.002,  effective:"2026-04-01" },
  { seg:"Commodity options",rate:0.0015, effective:"2026-04-01" },
];

const CommissionRates = () => {
  const [rates, setRates] = useState(RATES);
  const [saving, setSaving] = useState(false);

  return (
    <div>
      <div className="ph"><h2>Commission rates</h2><p>Per-segment rates for zero-brokerage clients. Applied at trade import. commission_earned = turnover × rate.</p></div>
      <div className="alert a-i">ℹ️ These rates apply only to zero-brokerage plan clients. Paying-brokerage clients have actual brokerage from the brokerage import file. Historical rate periods are preserved.</div>
      <div className="panel">
        <div className="ptitle">% Current active rates</div>
        <table><thead><tr><th>Segment</th><th>Rate (%)</th><th>Effective from</th><th>Effective to</th><th></th></tr></thead>
        <tbody>
          {rates.map((r,i)=>(
            <tr key={i}>
              <td>{r.seg}</td>
              <td><input type="number" style={{width:"90px"}} value={r.rate} step="0.0005" onChange={e=>{const n=[...rates];n[i]={...n[i],rate:parseFloat(e.target.value)};setRates(n);}} /></td>
              <td><input type="date" style={{width:"130px"}} defaultValue={r.effective} /></td>
              <td><input type="date" style={{width:"130px"}} /></td>
              <td><button className="btn sm">Update</button></td>
            </tr>
          ))}
        </tbody></table>
        <div className="brow" style={{marginTop:"12px"}}>
          <button className="btn bp" onClick={()=>{setSaving(true);setTimeout(()=>setSaving(false),1500);}}>💾 Save rates</button>
          <button className="btn">+ Add rate period</button>
        </div>
      </div>
    </div>
  );
};
export default CommissionRates;