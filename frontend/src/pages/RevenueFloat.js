import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
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
  const navigate = useNavigate();
  const [modal, setModal]             = useState(null);   // null | 'idle' | 'mtf'
  const [list, setList]               = useState([]);
  const [listLoading, setListLoading] = useState(false);

  // Open the drill-down for a footnote count. The list endpoints reuse the exact
  // count criteria, so the modal length matches the number on the button.
  const openList = (kind) => {
    setModal(kind); setList([]); setListLoading(true);
    const url = kind === 'idle'
      ? '/analytics/revenue-float/idle-float-leads'
      : '/analytics/revenue-float/mtf-eligible';
    api.get(url).then(r => setList(r.data || [])).catch(() => setList([])).finally(() => setListLoading(false));
  };

  const downloadCsv = (filename, cols) => {
    const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = [cols.map(c => c.label).join(',')]
      .concat(list.map(r => cols.map(c => esc(c.raw ? c.raw(r) : c.val(r))).join(',')))
      .join('\n');
    const url = window.URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
  };

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
  const chartData = streamMonthly.map(m => {
    const oc = +L(m.options_clearing).toFixed(2);
    const eb = +L(m.equity_brokerage).toFixed(2);
    const fi = +L(m.float_income).toFixed(2);
    const mi = +L(m.mtf_interest).toFixed(2);
    return {
      month: mLabel(m.month),
      'Options clearing': oc,
      'Equity brokerage': eb,
      'Float income (est.)': fi,
      'MTF interest': mi,
      'Total': +(oc + eb + fi + mi).toFixed(2),   // shown as a line on the chart + a column in the table
    };
  });

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

  // Float / MTF book prior columns. Each widget shows: latest month, up to two prior
  // months, and a 3-month average. Priors + avg3 come from the backend; a missing prior
  // renders as '—' (dash cell) so the table never fabricates a month it has no data for.
  const fbPrior = float_book.prior || [];
  const fbAvg3  = float_book.avg3 || null;
  const mtfPrior = mtf_book.prior || [];
  const mtfAvg3  = mtf_book.avg3 || null;
  // renderers: given a formatter fn, emit the 4 value columns (latest, prior1, prior2, 3M avg)
  const fbCols = (latest, fmt) => [
    <td key="l">{fmt(latest)}</td>,
    fbPrior[0] ? <td key="p1">{fmt(fbPrior[0])}</td> : <td key="p1">—</td>,
    fbPrior[1] ? <td key="p2">{fmt(fbPrior[1])}</td> : <td key="p2">—</td>,
    fbAvg3 ? <td key="a3">{fmt(fbAvg3)}</td> : <td key="a3">—</td>,
  ];
  const mtfCols = (latest, fmt) => [
    <td key="l">{fmt(latest)}</td>,
    mtfPrior[0] ? <td key="p1">{fmt(mtfPrior[0])}</td> : <td key="p1">—</td>,
    mtfPrior[1] ? <td key="p2">{fmt(mtfPrior[1])}</td> : <td key="p2">—</td>,
    mtfAvg3 ? <td key="a3">{fmt(mtfAvg3)}</td> : <td key="a3">—</td>,
  ];

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
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v + 'L'} />
            <Tooltip formatter={v => '₹' + v + 'L'} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
            <Bar dataKey="Options clearing"    stackId="s" fill="#185fa5" />
            <Bar dataKey="Equity brokerage"    stackId="s" fill="#9FE1CB" />
            <Bar dataKey="Float income (est.)" stackId="s" fill="#AFA9EC" />
            <Bar dataKey="MTF interest"        stackId="s" fill="#FAC775" radius={[4, 4, 0, 0]} />
            {/* Total = sum of all four streams, drawn as a line over the stack. */}
            <Line dataKey="Total" stroke="#1f2a44" strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
          }
          table={
        <table>
          <thead><tr><th>Month</th><th>Options clearing</th><th>Equity brokerage</th><th>Float income (est.)</th><th>MTF interest</th><th>Total</th></tr></thead>
          <tbody>
            {chartData.map(m => (
              <tr key={m.month}>
                <td>{m.month}</td>
                <td>{'₹' + m['Options clearing'] + 'L'}</td>
                <td>{'₹' + m['Equity brokerage'] + 'L'}</td>
                <td>{'₹' + m['Float income (est.)'] + 'L'}</td>
                <td>{'₹' + m['MTF interest'] + 'L'}</td>
                <td><strong>{'₹' + m['Total'] + 'L'}</strong></td>
              </tr>
            ))}
            {chartData.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
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
            <thead><tr><th>Metric</th><th>{mShort(snapMonth)}</th><th>{fbPrior[0] ? mShort(fbPrior[0].month) : '—'}</th><th>{fbPrior[1] ? mShort(fbPrior[1].month) : '—'}</th><th>3M avg</th></tr></thead>
            <tbody>
              <tr><td>Total ledger balance (₹Cr)</td>{fbCols(float_book, v => (v.total_ledger_balance / 1e7).toFixed(1))}</tr>
              <tr><td>Est. daily float income (₹)</td>{fbCols(float_book, v => Math.round(v.daily_income).toLocaleString('en-IN'))}</tr>
              <tr><td>Clients with balance &gt;₹5L</td>{fbCols(float_book, v => Math.round(v.clients_above_5l).toLocaleString('en-IN'))}</tr>
              <tr><td>Avg balance per active client (₹)</td>{fbCols(float_book, v => inr(v.avg_balance))}</tr>
              <tr><td>Top 10 clients — % of float</td>{fbCols(float_book, v => v.top10_pct.toFixed(1) + '%')}</tr>
            </tbody>
          </table></div>
          <div className="slbl">Float opportunity — idle balance clients</div>
          <p style={{ fontSize: 12, color: 'var(--tx2)' }}>{footnotes.idle_float_clients.toLocaleString('en-IN')} clients have avg opening balance &gt;₹2L but traded fewer than 5 days this month. Potential to deploy capital or cross-sell MTF.</p>
          <button className="btn bp" style={{ marginTop: 8 }} onClick={() => openList('idle')}>⭐ View idle float leads</button>
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 8 }}>Snapshot as of {fmtDate(float_book.ledger_date)}. Monthly averages populate as daily ledgers accumulate.</p>
        </div>

        <div className="panel">
          <div className="ptitle">💰 MTF book analysis<InfoBtn text="Net MTF funding book, daily interest income, client count and average funding per client, plus the MTF cross-sell pipeline." /></div>
          <div className="tw"><table>
            <thead><tr><th>Metric</th><th>{mtf_book.month ? mShort(mtf_book.month) : '—'}</th><th>{mtfPrior[0] ? mShort(mtfPrior[0].month) : '—'}</th><th>{mtfPrior[1] ? mShort(mtfPrior[1].month) : '—'}</th><th>3M avg</th></tr></thead>
            <tbody>
              <tr><td>Net MTF funding — est. (₹Cr)</td>{mtfCols(mtf_book, v => (v.balance / 1e7).toFixed(2))}</tr>
              <tr><td>MTF interest income (₹/day)</td>{mtfCols(mtf_book, v => Math.round(v.interest / 30).toLocaleString('en-IN'))}</tr>
              <tr><td>MTF clients</td>{mtfCols(mtf_book, v => Math.round(v.clients).toLocaleString('en-IN'))}</tr>
              <tr><td>Avg MTF per client (₹L)</td>{mtfCols(mtf_book, v => (v.avg_per_client / 1e5).toFixed(2))}</tr>
            </tbody>
          </table></div>
          <div className="slbl">MTF cross-sell pipeline</div>
          <p style={{ fontSize: 12, color: 'var(--tx2)' }}>{footnotes.mtf_eligible_not_using.toLocaleString('en-IN')} clients are MTF eligible (active F&amp;O, sufficient holdings) but not currently using MTF.{mtfPerConv ? ` Each conversion at avg ₹5L adds ~₹${mtfPerConv.toLocaleString('en-IN')}/month interest.` : ''}</p>
          <button className="btn bp" style={{ marginTop: 8 }} onClick={() => openList('mtf')}>⭐ View MTF eligible clients</button>
        </div>
      </div>

      {modal && (() => {
        const isIdle = modal === 'idle';
        const cols = isIdle
          ? [
              { label: 'UCC',              val: r => r.ucc },
              { label: 'Name',             val: r => r.name || '—' },
              { label: 'Type',             val: r => r.client_type || '—' },
              { label: 'Opening balance',  val: r => rupee(r.balance),  raw: r => Math.round(r.balance || 0) },
              { label: 'Trade days (MTD)', val: r => r.trade_days },
              { label: 'RM',               val: r => r.rm_name || 'Unmapped' },
            ]
          : [
              { label: 'UCC',              val: r => r.ucc },
              { label: 'Name',             val: r => r.name || '—' },
              { label: 'Type',             val: r => r.client_type || '—' },
              { label: 'Holdings',         val: r => rupee(r.holdings), raw: r => Math.round(r.holdings || 0) },
              { label: 'MTD F&O turnover', val: r => rupee(r.fo_to),    raw: r => Math.round(r.fo_to || 0) },
              { label: 'RM',               val: r => r.rm_name || 'Unmapped' },
            ];
        const title = isIdle ? 'Idle float leads' : 'MTF-eligible clients';
        const sub = isIdle
          ? 'Opening balance > ₹2L and fewer than 5 trading days this month — capital to deploy or cross-sell MTF.'
          : 'Active equity F&O this month with holdings > ₹2L, not currently using MTF.';
        return (
          <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div className="panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 960, width: '100%', maxHeight: '86vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div className="ptitle" style={{ marginBottom: 2 }}>{isIdle ? '⭐ ' : '💰 '}{title}{!listLoading && <span style={{ color: 'var(--tx3)', fontWeight: 400 }}> · {list.length}</span>}</div>
                  <p style={{ fontSize: 12, color: 'var(--tx2)', margin: 0 }}>{sub}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button className="btn sm" disabled={!list.length} onClick={() => downloadCsv(`${isIdle ? 'idle_float_leads' : 'mtf_eligible'}.csv`, cols)}>⬇ CSV</button>
                  <button className="btn sm" onClick={() => setModal(null)}>✕ Close</button>
                </div>
              </div>
              <div className="tw" style={{ marginTop: 12 }}><table>
                <thead><tr>{cols.map(c => <th key={c.label}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {listLoading ? (
                    <tr><td colSpan={cols.length} style={{ padding: 24, textAlign: 'center', color: 'var(--tx3)' }}>Loading…</td></tr>
                  ) : list.length === 0 ? (
                    <tr><td colSpan={cols.length} style={{ padding: 24, textAlign: 'center', color: 'var(--tx3)' }}>No clients match right now.</td></tr>
                  ) : list.map((r, i) => (
                    <tr key={i}>
                      {cols.map((c, ci) => (
                        <td key={ci}>
                          {ci === 0
                            ? <span className="lc" style={{ cursor: 'pointer' }} onClick={() => navigate('/client-360', { state: { ucc: r.ucc } })}>{c.val(r)}</span>
                            : c.val(r)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default RevenueFloat;