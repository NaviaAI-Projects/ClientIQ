import React from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const DATES = ['4 May','5 May','6 May','7 May','8 May*','11 May','12 May','13 May','14 May','15 May*','18 May','19 May','20 May','21 May','22 May*','1 Jun','2 Jun'];
const EXP = [4,9,14,16];
const incomeData = DATES.map((d,i)=>({
  date:d,
  Options:[194409,175119,245791,218690,154029,169038,176792,211599,220675,192504,230352,208928,186966,170982,149911,218896,258610][i],
  Brokerage:[86848,143220,156865,84413,131368,156156,126910,79744,94821,125123,186488,115901,27260,73204,63266,50092,70228][i],
  MTF:[25390,25566,25488,28665,29130,29069,30102,30629,37301,30847,29662,30664,30856,38524,31841,36013,34382][i],
  Float:41100,
  isExpiry:EXP.includes(i),
}));
const volData = DATES.map((d,i)=>({
  date:d,
  EqOpt:[59.1,57.7,71.8,72.4,50.6,55.9,58.4,69.9,73.0,63.2,76.2,69.2,61.9,56.8,49.3,59.1,75.8][i],
  CommOpt:[7.6,4.7,6.4,6.0,4.8,8.0,4.9,5.8,5.0,5.5,5.9,4.3,6.5,6.1,5.3,7.6,5.6][i],
  isExpiry:EXP.includes(i),
}));
const clientData = DATES.map((d,i)=>({
  date:d,
  FO:[1743,2028,1836,2003,1641,1821,2103,1793,2029,1687,1873,2037,1767,2004,1603,1743,2132][i],
  Equity:[715,713,711,706,727,763,761,703,670,687,653,616,584,596,636,715,713][i],
  MTF:[128,129,130,131,132,133,134,135,135,136,136,137,138,138,139,128,129][i],
  isExpiry:EXP.includes(i),
}));
const fmt = v => { const n=parseFloat(v)||0; if(n>=100000) return '₹'+(n/100000).toFixed(0)+'L'; if(n>=1000) return '₹'+(n/1000).toFixed(0)+'K'; return '₹'+n; };

const INCOME_ROWS = [
  { name:'Eq Options clearing',   today:'₹2,58,610', yest:'₹2,18,897', day2:'₹2,45,791', mtdAvg:'₹2,02,248', prior:'₹2,01,108', vs:'+28.6%', vsC:'var(--sc)', share:'40%', shCls:'b-act', highlight:'var(--ibg)' },
  { name:'Comm Options clearing', today:'₹30,121',   yest:'₹40,651',   day2:'₹34,538',   mtdAvg:'₹35,386',   prior:'₹33,001',   vs:'+7.1%',  vsC:'var(--sc)', share:'5%',  shCls:'b-ri',  highlight:'' },
  { name:'Equity brokerage',      today:'₹70,228',   yest:'₹50,092',   day2:'₹1,56,865', mtdAvg:'₹60,160',   prior:'₹90,654',   vs:'–22.6%', vsC:'var(--dc)', share:'30%', shCls:'b-hv',  highlight:'' },
  { name:'MTF interest (daily)',  today:'₹34,382',   yest:'₹36,013',   day2:'₹25,488',   mtdAvg:'₹35,197',   prior:'₹27,103',   vs:'+26.5%', vsC:'var(--sc)', share:'10%', shCls:'b-nri', highlight:'' },
  { name:'Float income (est.)',   today:'₹41,200',   yest:'₹41,200',   day2:'₹41,000',   mtdAvg:'₹41,100',   prior:'₹38,500',   vs:'+6.8%',  vsC:'var(--sc)', share:'20%', shCls:'b-lead',highlight:'var(--pbg)' },
];
const VOL_ROWS = [
  { seg:'Eq Options (premium TO)', today:'₹75.8Cr', yest:'₹59.1Cr', mtd:'₹67.4Cr', prior:'₹66.9Cr', vs:'+13.3%', vsC:'var(--sc)', exp:<span className="badge b-act">+28% vs normal</span>, hi:'var(--ibg)' },
  { seg:'Comm Options',            today:'₹5.6Cr',  yest:'₹7.6Cr',  mtd:'₹6.6Cr',  prior:'₹6.0Cr',  vs:'+10%',   vsC:'var(--sc)', exp:'—', hi:'' },
  { seg:'Eq Futures',              today:'₹7.4Cr',  yest:'₹6.6Cr',  mtd:'₹7.0Cr',  prior:'₹15.9Cr', vs:'–53.5%', vsC:'var(--dc)', exp:'—', hi:'' },
  { seg:'Comm Futures',            today:'₹14.9Cr', yest:'₹19.1Cr', mtd:'₹17.0Cr', prior:'₹19.9Cr', vs:'–25.1%', vsC:'var(--dc)', exp:'—', hi:'' },
  { seg:'Equity Cash',             today:'₹14.2Cr', yest:'₹17.6Cr', mtd:'₹15.9Cr', prior:'₹19.2Cr', vs:'–26.0%', vsC:'var(--dc)', exp:'—', hi:'' },
];
const CLIENT_ROWS = [
  { cat:'Total clients traded',   today:'2,804', yest:'2,431', mtd:'2,500', prior:'2,450', vs:'+14.4%', vsC:'var(--sc)' },
  { cat:'F&O clients (Eq)',       today:'2,132', yest:'1,743', mtd:'1,938', prior:'1,881', vs:'+13.3%', vsC:'var(--sc)' },
  { cat:'F&O clients (Comm)',     today:'310',   yest:'334',   mtd:'322',   prior:'334',   vs:'–7.2%',  vsC:'var(--dc)' },
  { cat:'Equity cash clients',    today:'713',   yest:'715',   mtd:'714',   prior:'682',   vs:'+4.7%',  vsC:'var(--sc)' },
  { cat:'MTF clients',            today:'129',   yest:'128',   mtd:'129',   prior:'112',   vs:'+15.2%', vsC:'var(--sc)' },
  { cat:'Resident clients',       today:'2,708', yest:'2,345', mtd:'2,527', prior:'2,401', vs:'+12.8%', vsC:'var(--sc)' },
  { cat:'NRI clients',            today:'96',    yest:'86',    mtd:'91',    prior:'76',    vs:'+26.3%', vsC:'var(--sc)' },
];
const REVMIX = [
  { lbl:'Options (clearing)', pct:67, color:'var(--ic)' },
  { lbl:'Equity brokerage',   pct:16, color:'var(--sc)' },
  { lbl:'Float income (est.)',pct:10, color:'var(--pc)' },
  { lbl:'MTF interest',       pct:8,  color:'var(--wc)' },
];

const DailyMIS = () => (
  <div>
    <div className="ph"><h2>Corporate daily MIS</h2><p>2 Jun 2026 · All income lines · Today vs MTD avg vs Prior 3-month avg · Expiry days highlighted</p></div>
    <div className="alert a-w">📅 <strong>Today is a weekly expiry day (Tuesday)</strong> — volume and client count typically 25–30% above normal.</div>

    <div className="panel">
      <div className="ptitle">💰 Daily income summary — all revenue lines</div>
      <div className="tw"><table>
        <thead><tr><th>Revenue line</th><th>Today (2 Jun)</th><th>Yesterday</th><th>Day before</th><th>MTD avg (Jun)</th><th>Prior 3M avg</th><th>vs Prior 3M avg</th><th>Revenue share</th></tr></thead>
        <tbody>
          {INCOME_ROWS.map((r,i)=>(
            <tr key={i} style={{background:r.highlight}}>
              <td><strong>{r.name}</strong></td>
              <td><strong>{r.today}</strong></td>
              <td>{r.yest}</td><td>{r.day2}</td><td>{r.mtdAvg}</td><td>{r.prior}</td>
              <td style={{color:r.vsC,fontWeight:'500'}}>{r.vs}</td>
              <td><span className={`badge ${r.shCls}`}>{r.share}</span></td>
            </tr>
          ))}
          <tr style={{fontWeight:'600',borderTop:'0.5px solid var(--br)'}}>
            <td>Total revenue</td><td>₹4,34,541</td><td>₹3,86,853</td><td>₹5,03,682</td><td>₹3,73,091</td><td>₹3,90,366</td>
            <td style={{color:'var(--sc)',fontWeight:'500'}}>+11.3%</td><td>100%</td>
          </tr>
        </tbody>
      </table></div>
    </div>

    <div className="panel">
      <div className="ptitle">📊 Daily volume — all segments (₹ Cr)</div>
      <div className="tw"><table>
        <thead><tr><th>Segment</th><th>Today</th><th>Yesterday</th><th>MTD avg</th><th>Prior 3M avg</th><th>vs Prior 3M avg</th><th>Expiry premium</th></tr></thead>
        <tbody>
          {VOL_ROWS.map((r,i)=>(
            <tr key={i} style={{background:r.hi}}>
              <td><strong>{r.seg}</strong></td>
              <td><strong>{r.today}</strong></td>
              <td>{r.yest}</td><td>{r.mtd}</td><td>{r.prior}</td>
              <td style={{color:r.vsC}}>{r.vs}</td><td>{r.exp}</td>
            </tr>
          ))}
          <tr style={{fontWeight:'600',borderTop:'0.5px solid var(--br)'}}>
            <td>Total (all segments)</td><td>₹117.9Cr</td><td>₹110.0Cr</td><td>₹113.9Cr</td><td>₹123.2Cr</td><td style={{color:'var(--dc)'}}>–7.5%</td><td>—</td>
          </tr>
        </tbody>
      </table></div>
    </div>

    <div className="panel">
      <div className="ptitle">👥 Daily client activity</div>
      <div className="tw"><table>
        <thead><tr><th>Category</th><th>Today</th><th>Yesterday</th><th>MTD avg</th><th>Prior 3M avg</th><th>vs Prior 3M avg</th></tr></thead>
        <tbody>
          {CLIENT_ROWS.map((r,i)=>(
            <tr key={i}>
              <td>{r.cat}</td><td><strong>{r.today}</strong></td><td>{r.yest}</td><td>{r.mtd}</td><td>{r.prior}</td>
              <td style={{color:r.vsC}}>{r.vs}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>

    <div className="tc2">
      <div className="panel">
        <div className="ptitle">💰 MTF book summary</div>
        <div className="tw"><table>
          <thead><tr><th>Metric</th><th>Today</th><th>MTD avg</th><th>Prior 3M avg</th></tr></thead>
          <tbody>
            {[['Net MTF funding (₹Cr)','₹8.95Cr','₹8.81Cr','₹7.00Cr'],['MTF interest earned (₹)','₹34,382','₹35,197','₹27,103'],['MTF clients','129','129','112'],['Avg book per client (₹L)','₹6.94L','₹6.83L','₹6.25L']].map((r,i)=>(
              <tr key={i}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>
            ))}
          </tbody>
        </table></div>
      </div>
      <div className="panel">
        <div className="ptitle">📊 Revenue mix — today</div>
        {REVMIX.map((r,i)=>(
          <div key={i} className="rrow">
            <span className="rlbl">{r.lbl}</span>
            <div className="rtrk"><div className="rbar" style={{width:r.pct+'%',background:r.color}}></div></div>
            <span className="ramt">{r.pct}%</span>
          </div>
        ))}
      </div>
    </div>

    <div className="panel">
      <div className="ptitle">📈 Revenue trend (last 17 trading days) — red dots = expiry days</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={incomeData} margin={{top:8,right:8,bottom:8,left:8}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="date" tick={{fontSize:8}} interval={1} angle={-45} textAnchor="end" height={50} />
          <YAxis tick={{fontSize:10}} tickFormatter={fmt} />
          <Tooltip formatter={fmt} />
          <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
          <Bar dataKey="Options"   stackId="s" fill="#185fa5" name="Options" />
          <Bar dataKey="Brokerage" stackId="s" fill="#9FE1CB" name="Brokerage" />
          <Bar dataKey="MTF"       stackId="s" fill="#FAC775" name="MTF" />
          <Bar dataKey="Float"     stackId="s" fill="#AFA9EC" name="Float" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>

    <div className="tc2">
      <div className="panel">
        <div className="ptitle">📊 Options volume trend (₹Cr) — red dots = expiry</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={volData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="date" tick={{fontSize:8}} interval={2} />
            <YAxis tick={{fontSize:10}} />
            <Tooltip />
            <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
            <Line type="monotone" dataKey="EqOpt"   name="Eq Options (₹Cr)"   stroke="#185fa5" strokeWidth={2} dot={(p)=><circle key={p.index} cx={p.cx} cy={p.cy} r={EXP.includes(p.index)?6:3} fill={EXP.includes(p.index)?'#a32d2d':'#185fa5'} />} />
            <Line type="monotone" dataKey="CommOpt" name="Comm Options (₹Cr)" stroke="#9FE1CB" strokeWidth={2} dot={{r:3}} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="panel">
        <div className="ptitle">👥 Daily client count trend</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={clientData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="date" tick={{fontSize:8}} interval={2} />
            <YAxis tick={{fontSize:10}} />
            <Tooltip />
            <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
            <Bar dataKey="FO"     name="F&O clients"     fill="#b5d4f4" stackId="s" />
            <Bar dataKey="Equity" name="Equity clients"  fill="#9FE1CB" stackId="s" />
            <Bar dataKey="MTF"    name="MTF clients"     fill="#FAC775" stackId="s" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>

    <div className="brow">
      <button className="btn bp">📄 Export MIS (PDF)</button>
      <button className="btn">✉️ Email to management</button>
      <button className="btn">⬇ Download as Excel</button>
    </div>
  </div>
);
export default DailyMIS;
