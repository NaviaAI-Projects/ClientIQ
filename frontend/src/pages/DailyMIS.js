import React, { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../api';
import { InfoBtn, ViewToggle } from '../components/ui';

const inr = (n) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const inr0 = (n) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }));  // whole rupees (no paise)
const vsColor = (n) => (n == null ? 'var(--tx2)' : n >= 0 ? 'var(--sc)' : 'var(--dc)');
const vsFmt = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + n + '%');
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));
const cr  = (n) => (n == null ? '0.00' : (Number(n) / 1e7).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// Collapse the calendar-day range into TRADING days only for the income table, folding each
// non-trading day's income (MTF interest + float accrue on weekends/holidays; brokerage &
// clearing are ₹0 there) FORWARD into the next trading day. The range total is preserved exactly
// — nothing is dropped, it's just attributed to when the market reopened. Any trailing non-trading
// days (range ends on a weekend) fold back into the last trading day. If the range somehow has no
// trading day at all, fall back to showing every calendar day.
const foldIncomeToTradingDays = (days) => {
  const out = [];
  let c = { mtf_interest: 0, brokerage: 0, commission: 0, float_income: 0 };
  const zero = () => { c = { mtf_interest: 0, brokerage: 0, commission: 0, float_income: 0 }; };
  for (const d of days) {
    if ((d.clients || 0) > 0) {
      const mtf = (d.mtf_interest || 0) + c.mtf_interest, brk = (d.brokerage || 0) + c.brokerage;
      const com = (d.commission || 0) + c.commission,     flt = (d.float_income || 0) + c.float_income;
      out.push({ ...d, mtf_interest: mtf, brokerage: brk, commission: com, float_income: flt, total: mtf + brk + com + flt });
      zero();
    } else {
      c.mtf_interest += (d.mtf_interest || 0); c.brokerage += (d.brokerage || 0);
      c.commission   += (d.commission   || 0); c.float_income += (d.float_income || 0);
    }
  }
  if (out.length && (c.mtf_interest || c.brokerage || c.commission || c.float_income)) {
    const L = out[out.length - 1];
    out[out.length - 1] = { ...L,
      mtf_interest: L.mtf_interest + c.mtf_interest, brokerage: L.brokerage + c.brokerage,
      commission: L.commission + c.commission, float_income: L.float_income + c.float_income,
      total: L.total + c.mtf_interest + c.brokerage + c.commission + c.float_income };
  }
  return out.length ? out : days;
};
const MIX_COLORS = ['#185fa5', '#9FE1CB', '#AFA9EC', '#FAC775', '#e0803a'];

const DailyMIS = () => {
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, setFrom]   = useState('');
  const [to, setTo]       = useState('');
  const [asof, setAsof]   = useState('');   // anchors the Income/Volume date columns
  const [busy, setBusy]   = useState('');   // '', 'pdf', 'xlsx' or 'email' — drives button state

  const load = (f, t, a) => {
    setLoading(true); setError('');
    const p = [];
    if (f && t) p.push(`from=${f}`, `to=${t}`);
    if (a) p.push(`asof=${a}`);
    const q = p.length ? '?' + p.join('&') : '';
    api.get('/analytics/daily-mis' + q)
      .then(r => setData(r.data))
      .catch(() => setError('Could not load daily MIS.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load('', '', ''); }, []);

  if (loading) return <div className="ph"><h2>Corporate daily MIS</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Corporate daily MIS</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, income, volume, activity, mtf, revenue_mix, trend, range } = data;
  const dsub = { fontSize: 10, fontWeight: 400, color: 'var(--tx3)' };   // small date under a column header

  // The three footer actions POST the exact payload now on screen (incl. any validated range),
  // so the PDF/Excel/email always match what the supervisor is looking at.
  const fileTag = String(meta.today || 'export').replace(/[^\w]+/g, '_');

  const download = async (kind) => {
    setBusy(kind);
    try {
      const res = await api.post(`/analytics/daily-mis/export/${kind}`, { data }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `Daily_MIS_${fileTag}.${kind}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Could not generate the ${kind === 'pdf' ? 'PDF' : 'Excel file'}. Please try again.`);
    } finally { setBusy(''); }
  };

  const emailToManagement = async () => {
    const to = window.prompt('Email the Daily MIS to (comma-separate multiple addresses):', '');
    if (to === null) return;                       // cancelled
    if (!to.trim()) { alert('Enter at least one recipient email.'); return; }
    const note = window.prompt('Optional note to show at the top of the email (leave blank to skip):', '') || '';
    setBusy('email');
    try {
      const res = await api.post('/analytics/daily-mis/email', { data, to, note });
      alert(res.data?.message || 'MIS emailed.');
    } catch (e) {
      alert(e.response?.data?.message || 'Could not send the email. Check the address and the mail server.');
    } finally { setBusy(''); }
  };

  return (
    <div>
      <div className="ph">
        <h2>Corporate daily MIS</h2>
        <p>As of {meta.today} · All income lines · Today vs MTD avg vs Prior 3-month avg · Expiry days highlighted in red</p>
      </div>

      {/* ── Date-range validation filter ── */}
      <div className="panel" style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 4 }}>From</div>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ padding: '6px 8px', border: '1px solid var(--br)', borderRadius: 6 }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 4 }}>To</div>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ padding: '6px 8px', border: '1px solid var(--br)', borderRadius: 6 }} />
        </div>
        <button className="btn bp" disabled={!from || !to || from > to} onClick={() => load(from, to, asof)}>Validate range</button>
        {range && <button className="btn" onClick={() => { setFrom(''); setTo(''); load('', '', asof); }}>Clear</button>}
        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>Pick a From & To date to validate MTF interest, brokerage, clearing and float per day for that window.</span>

        <div style={{ borderLeft: '1px solid var(--br)', paddingLeft: 14, marginLeft: 2 }}>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 4 }}>As-of date <span style={{ opacity: 0.7 }}>(table columns)</span></div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={asof} onChange={e => { setAsof(e.target.value); load(from, to, e.target.value); }}
              style={{ padding: '6px 8px', border: '1px solid var(--br)', borderRadius: 6 }} />
            {asof && <button className="btn" onClick={() => { setAsof(''); load(from, to, ''); }}>Latest</button>}
          </div>
        </div>
      </div>

      {range && (
        <div className="panel">
          <div className="ptitle">🔎 Selected range — daily revenue validation ({range.from} → {range.to})<InfoBtn text="Trading days in the selected range with their MTF interest, equity brokerage, clearing commission and float income, plus the range totals. Income that accrues on closed days (weekends/holidays) — mainly MTF interest and float — is folded into the next trading day, so the range total is preserved exactly. MTF interest is each period's interest spread evenly across its inclusive days." /></div>
          <div className="tw"><table>
            <thead><tr><th style={{ width: 120 }}>Date</th><th>MTF interest</th><th>Equity brokerage</th><th>Clearing (commission)</th><th>Float income</th><th>Day total</th></tr></thead>
            <tbody>
              {foldIncomeToTradingDays(range.days).map(d => (
                <tr key={d.date}>
                  <td><strong>{d.label}</strong></td>
                  <td>{inr(d.mtf_interest)}</td><td>{inr(d.brokerage)}</td>
                  <td>{inr(d.commission)}</td><td>{inr(d.float_income)}</td>
                  <td>{inr(d.total)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600, borderTop: '.5px solid var(--br)' }}>
                <td><strong>Total ({foldIncomeToTradingDays(range.days).length} trading days)</strong></td>
                <td>{inr(range.totals.mtf_interest)}</td><td>{inr(range.totals.brokerage)}</td>
                <td>{inr(range.totals.commission)}</td><td>{inr(range.totals.float_income)}</td>
                <td>{inr(range.totals.total)}</td>
              </tr>
            </tbody>
          </table></div>
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 8 }}>Trading days only. MTF interest is sourced from the mtf_interest periods, each spread evenly across its inclusive days; interest &amp; float that accrue on closed days (weekends/holidays) are folded into the next trading day, so the totals are unchanged.</p>

          <div className="ptitle" style={{ marginTop: 16 }}>📊 Selected range — segment turnover (₹Cr)<InfoBtn text="Per-day traded turnover by segment for the selected range (₹ crore): equity cash, equity futures, equity options premium, commodity futures, commodity options. Same raw-trades source as the daily volume table. BSE trades are included inside the NSE segments." /></div>
          <div className="tw"><table>
            <thead><tr><th style={{ width: 120 }}>Date</th><th>Eq Cash</th><th>Eq Futures</th><th>Eq Options (prem)</th><th>Comm Futures</th><th>Comm Options</th><th>Total TO</th><th>Clients</th></tr></thead>
            <tbody>
              {/* Trading days only — a day where clients actually traded. Weekends & holidays
                  (all-₹0, 0 clients) are hidden here; the revenue-validation table above still
                  shows every calendar day because MTF/float income accrues on non-trading days. */}
              {range.days.filter(d => (d.clients || 0) > 0).map(d => (
                <tr key={d.date}>
                  <td><strong>{d.label}</strong></td>
                  <td>₹{cr(d.eq_cash)}Cr</td><td>₹{cr(d.eq_fut)}Cr</td><td>₹{cr(d.eq_opt)}Cr</td>
                  <td>₹{cr(d.comm_fut)}Cr</td><td>₹{cr(d.comm_opt)}Cr</td>
                  <td>₹{cr(d.turnover)}Cr</td><td>{num(d.clients)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600, borderTop: '.5px solid var(--br)' }}>
                <td><strong>Total ({range.days.filter(d => (d.clients || 0) > 0).length} trading days)</strong></td>
                <td>₹{cr(range.totals.eq_cash)}Cr</td><td>₹{cr(range.totals.eq_fut)}Cr</td><td>₹{cr(range.totals.eq_opt)}Cr</td>
                <td>₹{cr(range.totals.comm_fut)}Cr</td><td>₹{cr(range.totals.comm_opt)}Cr</td>
                <td>₹{cr(range.totals.turnover)}Cr</td><td>—</td>
              </tr>
            </tbody>
          </table></div>
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 8 }}>Turnover = qty × price × lot size, from raw trades. Equity segments (lot size 1) match the source files to the rupee; commodity turnover applies each contract's lot size. Trades for UCCs not in the client master are excluded.</p>
        </div>
      )}

      {meta.is_expiry
        ? <div className="alert a-w"><strong>Today is a weekly expiry day</strong> — volume and client count typically 25–30% above normal. Figures shown in trend context.</div>
        : null}
      {!meta.brokerage_loaded && <div className="alert a-i" style={{ marginTop: 8 }}>ℹ️ Options-clearing and brokerage revenue lines are not yet imported (show "—"/₹0). Volume and client activity are live.</div>}

      <div className="panel">
        <div className="ptitle">💵 Daily income summary — all revenue lines<InfoBtn text="Every revenue line for the last traded date vs yesterday and day-before, MTD average, and the prior 1M / 2M / 3M averages (each a single calendar month: 1M = the month before, 2M = two months before, 3M = three months before), plus each line's share of total. Float income = client ledger balance × FD rate ÷ 365." /></div>
        <div className="tw"><table>
          <thead><tr><th style={{ width: 180 }}>Revenue line</th>
            <th>Last traded date<div style={dsub}>{meta.today}</div></th>
            <th>Previous trading day<div style={dsub}>{meta.yesterday_date}</div></th>
            <th>2nd previous trading day<div style={dsub}>{meta.day_before_date}</div></th>
            <th>MTD avg</th><th>Prior 1M avg</th><th>Prior 2M avg</th><th>Prior 3M avg</th><th>vs Prior 3M avg</th><th>Revenue share</th></tr></thead>
          <tbody>
            {income.map(r => (
              <tr key={r.line} style={{ fontWeight: r.total ? 600 : 'normal', borderTop: r.total ? '.5px solid var(--br)' : undefined }}>
                <td><strong>{r.line}</strong>{r.note ? <span style={{ fontSize: 10, color: 'var(--tx3)' }}> ({r.note})</span> : ''}</td>
                <td>{inr0(r.today)}</td><td>{inr0(r.yesterday)}</td><td>{inr0(r.day_before)}</td>
                <td>{inr0(r.mtd_avg)}</td><td>{inr0(r.prior1m_avg)}</td><td>{inr0(r.prior2m_avg)}</td><td>{inr0(r.prior3m_avg)}</td>
                <td style={{ color: vsColor(r.vs) }}>{vsFmt(r.vs)}</td>
                <td>{r.total ? '100%' : (r.share == null ? '—' : r.share + '%')}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 8 }}>Float income estimated: total client ledger balance × configured FD rate ÷ 365. Configure rate in Admin → MIS Settings.</p>
      </div>

      <div className="panel">
        <div className="ptitle">📊 Daily volume — all segments (₹ Cr)<InfoBtn text="Turnover by segment (₹ crore) for the last traded date vs yesterday, MTD average, and the prior 1M / 2M / 3M averages (each a single calendar month: 1M = the month before, 2M = two months before, 3M = three months before), plus the volume premium on expiry days versus normal days." /></div>
        <div className="tw"><table>
          <thead><tr><th style={{ width: 180 }}>Segment</th>
            <th>Last traded date<div style={dsub}>{meta.today}</div></th>
            <th>Previous trading day<div style={dsub}>{meta.yesterday_date}</div></th>
            <th>MTD avg</th><th>Prior 1M avg</th><th>Prior 2M avg</th><th>Prior 3M avg</th><th>vs Prior 3M avg</th><th>Expiry premium</th></tr></thead>
          <tbody>
            {volume.map(r => (
              <tr key={r.segment} style={{ fontWeight: r.total ? 600 : 'normal', borderTop: r.total ? '.5px solid var(--br)' : undefined }}>
                <td><strong>{r.segment}</strong></td>
                <td>₹{r.today}Cr</td><td>₹{r.yesterday}Cr</td><td>₹{r.mtd_avg}Cr</td><td>₹{r.prior1m_avg}Cr</td><td>₹{r.prior2m_avg}Cr</td><td>₹{r.prior3m_avg}Cr</td>
                <td style={{ color: vsColor(r.vs) }}>{vsFmt(r.vs)}</td>
                <td>{r.expiry_premium == null ? '—' : <span className="badge b-act">{vsFmt(r.expiry_premium)} vs normal</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <div className="panel">
        <div className="ptitle">👥 Daily client activity<InfoBtn text="Client activity counts by category for today vs yesterday, MTD average and prior 3-month average." /></div>
        <div className="tw"><table>
          <thead><tr><th>Category</th>
            <th>Last traded date<div style={dsub}>{meta.today}</div></th>
            <th>Previous trading day<div style={dsub}>{meta.yesterday_date}</div></th>
            <th>MTD avg</th><th>Prior 1M avg</th><th>Prior 2M avg</th><th>Prior 3M avg</th><th>vs Prior 3M avg</th></tr></thead>
          <tbody>
            {activity.map(r => (
              <tr key={r.category}>
                <td>{r.category}{r.note ? <span style={{ fontSize: 10, color: 'var(--tx3)' }}> ({r.note})</span> : ''}</td>
                <td><strong>{num(r.today)}</strong></td><td>{num(r.yesterday)}</td><td>{num(r.mtd_avg)}</td>
                <td>{num(r.prior1m_avg)}</td><td>{num(r.prior2m_avg)}</td><td>{num(r.prior3m_avg)}</td>
                <td style={{ color: vsColor(r.vs) }}>{vsFmt(r.vs)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">💰 MTF book summary<InfoBtn text="Margin Trading Facility book: net funding (₹Cr), daily interest earned, number of MTF clients and average book size per client." /></div>
          <div className="tw"><table>
            <thead><tr><th>Metric</th><th>Last traded date<div style={dsub}>{meta.today}</div></th><th>MTD avg</th><th>Prior 3M avg</th></tr></thead>
            <tbody>
              <tr><td>Net MTF funding (₹Cr)</td><td>{(mtf.funding / 1e7).toFixed(2)}</td><td>{(mtf.funding / 1e7).toFixed(2)}</td><td>{mtf.prior3m_funding != null ? (mtf.prior3m_funding / 1e7).toFixed(2) : '—'}</td></tr>
              <tr><td>MTF interest earned (₹)</td><td>{inr(mtf.daily_interest)}</td><td>{inr(mtf.mtd_interest)}</td><td>{mtf.prior3m_daily_interest != null ? inr(mtf.prior3m_daily_interest) : '—'}</td></tr>
              <tr><td>MTF clients</td><td>{mtf.clients.toLocaleString('en-IN')}</td><td>{mtf.clients.toLocaleString('en-IN')}</td><td>{mtf.prior3m_clients != null ? mtf.prior3m_clients.toLocaleString('en-IN') : '—'}</td></tr>
              <tr><td>Avg book per client (₹L)</td><td>{(mtf.avg_per_client / 1e5).toFixed(2)}</td><td>{(mtf.avg_per_client / 1e5).toFixed(2)}</td><td>{mtf.prior3m_avg_per_client != null ? (mtf.prior3m_avg_per_client / 1e5).toFixed(2) : '—'}</td></tr>
            </tbody>
          </table></div>
        </div>
        <div className="panel">
          <div className="ptitle">🥧 Revenue mix — {meta.today}<InfoBtn text="Revenue split for the last traded date across streams as a percentage of total; clearing and brokerage read near zero until those feeds are imported." /></div>
          {revenue_mix.map((r, i) => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 130, fontSize: 12 }}>{r.label}</span>
              <div style={{ flex: 1, height: 8, background: 'var(--br2)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: r.pct + '%', height: '100%', background: MIX_COLORS[i % MIX_COLORS.length] }} />
              </div>
              <span style={{ width: 38, textAlign: 'right', fontSize: 12, fontWeight: 500 }}>{r.pct}%</span>
            </div>
          ))}
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Mix reflects the live revenue streams (clearing/brokerage read ~0 until imported).</p>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📊 Revenue trend (last 17 trading days) — red dots = expiry days<InfoBtn text="Total daily revenue (₹ lakh) over the last 17 trading days; expiry days highlighted in red." /></div>
        <ViewToggle
          chart={
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v + 'L'} />
            <Tooltip formatter={v => '₹' + v + 'L'} />
            <Bar dataKey="revenue_l" name="Revenue (₹L)" radius={[3, 3, 0, 0]}>
              {trend.map((d, i) => <Cell key={i} fill={d.is_expiry ? '#e24b4a' : '#185fa5'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
          }
          table={
            <table>
              <thead><tr><th>Date</th><th>Revenue (₹L)</th><th>Expiry day</th></tr></thead>
              <tbody>
                {trend.map((d, i) => (
                  <tr key={i}><td>{d.date}</td><td>{'₹' + d.revenue_l + 'L'}</td><td>{d.is_expiry ? 'Yes' : '—'}</td></tr>
                ))}
                {(!trend || trend.length === 0) && <tr><td colSpan={3} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
              </tbody>
            </table>
          }
        />
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📈 Options volume trend (₹Cr) — red dots = expiry<InfoBtn text="Daily options premium turnover (₹ crore) over recent trading days; expiry days marked in red." /></div>
          <ViewToggle
            chart={
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v + 'Cr'} />
              <Tooltip formatter={v => '₹' + v + 'Cr'} />
              <Line dataKey="options_cr" stroke="#185fa5" strokeWidth={2} name="Options premium TO (₹Cr)"
                dot={(p) => p.cx == null ? null : <circle key={p.key} cx={p.cx} cy={p.cy} r={p.payload.is_expiry ? 4 : 2.5} fill={p.payload.is_expiry ? '#e24b4a' : '#185fa5'} />} />
            </LineChart>
          </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>Date</th><th>Options premium TO (₹Cr)</th><th>Expiry day</th></tr></thead>
                <tbody>
                  {trend.map((d, i) => (
                    <tr key={i}><td>{d.date}</td><td>{'₹' + d.options_cr + 'Cr'}</td><td>{d.is_expiry ? 'Yes' : '—'}</td></tr>
                  ))}
                  {(!trend || trend.length === 0) && <tr><td colSpan={3} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                </tbody>
              </table>
            }
          />
        </div>
        <div className="panel">
          <div className="ptitle">👥 Daily client count trend<InfoBtn text="Number of clients who traded each day over recent trading days; expiry days highlighted in red." /></div>
          <ViewToggle
            chart={
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="clients" name="Clients traded" radius={[3, 3, 0, 0]}>
                {trend.map((d, i) => <Cell key={i} fill={d.is_expiry ? '#e24b4a' : '#185fa5'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>Date</th><th>Clients traded</th><th>Expiry day</th></tr></thead>
                <tbody>
                  {trend.map((d, i) => (
                    <tr key={i}><td>{d.date}</td><td>{num(d.clients)}</td><td>{d.is_expiry ? 'Yes' : '—'}</td></tr>
                  ))}
                  {(!trend || trend.length === 0) && <tr><td colSpan={3} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                </tbody>
              </table>
            }
          />
        </div>
      </div>

      <div className="brow" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn bp" disabled={!!busy} onClick={() => download('pdf')}>
          {busy === 'pdf' ? 'Generating…' : '📄 Export MIS (PDF)'}
        </button>
        <button className="btn" disabled={!!busy} onClick={emailToManagement}>
          {busy === 'email' ? 'Sending…' : '✉️ Email to management'}
        </button>
        <button className="btn" disabled={!!busy} onClick={() => download('xlsx')}>
          {busy === 'xlsx' ? 'Generating…' : '⬇️ Download as Excel'}
        </button>
      </div>
    </div>
  );
};

export default DailyMIS;