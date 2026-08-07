import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import api from '../api';
import { InfoBtn, ViewToggle, DateRange, rangeParams } from '../components/ui';

// ── formatting helpers ──────────────────────────────────────────
const rupee = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + 'L';
  return '₹' + Math.round(v).toLocaleString('en-IN');
};
const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const L   = (n) => (Number(n) || 0) / 1e5;
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const mLabel = (m) => { if (!m) return ''; const [y, mo] = m.split('-'); return `${MON[+mo - 1]} '${y.slice(2)}`; };
const mShort = (m) => { if (!m) return ''; const [, mo] = m.split('-'); return MON[+mo - 1]; };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const pctDelta = (cur, prev) => {
  if (prev == null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
};

const RevenueFloat = () => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [range, setRange]     = useState({ key: 'all' });

  useEffect(() => {
    if (range.key === 'custom' && !(range.from && range.to)) return;
    setLoading(true);
    api.get('/analytics/revenue-float', { params: rangeParams(range) })
      .then(res => setData(res.data))
      .catch(() => setError('Could not load revenue & float data.'))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading && !data) return <div className="ph"><h2>Revenue &amp; float</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Revenue &amp; float</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, kpis, monthly, float_book, mtf_book, footnotes } = data;
  // Derived per-conversion MTF interest at the ₹5L benchmark from the real avg MTF rate
  const mtfPerConv = footnotes && footnotes.avg_mtf_rate
    ? Math.round(500000 * (footnotes.avg_mtf_rate / 100) / 12)
    : null;

  // Per-month stream figures. Clearing (commission), brokerage, float and MTF are all real.
  const streamMonthly = monthly.map(m => ({
    month: m.month,
    trade_days: m.trade_days,
    // Float is earned every calendar day the balance sits — use the month's ledger-day count
    // (from backend), not trading days, so the total matches the Company Dashboard.
    float_days: m.float_days != null ? m.float_days : m.trade_days,
    float_income_day: m.float_income_day || 0,
    options_clearing: m.commission || 0,
    equity_brokerage: m.brokerage,
    float_income: (m.float_income_day || 0) * (m.float_days != null ? m.float_days : m.trade_days),
    mtf_interest: m.mtf_interest,
  }));

  // Chart — Monthly revenue by stream (₹L)
  const chartData = streamMonthly.map(m => ({
    month: mLabel(m.month),
    'Options clearing':  +L(m.options_clearing).toFixed(2),
    'Equity brokerage':  +L(m.equity_brokerage).toFixed(2),
    'Float income (est.)': +L(m.float_income).toFixed(2),
    'MTF interest':      +L(m.mtf_interest).toFixed(2),
  }));

  // Income-stream comparison table — last 3 months as avg/day
  const shown = streamMonthly.slice(-3).reverse(); // latest first
  const perDay = (m, key) => {
    const d = m.trade_days || 1;
    if (key === 'options_clearing') return m.options_clearing / d;
    if (key === 'equity_brokerage') return m.equity_brokerage / d;
    if (key === 'float_income')     return m.float_income_day || 0;   // ₹/day rate (not total ÷ trade_days)
    if (key === 'mtf_interest')     return m.mtf_interest / 30;
    return 0;
  };
  const prior3 = (key) => {
    const set = streamMonthly.slice(-3);
    const days = set.reduce((s, m) => s + (m.trade_days || 0), 0) || 1;
    if (key === 'mtf_interest') return set.reduce((s, m) => s + m.mtf_interest, 0) / 90;
    if (key === 'float_income') return set.length ? set.reduce((s, m) => s + perDay(m, 'float_income'), 0) / set.length : 0;
    return set.reduce((s, m) => s + m[key], 0) / days;
  };
  const ytd = (key) => streamMonthly.reduce((s, m) => s + m[key], 0);

  const streamRows = [
    { key: 'options_clearing', name: 'Clearing charges (commission)', share: 'b-act', hl: 'var(--ibg)' },
    { key: 'equity_brokerage', name: 'Equity brokerage',            share: 'b-hv',  hl: 'inherit' },
    { key: 'float_income',     name: 'Float income (estimated)',    share: 'b-lead', hl: 'var(--pbg)' },
    { key: 'mtf_interest',     name: 'MTF interest',                share: 'b-nri', hl: 'inherit' },
  ];
  const totalRev = ytd('options_clearing') + ytd('equity_brokerage') + ytd('float_income') + ytd('mtf_interest');
  const sharePct = (key) => totalRev > 0 ? Math.round(ytd(key) / totalRev * 100) : 0;

  // KPI deltas
  const lastM = streamMonthly[streamMonthly.length - 1];
  const prevM = streamMonthly[streamMonthly.length - 2];
  const revOf = (m) => m ? m.options_clearing + m.equity_brokerage + m.float_income + m.mtf_interest : 0;
  const momDelta = pctDelta(revOf(lastM), revOf(prevM));

  const snapMonth = float_book.ledger_date ? String(float_book.ledger_date).slice(0, 7) : null;
  const cols = shown.map(m => mShort(m.month)); // e.g. ['Jul','Jun','May']

  return (
    <div>
      <div className="ph">
        <h2>Revenue &amp; float</h2>
        <p>All income streams — monthly trend, YTD, float book, MTF book · Prior month and 3-month averages{float_book && float_book.ledger_date ? ` · As of ${fmtDate(float_book.ledger_date)}` : ''}</p>
      </div>

      <DateRange value={range} onChange={setRange} bounds={meta && meta.range ? { min: meta.range.data_min, max: meta.range.data_max } : undefined} active={meta && meta.range} />
      {loading && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>Updating…</div>}

      <div className="alert a-i">
        ℹ️ Float income = total ledger balance × <strong>{meta.fd_rate}% p.a.</strong> ÷ 365. Rate configurable in Admin → MIS Settings.
      </div>
      {!meta.brokerage_loaded && (
        <div className="alert a-w" style={{ marginTop: 8 }}>
          ⚠️ Brokerage / options-clearing revenue is not yet imported — those stream rows read ₹0 until the daily brokerage file is loaded. Float, MTF and turnover are live.
        </div>
      )}

      <div className="cards">
        <div className="card ci">
          <div className="clbl">Total MTD revenue</div>
          <div className="cval">{rupee(kpis.mtd_revenue)}</div>
          <div className="csub">{lastM ? mShort(lastM.month) : ''} avg vs {prevM ? mShort(prevM.month) : ''} avg: {momDelta == null ? '—' : (momDelta >= 0 ? '+' : '') + momDelta.toFixed(1) + '%'}</div>
        </div>
        <div className="card cs">
          <div className="clbl">YTD revenue</div>
          <div className="cval">{rupee(kpis.ytd_revenue)}</div>
          <div className="csub">FY to date · real streams</div>
        </div>
        <div className="card cw">
          <div className="clbl">Float book (total ledger)</div>
          <div className="cval">{rupee(kpis.float_book_total)}</div>
          <div className="csub">Est. daily income {inr(kpis.float_daily_income)}</div>
        </div>
        <div className="card cp">
          <div className="clbl">MTF book (est.)<InfoBtn text="Estimated outstanding MTF funding, back-calculated from the interest export (balance = interest ÷ rate% ÷ days ÷ 365) because that file carries no principal column. Approximate — chargeable days can differ from the stated window. An MTF funding/exposure file would give the exact book." /></div>
          <div className="cval">{rupee(kpis.mtf_book_balance)}</div>
          <div className="csub">{kpis.mtf_clients} clients · {inr(kpis.mtf_daily_interest)}/day interest</div>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📊 Monthly revenue by stream (₹L) — last 8 months<InfoBtn text="Monthly revenue in ₹ lakh stacked by stream: options clearing, equity brokerage, estimated float income and MTF interest." /></div>
        <ViewToggle
          chart={
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v + 'L'} />
            <Tooltip formatter={v => '₹' + v + 'L'} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
            <Bar dataKey="Options clearing"    stackId="s" fill="#185fa5" />
            <Bar dataKey="Equity brokerage"    stackId="s" fill="#9FE1CB" />
            <Bar dataKey="Float income (est.)" stackId="s" fill="#AFA9EC" />
            <Bar dataKey="MTF interest"        stackId="s" fill="#FAC775" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
          }
          table={
        <table>
          <thead><tr><th>Month</th><th>Options clearing</th><th>Equity brokerage</th><th>Float income (est.)</th><th>MTF interest</th></tr></thead>
          <tbody>
            {chartData.map(m => (
              <tr key={m.month}>
                <td>{m.month}</td>
                <td>{'₹' + m['Options clearing'] + 'L'}</td>
                <td>{'₹' + m['Equity brokerage'] + 'L'}</td>
                <td>{'₹' + m['Float income (est.)'] + 'L'}</td>
                <td>{'₹' + m['MTF interest'] + 'L'}</td>
              </tr>
            ))}
            {chartData.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
          </tbody>
        </table>
          }
        />
      </div>

      <div className="panel">
        <div className="ptitle">📋 Income stream comparison — monthly averages<InfoBtn text="Per-day averages for each revenue stream across the last three months, prior 3-month average, YTD total, revenue share and trend direction." /></div>
        <div className="tw"><table>
          <thead>
            <tr>
              <th>Revenue stream</th><th>Revenue share</th>
              <th>{cols[0] || '—'} MTD avg/day</th>
              <th>{cols[1] || '—'} avg/day</th>
              <th>{cols[2] || '—'} avg/day</th>
              <th>Prior 3M avg/day</th><th>YTD total</th><th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {streamRows.map((r) => {
              const vals = shown.map(m => perDay(m, r.key));
              const up = vals[0] >= (vals[1] ?? vals[0]);
              return (
                <tr key={r.key} style={{ background: r.hl }}>
                  <td><strong>{r.name}</strong></td>
                  <td><span className={`badge ${r.share}`}>{sharePct(r.key)}%</span></td>
                  {[0, 1, 2].map(i => <td key={i}>{shown[i] ? inr(vals[i]) : '—'}</td>)}
                  <td>{inr(prior3(r.key))}</td>
                  <td>{rupee(ytd(r.key))}</td>
                  <td style={{ color: up ? 'var(--sc)' : 'var(--dc)', fontWeight: 500 }}>{up ? '↑' : '↓'}</td>
                </tr>
              );
            })}
            <tr style={{ fontWeight: 600, borderTop: '.5px solid var(--br)' }}>
              <td>Total revenue</td><td>100%</td>
              {[0, 1, 2].map(i => (
                <td key={i}>{shown[i] ? inr(streamRows.reduce((s, r) => s + perDay(shown[i], r.key), 0)) : '—'}</td>
              ))}
              <td>{inr(streamRows.reduce((s, r) => s + prior3(r.key), 0))}</td>
              <td>{rupee(totalRev)}</td>
              <td style={{ color: 'var(--sc)' }}>↑</td>
            </tr>
          </tbody>
        </table></div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">🏦 Float book analysis<InfoBtn text="Total client ledger balance and its estimated daily float income (balance × FD rate ÷ 365), plus balance concentration and idle-float opportunities." /></div>
          <div className="tw"><table>
            <thead><tr><th>Metric</th><th>{mShort(snapMonth)} avg</th><th>—</th><th>—</th><th>3M avg</th></tr></thead>
            <tbody>
              <tr><td>Total ledger balance (₹Cr)</td><td>{(float_book.total_ledger_balance / 1e7).toFixed(1)}</td><td>—</td><td>—</td><td>—</td></tr>
              <tr><td>Est. daily float income (₹)</td><td>{Math.round(float_book.daily_income).toLocaleString('en-IN')}</td><td>—</td><td>—</td><td>—</td></tr>
              <tr><td>Clients with balance &gt;₹5L</td><td>{float_book.clients_above_5l.toLocaleString('en-IN')}</td><td>—</td><td>—</td><td>—</td></tr>
              <tr><td>Avg balance per active client (₹)</td><td>{inr(float_book.avg_balance)}</td><td>—</td><td>—</td><td>—</td></tr>
              <tr><td>Top 10 clients — % of float</td><td>{float_book.top10_pct.toFixed(1)}%</td><td>—</td><td>—</td><td>—</td></tr>
            </tbody>
          </table></div>
          <div className="slbl">Float opportunity — idle balance clients</div>
          <p style={{ fontSize: 12, color: 'var(--tx2)' }}>{footnotes.idle_float_clients.toLocaleString('en-IN')} clients have avg opening balance &gt;₹2L but traded fewer than 5 days this month. Potential to deploy capital or cross-sell MTF.</p>
          <button className="btn bp" style={{ marginTop: 8 }}>⭐ View idle float leads</button>
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 8 }}>Snapshot as of {fmtDate(float_book.ledger_date)}. Monthly averages populate as daily ledgers accumulate.</p>
        </div>

        <div className="panel">
          <div className="ptitle">💰 MTF book analysis<InfoBtn text="Net MTF funding book, daily interest income, client count and average funding per client, plus the MTF cross-sell pipeline." /></div>
          <div className="tw"><table>
            <thead><tr><th>Metric</th><th>{mtf_book.month || '—'}</th><th>—</th><th>—</th><th>3M avg</th></tr></thead>
            <tbody>
              <tr><td>Net MTF funding — est. (₹Cr)</td><td>{(mtf_book.balance / 1e7).toFixed(2)}</td><td>—</td><td>—</td><td>—</td></tr>
              <tr><td>MTF interest income (₹/day)</td><td>{Math.round(mtf_book.interest / 30).toLocaleString('en-IN')}</td><td>—</td><td>—</td><td>—</td></tr>
              <tr><td>MTF clients</td><td>{mtf_book.clients.toLocaleString('en-IN')}</td><td>—</td><td>—</td><td>—</td></tr>
              <tr><td>Avg MTF per client (₹L)</td><td>{(mtf_book.avg_per_client / 1e5).toFixed(2)}</td><td>—</td><td>—</td><td>—</td></tr>
            </tbody>
          </table></div>
          <div className="slbl">MTF cross-sell pipeline</div>
          <p style={{ fontSize: 12, color: 'var(--tx2)' }}>{footnotes.mtf_eligible_not_using.toLocaleString('en-IN')} clients are MTF eligible (active F&amp;O, sufficient holdings) but not currently using MTF.{mtfPerConv ? ` Each conversion at avg ₹5L adds ~₹${mtfPerConv.toLocaleString('en-IN')}/month interest.` : ''}</p>
          <button className="btn bp" style={{ marginTop: 8 }}>⭐ View MTF eligible clients</button>
        </div>
      </div>
    </div>
  );
};

export default RevenueFloat;