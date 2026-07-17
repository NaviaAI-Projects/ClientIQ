import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const MO8 = ["Nov '25","Dec '25","Jan '26","Feb '26","Mar '26","Apr '26","May '26","Jun '26 MTD"];
const streamData = MO8.map((m,i)=>({
  month:m,
  Options: [1.88,1.63,2.04,2.12,2.79,2.01,2.14,2.35][i]*1e5,
  Brokerage:[1.08,0.98,1.02,1.29,0.64,1.05,1.03,0.60][i]*1e5,
  Float:   [0.34,0.35,0.36,0.37,0.38,0.37,0.40,0.41][i]*1e5,
  MTF:     [0.22,0.24,0.27,0.29,0.24,0.22,0.31,0.35][i]*1e5,
}));

const STREAM_TABLE = [
  { name:'Options clearing (Eq + Comm)', share:'40%', jun:'₹2,35,253', may:'₹2,14,061', apr:'₹2,00,970', avg3:'₹2,04,683', ytd:'₹21.2L', trend:'↑', tc:'var(--sc)', badgeCls:'b-act' },
  { name:'Equity brokerage',             share:'30%', jun:'₹60,160',   may:'₹1,02,847', apr:'₹1,05,147', avg3:'₹90,654',   ytd:'₹12.4L', trend:'↓', tc:'var(--dc)', badgeCls:'b-hv' },
  { name:'Float income (estimated)',     share:'20%', jun:'₹41,200',   may:'₹39,800',   apr:'₹37,400',   avg3:'₹38,500',   ytd:'₹8.2L',  trend:'↑', tc:'var(--sc)', badgeCls:'b-lead' },
  { name:'MTF interest',                 share:'10%', jun:'₹35,197',   may:'₹31,433',   apr:'₹22,311',   avg3:'₹27,103',   ytd:'₹5.2L',  trend:'↑', tc:'var(--sc)', badgeCls:'b-nri' },
];

const FLOAT_TABLE = [
  { metric:'Total ledger balance (₹Cr)',       jun:'231.4', may:'223.8', apr:'210.4', avg:'221.9' },
  { metric:'Est. daily float income (₹)',       jun:'41,200',may:'39,800',apr:'37,400',avg:'38,500' },
  { metric:'Clients with balance >₹5L',        jun:'412',   may:'398',   apr:'381',   avg:'397' },
  { metric:'Avg balance per active client (₹)',jun:'₹9,800',may:'₹9,340',apr:'₹9,100',avg:'₹9,413' },
  { metric:"Top 10 clients — % of float",      jun:'18.4%', may:'17.8%', apr:'18.1%', avg:'18.1%' },
];

const MTF_TABLE = [
  { metric:'Net MTF funding (₹Cr)',    jun:'8.81', may:'8.13', apr:'6.25', avg:'7.06' },
  { metric:'MTF interest income (₹/day)', jun:'35,197',may:'31,433',apr:'22,311',avg:'27,103' },
  { metric:'MTF clients',              jun:'129',  may:'115',  apr:'104',  avg:'116' },
  { metric:'Avg MTF per client (₹L)', jun:'6.83', may:'7.07', apr:'6.01', avg:'6.64' },
  { metric:'Eligible but not using MTF',jun:'~280',may:'~265', apr:'~248', avg:'~264' },
];

const fmt = v => { const n=parseFloat(v)||0; if(n>=100000) return '₹'+(n/100000).toFixed(1)+'L'; return '₹'+n; };

const RevenueFloat = () => (
  <div>
    <div className="ph"><h2>Revenue &amp; float</h2><p>All income streams — monthly trend, YTD, float book, MTF book · Prior month and 3-month averages</p></div>
    <div className="cards">
      <div className="card ci"><div className="clbl">Total MTD revenue</div><div className="cval">₹28.4L</div><div className="csub">Jun avg vs May avg: +3.5%</div></div>
      <div className="card cs"><div className="clbl">YTD revenue</div><div className="cval">₹52.8L</div><div className="csub">vs Last FY same period +28%</div></div>
      <div className="card cw"><div className="clbl">Float book (total ledger)</div><div className="cval">₹231Cr</div><div className="csub">Est. daily income ₹41,200</div></div>
      <div className="card cp"><div className="clbl">MTF book</div><div className="cval">₹8.81Cr</div><div className="csub">129 clients · ₹34,382/day interest</div></div>
    </div>

    <div className="panel">
      <div className="ptitle">📊 Monthly revenue by stream (₹L) — last 8 months</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={streamData} margin={{top:8,right:8,bottom:8,left:8}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="month" tick={{fontSize:9}} />
          <YAxis tick={{fontSize:10}} tickFormatter={v=>v>=100000?'₹'+(v/100000).toFixed(0)+'L':'₹'+v} />
          <Tooltip formatter={v=>fmt(v)} />
          <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
          <Bar dataKey="Options"   stackId="s" fill="#185fa5" name="Options clearing" />
          <Bar dataKey="Brokerage" stackId="s" fill="#9FE1CB" name="Equity brokerage" />
          <Bar dataKey="Float"     stackId="s" fill="#AFA9EC" name="Float income" />
          <Bar dataKey="MTF"       stackId="s" fill="#FAC775" name="MTF interest" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>

    <div className="panel">
      <div className="ptitle">📋 Income stream comparison — monthly averages</div>
      <div className="tw"><table>
        <thead><tr><th>Revenue stream</th><th>Revenue share</th><th>Jun MTD avg/day</th><th>May avg/day</th><th>Apr avg/day</th><th>Prior 3M avg/day</th><th>YTD total</th><th>Trend</th></tr></thead>
        <tbody>
          {STREAM_TABLE.map((r,i)=>(
            <tr key={i} style={{background:i===0?'var(--ibg)':i===2?'var(--pbg)':'inherit'}}>
              <td><strong>{r.name}</strong></td>
              <td><span className={`badge ${r.badgeCls}`}>{r.share}</span></td>
              <td>{r.jun}</td><td>{r.may}</td><td>{r.apr}</td><td>{r.avg3}</td><td>{r.ytd}</td>
              <td style={{color:r.tc,fontWeight:'500'}}>{r.trend}</td>
            </tr>
          ))}
          <tr style={{fontWeight:'600',borderTop:'0.5px solid var(--br)'}}>
            <td>Total revenue</td><td>100%</td><td>₹3,71,810</td><td>₹3,48,141</td><td>₹3,35,832</td><td>₹3,60,940</td><td>₹47.0L</td><td style={{color:'var(--sc)'}}>↑</td>
          </tr>
        </tbody>
      </table></div>
    </div>

    <div className="tc2">
      <div className="panel">
        <div className="ptitle">🏦 Float book analysis</div>
        <div className="alert a-i" style={{marginBottom:'10px'}}>ℹ️ Float income = total ledger balance × <strong>6.5% p.a.</strong> ÷ 365. Rate configurable in Admin → MIS Settings.</div>
        <div className="tw"><table>
          <thead><tr><th>Metric</th><th>Jun avg</th><th>May avg</th><th>Apr avg</th><th>3M avg</th></tr></thead>
          <tbody>{FLOAT_TABLE.map((r,i)=><tr key={i}><td>{r.metric}</td><td>{r.jun}</td><td>{r.may}</td><td>{r.apr}</td><td>{r.avg}</td></tr>)}</tbody>
        </table></div>
        <div style={{marginTop:'10px',fontSize:'12px',color:'var(--tx2)'}}>428 clients have avg opening balance &gt;₹2L but traded fewer than 5 days this month.</div>
        <button className="btn bp" style={{marginTop:'8px'}}>⭐ View idle float leads</button>
      </div>
      <div className="panel">
        <div className="ptitle">💰 MTF book analysis</div>
        <div className="tw"><table>
          <thead><tr><th>Metric</th><th>Jun avg</th><th>May avg</th><th>Apr avg</th><th>3M avg</th></tr></thead>
          <tbody>{MTF_TABLE.map((r,i)=><tr key={i}><td>{r.metric}</td><td>{r.jun}</td><td>{r.may}</td><td>{r.apr}</td><td>{r.avg}</td></tr>)}</tbody>
        </table></div>
        <div style={{marginTop:'10px',fontSize:'12px',color:'var(--tx2)'}}>~280 clients are MTF eligible but not currently using MTF. Each conversion at avg ₹5L adds ~₹900/month interest.</div>
        <button className="btn bp" style={{marginTop:'8px'}}>⭐ View MTF eligible clients</button>
      </div>
    </div>
  </div>
);
export default RevenueFloat;
