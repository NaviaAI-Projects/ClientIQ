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
  const [acqSegSel, setAcqSegSel] = useState('All');   // acquisition-table segment filter (table view only)

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

  const { meta, featured, acquisition, segments, new_client_segments, total_clients = 0, acq_seg = {} } = data;
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
  // Acquisition charts (last 12). turnover_cr = new-client cohort turnover in ₹Cr (2dp).
  const acq12 = acquisition.slice(-12).map(r => ({ ...r, turnover_cr: +(((r.turnover || 0) / 1e7)).toFixed(2) }));

  // Acquisition table: segment filter (table view) scopes trading + turnover; new accounts stays total.
  const ACQ_SEGS = ['All', ...SEGS];
  const segTrading  = (row) => acqSegSel === 'All' ? row.trading  : (acq_seg?.[row.key]?.[acqSegSel]?.trading  || 0);
  const segTurnover = (row) => acqSegSel === 'All' ? (row.turnover || 0) : (acq_seg?.[row.key]?.[acqSegSel]?.turnover || 0);
  const cr2 = (v) => ((Number(v) || 0) / 1e7).toFixed(2);   // ₹Cr, always 2 decimals
  // Before-bucket = every client NOT in the last 12 shown months → the row + last 12 tally with the Dashboard total.
  const last12 = acquisition.slice(-12);
  const beforeRows = acquisition.slice(0, -12);
  const last12Accounts = last12.reduce((s, r) => s + r.new_accounts, 0);
  const beforeAccounts = Math.max(0, (total_clients || 0) - last12Accounts);
  const beforeTrading  = beforeRows.reduce((s, r) => s + segTrading(r), 0);
  const beforeTurnover = beforeRows.reduce((s, r) => s + segTurnover(r), 0);
  const beforeLabel = last12.length ? `Before ${last12[0].label}` : 'Before';
  // 12-month totals (Sep '25 → current month) shown as the bottom Total row.
  const l12Trading  = last12.reduce((s, r) => s + segTrading(r), 0);
  const l12Turnover = last12.reduce((s, r) => s + segTurnover(r), 0);
  const totalLabel = last12.length ? `Total (${last12[0].label} – ${last12[last12.length - 1].label})` : 'Total';
  // Percentages: trading = traded ÷ accounts opened (per row); turnover = row TO ÷ overall TO (Before + 12M).
  const overallTurnover = beforeTurnover + l12Turnover;
  const pctStr = (num, den) => (den ? (num / den * 100).toFixed(1) + '%' : '—');
  const pctSub = { fontSize: 12, color: 'var(--tx2)', fontWeight: 600 };
  // Monthly average across the 12 months + the overall (Before + 12M = whole book) totals.
  const n12 = last12.length || 1;
  const avgAccounts = last12Accounts / n12;
  const avgTrading  = l12Trading / n12;
  const avgTurnover = l12Turnover / n12;
  const overallAccounts = beforeAccounts + last12Accounts;   // ≈ total client count (Dashboard)
  const overallTrading  = beforeTrading + l12Trading;
  // Last-3-month cards. "Last 3M" = the current month plus the two prior opening months
  // (e.g. Jul + Aug + Sep). "Trading" here = those new accounts that TRADED IN THE CURRENT MONTH
  // (trading_cur / turnover_cur from the backend), not traded-ever — so the card reflects new
  // accounts that are actively trading this month.
  const last3 = acquisition.slice(-3);
  const curLabel = meta.cur_month || (acquisition.length ? acquisition[acquisition.length - 1].label : '');   // current month = range end month
  const l3Accounts = last3.reduce((s, r) => s + r.new_accounts, 0);
  const l3Trading  = last3.reduce((s, r) => s + (r.trading_cur || 0), 0);
  const l3Turnover = last3.reduce((s, r) => s + (r.turnover_cur || 0), 0);
  const newCliTurnover = l3Trading ? l3Turnover / l3Trading : 0;   // avg current-month turnover per active new client

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
          <div className="clbl">New accounts opened (last 3M)</div>
          <div className="cval">{l3Accounts.toLocaleString('en-IN')}</div>
          <div className="csub">{fm}: {featured ? featured.new_accounts.toLocaleString('en-IN') : '—'} · vs {pm}: {featured && featured.prior_new_accounts != null ? featured.prior_new_accounts.toLocaleString('en-IN') : '—'} ({spct(acctMoM)})</div>
        </div>
        <div className="card cs">
          <div className="clbl">New clients trading (last 3M)</div>
          <div className="cval">{l3Trading.toLocaleString('en-IN')}</div>
          <div className="csub">{l3Accounts ? (l3Trading / l3Accounts * 100).toFixed(1) : '0'}% of last-3M accounts traded in {curLabel || 'the current month'}</div>
        </div>
        <div className="card cw">
          <div className="clbl">New client ledger balance</div>
          <div className="cval">{featured ? rupee(featured.ledger_bal) : '—'}</div>
          <div className="csub">{fm} ledger balance</div>
        </div>
        <div className="card cp">
          <div className="clbl">Avg turnover / trading client (last 3M)</div>
          <div className="cval">{rupee(newCliTurnover)}</div>
          <div className="csub">{curLabel || 'Current-month'} turnover ÷ new clients trading in {curLabel || 'the current month'} ({l3Trading.toLocaleString('en-IN')})</div>
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
              <Tooltip formatter={v => '₹' + Number(v).toFixed(2) + 'Cr'} /><Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
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
                    <tr key={r.month}><td>{r.month}</td><td>₹{Number(r['Eq Options']).toFixed(2)}Cr</td><td>₹{Number(r['Commodity F&O']).toFixed(2)}Cr</td></tr>
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
          <div className="ptitle">📊 New accounts opened vs new clients trading<InfoBtn text="Per month: accounts newly opened, how many of those new clients traded, and the traded turnover (₹Cr) they generated. New-clients-trading and turnover are measured only for these recently-opened cohorts — so the 'Before' baseline and 'Total (overall)' rows show the account base with '—' in those two columns (existing clients trade heavily, they're just not new business). In TABLE view, use the segment filter to scope the trading + turnover columns to one segment (new accounts stays total). The 'Before' bucket plus the shown months tally to the total client count." /></div>
          <ViewToggle
            tableControls={
              <label style={{ fontSize: 11, color: 'var(--tx2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Segment:
                <select value={acqSegSel} onChange={e => setAcqSegSel(e.target.value)}
                  style={{ padding: '3px 6px', border: '1px solid var(--br)', borderRadius: 6, fontSize: 11 }}>
                  {ACQ_SEGS.map(s => <option key={s} value={s}>{s === 'All' ? 'All segments' : s}</option>)}
                </select>
              </label>
            }
            chart={
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={acq12} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={44} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v + 'Cr'} />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
              <Bar yAxisId="left"  dataKey="new_accounts" fill="#185fa5" name="New accounts opened" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="left"  dataKey="trading" fill="#9FE1CB" name="New clients trading" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="right" dataKey="turnover_cr" fill="#FAC775" name="Turnover (₹Cr)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>Month</th><th>New accounts opened</th><th>New clients trading{acqSegSel !== 'All' ? ` · ${acqSegSel}` : ''}</th><th>Turnover (₹Cr){acqSegSel !== 'All' ? ` · ${acqSegSel}` : ''}</th></tr></thead>
                <tbody>
                  {(beforeRows.length > 0 || beforeAccounts > 0) && (
                    <tr style={{ fontWeight: 600, background: 'var(--bg2)' }}>
                      <td>{beforeLabel}</td>
                      <td>{beforeAccounts.toLocaleString('en-IN')}</td>
                      {/* Trading & turnover are measured only for recently-opened cohorts, so this
                          pre-period baseline shows "—" rather than a misleading ₹0 / 0% for clients
                          who trade heavily but simply aren't "new business". */}
                      <td style={{ color: 'var(--tx3)' }}>—</td>
                      <td style={{ color: 'var(--tx3)' }}>—</td>
                    </tr>
                  )}
                  {last12.map(r => (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td>{(r.new_accounts || 0).toLocaleString('en-IN')}</td>
                      <td>{segTrading(r).toLocaleString('en-IN')} <span style={pctSub}>({pctStr(segTrading(r), r.new_accounts)})</span></td>
                      <td>₹{cr2(segTurnover(r))}Cr <span style={pctSub}>({pctStr(segTurnover(r), overallTurnover)})</span></td>
                    </tr>
                  ))}
                  {last12.length > 0 && (
                    <tr style={{ fontWeight: 600, borderTop: '.5px solid var(--br)' }}>
                      <td>Total ({last12[0].label} – {last12[last12.length - 1].label})</td>
                      <td>{last12Accounts.toLocaleString('en-IN')}</td>
                      <td>{l12Trading.toLocaleString('en-IN')} <span style={pctSub}>({pctStr(l12Trading, last12Accounts)})</span></td>
                      <td>₹{cr2(l12Turnover)}Cr <span style={pctSub}>({pctStr(l12Turnover, overallTurnover)})</span></td>
                    </tr>
                  )}
                  {last12.length > 0 && (
                    <tr style={{ fontWeight: 700 }}>
                      <td>Total (overall)</td>
                      <td>{overallAccounts.toLocaleString('en-IN')}</td>
                      {/* Overall = the full account base. New-clients-trading and turnover apply only
                          to the recent opening cohorts (the rows above), so they're "—" here — showing
                          765 ÷ 75,868 = 1% would wrongly imply only 1% of the book ever trades. */}
                      <td style={{ color: 'var(--tx3)' }}>—</td>
                      <td style={{ color: 'var(--tx3)' }}>—</td>
                    </tr>
                  )}
                  {last12.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                </tbody>
              </table>
            }
          />
        </div>
        <div className="panel">
          <div className="ptitle">📊 New client ledger balance (₹)<InfoBtn text="Total ledger balance brought in by clients whose accounts opened each month, over the last 12 months." /></div>
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
                  {tblMonths[0] && <><td>{(segMap[s]?.[tblMonths[0]]?.clients || 0).toLocaleString('en-IN')}</td><td>{Number(segMap[s]?.[tblMonths[0]]?.vol ?? 0).toFixed(2)}</td></>}
                  {tblMonths[1] && <><td>{(segMap[s]?.[tblMonths[1]]?.clients || 0).toLocaleString('en-IN')}</td><td>{Number(segMap[s]?.[tblMonths[1]]?.vol ?? 0).toFixed(2)}</td></>}
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
                  <td>{Number(row ? row.vol_cr_day : 0).toFixed(2)}</td>
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