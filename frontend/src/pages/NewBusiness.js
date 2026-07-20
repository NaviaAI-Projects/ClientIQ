import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import api from '../api';
import { InfoBtn, ViewToggle, DateRange, rangeParams } from '../components/ui';

const rupee = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + 'L';
  return '₹' + Math.round(v).toLocaleString('en-IN');
};
const spct = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + Number(n).toFixed(1) + '%');
const colorOf = (n) => (n == null ? 'var(--tx2)' : n >= 0 ? 'var(--sc)' : 'var(--dc)');
const SEGS = ['Equity Cash', 'Equity Options', 'Equity Futures', 'Commodity Futures', 'Commodity Options'];
const SEG_COLORS = { 'Equity Cash': '#185fa5', 'Equity Options': '#9FE1CB', 'Equity Futures': '#AFA9EC', 'Commodity Futures': '#FAC775', 'Commodity Options': '#e0803a' };

const NewBusiness = () => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [range, setRange]     = useState({ key: 'all' });

  useEffect(() => {
    if (range.key === 'custom' && !(range.from && range.to)) return;
    setLoading(true);
    api.get('/analytics/new-business', { params: rangeParams(range) })
      .then(res => setData(res.data))
      .catch(() => setError('Could not load new business data.'))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading && !data) return <div className="ph"><h2>New business report</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>New business report</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, featured, acquisition, segments, new_client_segments } = data;
  const fm = meta.featured_month || '';
  const pm = meta.prior_month || '';
  const acctMoM = featured && featured.prior_new_accounts
    ? ((featured.new_accounts - featured.prior_new_accounts) / featured.prior_new_accounts) * 100 : null;

  // Segment pivots
  const segMonths = meta.seg_months || [];               // ascending labels
  const segMap = {};                                     // segment -> monthLabel -> {clients, vol}
  SEGS.forEach(s => { segMap[s] = {}; });
  segments.forEach(r => { (segMap[r.segment] = segMap[r.segment] || {})[r.mon] = { clients: r.clients, vol: r.vol_cr_day }; });

  // Chart: active clients by segment (stacked) per month
  const clientTrend = segMonths.map(m => {
    const row = { month: m };
    SEGS.forEach(s => { row[s] = segMap[s]?.[m]?.clients || 0; });
    return row;
  });
  // Chart: avg daily volume — Eq Options vs Commodity F&O
  const volTrend = segMonths.map(m => ({
    month: m,
    'Eq Options': segMap['Equity Options']?.[m]?.vol || 0,
    'Commodity F&O': (segMap['Commodity Futures']?.[m]?.vol || 0) + (segMap['Commodity Options']?.[m]?.vol || 0),
  }));
  // Acquisition charts (last 12)
  const acq12 = acquisition.slice(-12);

  // Table 1 — all-clients segment summary, latest up to 3 months (descending)
  const tblMonths = segMonths.slice(-3).reverse();
  const change3m = (seg) => {
    const ms = segMonths.slice(-3);
    if (ms.length < 2) return null;
    const first = segMap[seg]?.[ms[0]]?.clients || 0;
    const last = segMap[seg]?.[ms[ms.length - 1]]?.clients || 0;
    return first ? ((last - first) / first) * 100 : null;
  };

  return (
    <div>
      <div className="ph">
        <h2>New business report</h2>
        <p>Monthly client acquisition, segment-wise active clients, volume contribution, and new account analytics{meta.as_of ? ` · As of ${meta.as_of}` : ''}</p>
      </div>

      <DateRange value={range} onChange={setRange} bounds={meta && meta.range ? { min: meta.range.data_min, max: meta.range.data_max } : undefined} active={meta && meta.range} />
      {loading && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>Updating…</div>}

      <div className="cards">
        <div className="card ci">
          <div className="clbl">New accounts opened ({fm})</div>
          <div className="cval">{featured ? featured.new_accounts.toLocaleString('en-IN') : '—'}</div>
          <div className="csub">vs {pm}: {featured && featured.prior_new_accounts != null ? featured.prior_new_accounts.toLocaleString('en-IN') : '—'} ({spct(acctMoM)})</div>
        </div>
        <div className="card cs">
          <div className="clbl">New clients trading ({fm})</div>
          <div className="cval">{featured ? featured.trading.toLocaleString('en-IN') : '—'}</div>
          <div className="csub">{featured ? featured.trading_pct.toFixed(1) : '0'}% of accounts opened</div>
        </div>
        <div className="card cw">
          <div className="clbl">New client ledger balance</div>
          <div className="cval">{featured ? rupee(featured.ledger_bal) : '—'}</div>
          <div className="csub">{fm} opening deposits</div>
        </div>
        <div className="card cp">
          <div className="clbl">Navia exchange contribution</div>
          <div className="cval">—</div>
          <div className="csub">New client share of exchange TO</div>
        </div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📊 Active clients by segment — monthly trend<InfoBtn text="Distinct active clients per month stacked by segment (Equity Cash, Options, Futures, Commodity F&O). Counts clients trading at least once that month in each segment." /></div>
          <ViewToggle
            chart={
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={clientTrend} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} iconSize={9} />
              {SEGS.map((s, i) => <Bar key={s} dataKey={s} stackId="a" fill={SEG_COLORS[s]} radius={i === SEGS.length - 1 ? [4, 4, 0, 0] : 0} />)}
            </BarChart>
          </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>Month</th>{SEGS.map(s => <th key={s}>{s}</th>)}</tr></thead>
                <tbody>
                  {clientTrend.map(r => (
                    <tr key={r.month}><td>{r.month}</td>{SEGS.map(s => <td key={s}>{(r[s] || 0).toLocaleString('en-IN')}</td>)}</tr>
                  ))}
                  {clientTrend.length === 0 && <tr><td colSpan={SEGS.length + 1} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                </tbody>
              </table>
            }
          />
        </div>
        <div className="panel">
          <div className="ptitle">📈 Avg daily volume by key segment (₹Cr/day)<InfoBtn text="Average daily traded volume (₹Cr per day) per month, comparing Equity Options against combined Commodity Futures &amp; Options." /></div>
          <ViewToggle
            chart={
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={volTrend} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v + 'Cr'} />
              <Tooltip formatter={v => '₹' + v + 'Cr'} /><Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
              <Line dataKey="Eq Options" stroke="#185fa5" strokeWidth={2} />
              <Line dataKey="Commodity F&O" stroke="#e0803a" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>Month</th><th>Eq Options (₹Cr/day)</th><th>Commodity F&amp;O (₹Cr/day)</th></tr></thead>
                <tbody>
                  {volTrend.map(r => (
                    <tr key={r.month}><td>{r.month}</td><td>₹{r['Eq Options']}Cr</td><td>₹{r['Commodity F&O']}Cr</td></tr>
                  ))}
                  {volTrend.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                </tbody>
              </table>
            }
          />
        </div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📊 New accounts opened vs new clients trading<InfoBtn text="Per month (last 12): accounts newly opened versus how many of those new clients actually placed a trade. Gap shows activation shortfall." /></div>
          <ViewToggle
            chart={
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={acq12} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={44} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
              <Bar dataKey="new_accounts" fill="#185fa5" name="New accounts opened" radius={[3, 3, 0, 0]} />
              <Bar dataKey="trading" fill="#9FE1CB" name="New clients trading" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>Month</th><th>New accounts opened</th><th>New clients trading</th></tr></thead>
                <tbody>
                  {acq12.map(r => (
                    <tr key={r.label}><td>{r.label}</td><td>{(r.new_accounts || 0).toLocaleString('en-IN')}</td><td>{(r.trading || 0).toLocaleString('en-IN')}</td></tr>
                  ))}
                  {acq12.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                </tbody>
              </table>
            }
          />
        </div>
        <div className="panel">
          <div className="ptitle">📊 New client ledger balance (₹)<InfoBtn text="Total opening deposits (ledger balance) brought in by clients whose accounts opened each month, over the last 12 months." /></div>
          <ViewToggle
            chart={
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={acq12} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={44} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1e5 ? '₹' + (v / 1e5).toFixed(0) + 'L' : '₹' + v} />
              <Tooltip formatter={v => rupee(v)} />
              <Bar dataKey="ledger_bal" fill="#AFA9EC" name="New client ledger balance (₹)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>Month</th><th>New client ledger balance</th></tr></thead>
                <tbody>
                  {acq12.map(r => (
                    <tr key={r.label}><td>{r.label}</td><td>{rupee(r.ledger_bal)}</td></tr>
                  ))}
                  {acq12.length === 0 && <tr><td colSpan={2} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                </tbody>
              </table>
            }
          />
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📋 All-clients segment summary — monthly (averages)<InfoBtn text="Active clients and average daily volume (₹Cr/day) per segment for the latest up-to-3 months, plus the 3-month change in client count." /></div>
        <div className="tw"><table>
          <thead><tr>
            <th>Segment</th>
            {tblMonths[0] && <><th>{tblMonths[0]} clients</th><th>{tblMonths[0]} vol (₹Cr/d)</th></>}
            {tblMonths[1] && <><th>{tblMonths[1]} clients</th><th>{tblMonths[1]} vol</th></>}
            {tblMonths[2] && <th>{tblMonths[2]} clients</th>}
            <th>3M avg change</th>
          </tr></thead>
          <tbody>
            {SEGS.map(s => {
              const c = change3m(s);
              return (
                <tr key={s}>
                  <td>{s}</td>
                  {tblMonths[0] && <><td>{(segMap[s]?.[tblMonths[0]]?.clients || 0).toLocaleString('en-IN')}</td><td>{segMap[s]?.[tblMonths[0]]?.vol ?? 0}</td></>}
                  {tblMonths[1] && <><td>{(segMap[s]?.[tblMonths[1]]?.clients || 0).toLocaleString('en-IN')}</td><td>{segMap[s]?.[tblMonths[1]]?.vol ?? 0}</td></>}
                  {tblMonths[2] && <td>{(segMap[s]?.[tblMonths[2]]?.clients || 0).toLocaleString('en-IN')}</td>}
                  <td style={{ color: colorOf(c) }}>{spct(c)}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Segment split computed from raw trades ({segMonths.length} month{segMonths.length === 1 ? '' : 's'} available). Populates further as trade history accumulates.</p>
      </div>

      <div className="panel">
        <div className="ptitle">📋 New clients — segment distribution ({fm})<InfoBtn text="For clients whose accounts opened this month and traded: how they split across segments by client count and average daily volume (₹Cr)." /></div>
        <div className="tw"><table>
          <thead><tr><th>Segment</th><th>New clients trading</th><th>Avg daily volume (₹Cr)</th><th>3M avg change (clients)</th><th>3M avg change (volume)</th></tr></thead>
          <tbody>
            {SEGS.map(s => {
              const row = new_client_segments.find(r => r.segment === s);
              return (
                <tr key={s}>
                  <td>{s}</td>
                  <td>{row ? row.clients.toLocaleString('en-IN') : 0}</td>
                  <td>{row ? row.vol_cr_day : 0}</td>
                  <td>—</td><td>—</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>New clients = accounts opened in {fm} that have traded. 3-month change columns populate once multiple opening cohorts have trade history.</p>
      </div>
    </div>
  );
};

export default NewBusiness;