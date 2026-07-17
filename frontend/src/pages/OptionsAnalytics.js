import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

const DATES = ['4 May','5 May','6 May','7 May','8 May*','11 May','12 May','13 May','14 May','15 May*','18 May','19 May','20 May','21 May','22 May*','1 Jun','2 Jun','3 Jun*'];
const TO    = [64.4,57.7,71.8,72.4,50.6,55.9,58.4,69.9,73.0,63.2,76.2,69.2,61.9,56.8,49.3,59.1,75.8,91.4];
const EXPIRY_IDX = [4,9,14,17];

const toData = DATES.map((d,i)=>({ date:d, TO:TO[i], Avg:67.4, isExpiry:EXPIRY_IDX.includes(i) }));
const clientData = DATES.map((d,i)=>({ date:d, clients:[1746,2028,1836,2003,1641,1821,2103,1793,2029,1687,1873,2037,1767,2004,1603,1743,2132,2410][i] }));
const MO = ["Dec '25","Jan '26","Feb '26","Mar '26","Apr '26","May '26","Jun '26 MTD"];
const trendData = MO.map((m,i)=>({ month:m, EqOpt:[47.9,60.4,64.0,79.9,58.9,61.8,67.4][i], CommOpt:[4.0,5.0,4.0,7.8,4.8,5.4,6.6][i] }));

const MONTHLY = [
  { m:"Jun '26 (MTD)", eqTO:67.4, eqC:1938, eqClr:'₹2,02,248', commTO:6.6, commC:241, commClr:'₹33,005', totRev:'₹2,35,253', mom:'+3.5%', momC:'var(--sc)' },
  { m:"May '26",       eqTO:61.8, eqC:1853, eqClr:'₹1,86,736', commTO:5.4, commC:243, commClr:'₹27,325', totRev:'₹2,14,061', mom:'–3.7%', momC:'var(--dc)' },
  { m:"Apr '26",       eqTO:58.9, eqC:1826, eqClr:'₹1,76,803', commTO:4.8, commC:229, commClr:'₹24,167', totRev:'₹2,00,970', mom:'–17.0%',momC:'var(--dc)' },
  { m:"Mar '26",       eqTO:79.9, eqC:1966, eqClr:'₹2,39,787', commTO:7.8, commC:262, commClr:'₹39,173', totRev:'₹2,78,960', mom:'+43.6%',momC:'var(--sc)' },
  { m:"Feb '26",       eqTO:64.0, eqC:1997, eqClr:'₹1,92,004', commTO:4.0, commC:236, commClr:'₹20,115', totRev:'₹2,12,119', mom:'+9.2%', momC:'var(--sc)' },
  { m:"Dec '25",       eqTO:47.9, eqC:1901, eqClr:'₹1,43,556', commTO:4.0, commC:256, commClr:'₹19,895', totRev:'₹1,63,451', mom:'—',     momC:'inherit'   },
];

const TOP10 = [
  { ucc:'NV10234', name:'Priya Krishnan',  type:'RI-HV',  to:'₹4.8Cr', lots:'1,840', rm:'Arjun' },
  { ucc:'NV50089', name:'David Mathew',    type:'RI-HV',  to:'₹4.1Cr', lots:'1,560', rm:'—' },
  { ucc:'NV10045', name:'Kavitha Sharma',  type:'NRE-HV', to:'₹3.9Cr', lots:'1,480', rm:'Mubarak' },
  { ucc:'NV60214', name:'Meenakshi Pillai',type:'NRE',    to:'₹3.2Cr', lots:'1,210', rm:'Srinivasan' },
  { ucc:'NV80112', name:'Vasantha Rajan',  type:'RI',     to:'₹2.9Cr', lots:'1,100', rm:'—' },
];

const EXPIRY_TABLE = [
  { date:'3 Jun (Tue)', type:'Weekly', to:'82.1', vsMtd:'+22%', c:2280, cvsMtd:'+18%' },
  { date:'5 Jun (Thu)', type:'Weekly', to:'91.4', vsMtd:'+36%', c:2410, cvsMtd:'+24%' },
  { date:'26 Jun (Thu)',type:'Monthly',to:'—',    vsMtd:'—',    c:'—',  cvsMtd:'—'    },
];

const DotBar = ({ data }) => {
  const Custom = ({ x, y, value, index }) => {
    const isExp = data[index]?.isExpiry;
    return <circle cx={x} cy={y} r={isExp?6:3} fill={isExp?'#a32d2d':'#185fa5'} />;
  };
  return null;
};

const OptionsAnalytics = () => (
  <div>
    <div className="ph"><h2>Options analytics</h2><p>Equity &amp; Commodity options — premium turnover, expiry patterns, client behaviour</p></div>
    <div className="cards">
      <div className="card ci"><div className="clbl">Avg daily Eq Opt TO (Jun)</div><div className="cval">₹67.4Cr</div><div className="csub">vs May avg ₹61.8Cr · +9%</div></div>
      <div className="card cs"><div className="clbl">Options clients (Eq, Jun avg)</div><div className="cval">1,938/day</div><div className="csub">May avg 1,853 · +4.6%</div></div>
      <div className="card cw"><div className="clbl">Expiry-day TO premium</div><div className="cval">+28%</div><div className="csub">vs non-expiry avg</div></div>
      <div className="card cp"><div className="clbl">Comm Options avg (Jun)</div><div className="cval">₹6.6Cr/day</div><div className="csub">vs May ₹5.4Cr · +22%</div></div>
    </div>

    <div className="panel">
      <div className="ptitle">📈 Equity options daily premium TO — expiry days marked (₹Cr)</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={toData} margin={{top:8,right:8,bottom:8,left:8}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="date" tick={{fontSize:9}} interval={1} angle={-45} textAnchor="end" height={50} />
          <YAxis tick={{fontSize:10}} />
          <Tooltip />
          <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
          <Line type="monotone" dataKey="TO" name="Eq Options TO (₹Cr)" stroke="#185fa5" strokeWidth={2} dot={(props) => { const isExp=EXPIRY_IDX.includes(props.index); return <circle key={props.index} cx={props.cx} cy={props.cy} r={isExp?6:3} fill={isExp?'#a32d2d':'#185fa5'} />; }} />
          <Line type="monotone" dataKey="Avg" name="MTD avg" stroke="#854f0b" strokeDasharray="5 5" dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
      <p style={{fontSize:'11px',color:'var(--tx3)',marginTop:'6px'}}>Red markers = weekly expiry days (Tue/Thu). Volume spike on expiry days is consistently 25–30% above non-expiry average.</p>
    </div>

    <div className="tc2">
      <div className="panel">
        <div className="ptitle">👥 Options client count — expiry vs non-expiry days</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={toData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="date" tick={{fontSize:8}} interval={2} />
            <YAxis tick={{fontSize:10}} />
            <Tooltip />
            <Bar dataKey="TO" name="Options clients" fill="#b5d4f4"
              label={false}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="panel">
        <div className="ptitle">📈 Month-on-month options volume trend (₹Cr avg/day)</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trendData} margin={{top:8,right:8,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{fontSize:10}} />
            <YAxis tick={{fontSize:10}} />
            <Tooltip />
            <Legend wrapperStyle={{fontSize:11}} iconSize={10} />
            <Line type="monotone" dataKey="EqOpt"   name="Eq Opt avg/day (₹Cr)"   stroke="#185fa5" strokeWidth={2} dot={{r:4}} />
            <Line type="monotone" dataKey="CommOpt" name="Comm Opt avg/day (₹Cr)" stroke="#9FE1CB" strokeWidth={2} dot={{r:4}} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>

    <div className="panel">
      <div className="ptitle">📋 Options business — monthly comparison</div>
      <div className="tw"><table>
        <thead><tr><th>Month</th><th>Eq Opt TO (₹Cr/d)</th><th>Eq Opt clients</th><th>Eq Opt clearing (₹/d)</th><th>Comm Opt TO</th><th>Comm Opt clients</th><th>Comm clearing (₹/d)</th><th>Total options rev (₹/d)</th><th>MoM change</th></tr></thead>
        <tbody>
          {MONTHLY.map((r,i)=>(
            <tr key={i}>
              <td>{r.m}</td><td>{r.eqTO}</td><td>{r.eqC.toLocaleString('en-IN')}</td><td>{r.eqClr}</td>
              <td>{r.commTO}</td><td>{r.commC}</td><td>{r.commClr}</td><td style={{fontWeight:'500'}}>{r.totRev}</td>
              <td style={{color:r.momC}}>{r.mom}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>

    <div className="tc2">
      <div className="panel">
        <div className="ptitle">📅 Expiry day analysis — Jun 2026</div>
        <div className="alert a-i" style={{marginBottom:'10px'}}>ℹ️ Weekly expiries: every Tue &amp; Thu. NSE monthly: last Thu of month.</div>
        <div className="tw"><table>
          <thead><tr><th>Expiry date</th><th>Type</th><th>Eq Opt TO (₹Cr)</th><th>vs MTD avg</th><th>Clients</th><th>vs MTD avg</th></tr></thead>
          <tbody>
            {EXPIRY_TABLE.map((r,i)=>(
              <tr key={i} style={{background:r.type==='Monthly'?'var(--ibg)':'inherit'}}>
                <td>{r.date}</td>
                <td><span className={`badge ${r.type==='Monthly'?'b-nri':'b-pend'}`}>{r.type}</span></td>
                <td>{r.to}</td><td style={{color:'var(--sc)'}}>{r.vsMtd}</td>
                <td>{typeof r.c==='number'?r.c.toLocaleString('en-IN'):r.c}</td>
                <td style={{color:'var(--sc)'}}>{r.cvsMtd}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      <div className="panel">
        <div className="ptitle">⭐ Top 10 options clients by premium TO (MTD)</div>
        <div className="tw"><table>
          <thead><tr><th>UCC</th><th>Client</th><th>Type</th><th>Eq Opt TO</th><th>Lots</th><th>RM</th></tr></thead>
          <tbody>
            {TOP10.map((r,i)=>(
              <tr key={i}>
                <td><span className="lc">{r.ucc}</span></td>
                <td>{r.name}</td>
                <td><span className={`badge ${r.type.includes('NR')?'b-nri':'b-hv'}`}>{r.type}</span></td>
                <td>{r.to}</td><td>{r.lots}</td><td>{r.rm}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p style={{fontSize:'11px',color:'var(--tx3)',marginTop:'8px'}}>Unmapped high-TO clients flagged as priority leads in AI scoring.</p>
      </div>
    </div>
  </div>
);
export default OptionsAnalytics;
