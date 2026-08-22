import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import api from '../api';
import { InfoBtn, ViewToggle, DateRange, rangeParams, ClientLink } from '../components/ui';

const rupee = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + 'L';
  return '₹' + Math.round(v).toLocaleString('en-IN');
};
const pct1 = (n) => (Number(n) || 0).toFixed(1) + '%';
const pct2 = (n) => (Number(n) || 0).toFixed(2) + '%';
const cr = (n) => +((Number(n) || 0) / 1e7).toFixed(2);
const SEG_COLORS = ['#185fa5', '#9FE1CB', '#AFA9EC', '#FAC775'];
// #16: margin-status tint from collateral coverage
const marginStyle = (s) => {
  if (s === 'Healthy')   return { background: '#d8f0e0', color: '#186a3b' };
  if (s === 'Adequate')  return { background: '#fdefd0', color: '#7a4510' };
  if (s === 'Shortfall') return { background: '#fbdcda', color: '#a3271f' };
  return { background: '#eceff3', color: '#66707d' };   // No exposure / unknown
};

const ConcentrationRisk = () => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [range, setRange]     = useState({ key: 'month' });

  useEffect(() => {
    if (range.key === 'custom' && !(range.from && range.to)) return;
    setLoading(true);
    api.get('/analytics/concentration', { params: rangeParams(range) })
      .then(res => setData(res.data))
      .catch(() => setError('Could not load concentration data.'))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading && !data) return <div className="ph"><h2>Concentration risk</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Concentration risk</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, kpis, totals, rev_buckets, float_buckets, monthly_trend, segment_mix, top_clients, float_top, mtf_top } = data;

  const trendData       = monthly_trend.map(m => ({ ...m, target: 35 }));
  const segPie          = segment_mix.filter(s => s.value > 0);

  // #15: table rows — named buckets show cumulative %; "Rest" = REMAINING share beyond the
  // last named bucket (Top 500 for revenue, Top 200 for float), not a redundant 100%; plus a
  // Total (all clients) row that sums to 100%. The "Share %" column is each slice's own contribution.
  const toTableRows = (buckets) => {
    const named = (buckets || []).filter(b => !/rest/i.test(b.label));
    const rows = [];
    let prevCum = 0;
    named.forEach(b => {
      const cum = +Number(b.cum_pct).toFixed(1);
      rows.push({ name: b.label, cum, share: +(cum - prevCum).toFixed(1) });
      prevCum = cum;
    });
    const lastLabel = named.length ? named[named.length - 1].label : 'named buckets';
    const remaining = +(100 - prevCum).toFixed(1);
    // #15: "Rest" shows the REMAINING % of revenue/float beyond the last named bucket
    // (Top 500 for revenue, Top 200 for float) in BOTH columns.
    rows.push({ name: `Rest (beyond ${lastLabel})`, cum: remaining, share: remaining, isRest: true });
    rows.push({ name: 'Total (all clients)', cum: 100, share: 100, isTotal: true });
    return rows;
  };
  const revTableRows   = toTableRows(rev_buckets);
  const floatTableRows = toTableRows(float_buckets);

  // Chart plots the same values as the table (Rest = remaining, not 100%); the Total row is
  // dropped since a 100% bar would just be redundant. Rest label shortened for the x-axis.
  const toChartData = (rows) => rows.filter(r => !r.isTotal).map(r => ({ name: r.isRest ? 'Rest' : r.name, v: r.cum }));
  const revBucketData   = toChartData(revTableRows);
  const floatBucketData = toChartData(floatTableRows);

  return (
    <div>
      <div className="ph">
        <h2>Concentration risk</h2>
        <p>Revenue, float, MTF, options volume and client-type concentration — identify over-dependence before it becomes a problem{meta && meta.as_of ? ` · As of ${meta.as_of}` : ''}</p>
      </div>

      <DateRange value={range} onChange={setRange} bounds={meta && meta.range ? { min: meta.range.data_min, max: meta.range.data_max } : undefined} active={meta && meta.range} />
      {loading && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>Updating…</div>}

      <div className="alert a-w">
        ⚠️ Top 50 clients contribute <strong>{pct1(kpis.top50_turnover_pct)} of total options clearing revenue</strong>. Top 10 clients contribute <strong>{pct1(kpis.top10_turnover_pct)}</strong>. Monitor for sudden inactivity in high-concentration accounts.
      </div>
      <p style={{ fontSize: 11, color: 'var(--tx3)', margin: '0 0 12px' }}>Revenue concentration is measured on options-premium turnover until brokerage revenue is imported.</p>

      <div className="cards">
        <div className="card cd"><div className="clbl">Top 10 clients — % of revenue</div><div className="cval">{pct1(kpis.top10_turnover_pct)}</div><div className="csub">{rupee(totals.top10_turnover_amt)} of {rupee(totals.turnover_total)} MTD</div></div>
        <div className="card cw"><div className="clbl">Top 50 clients — % of revenue</div><div className="cval">{pct1(kpis.top50_turnover_pct)}</div><div className="csub">{rupee(totals.top50_turnover_amt)} of {rupee(totals.turnover_total)} MTD</div></div>
        <div className="card ci"><div className="clbl">Top 10 — % of float</div><div className="cval">{pct1(kpis.top10_float_pct)}</div><div className="csub">{rupee(totals.top10_float_amt)} of {rupee(totals.float_total)} total</div></div>
        <div className="card cp"><div className="clbl">Top 5 — % of MTF book</div><div className="cval">{pct1(kpis.top5_mtf_pct)}</div><div className="csub">{rupee(totals.top5_mtf_amt)} of {rupee(totals.mtf_total)} book</div></div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📊 Revenue concentration — cumulative client contribution<InfoBtn text="Pareto view: cumulative % of total options-clearing revenue contributed by successive top-N client buckets. Healthy = top 100 clients below 60%." /></div>
          <ViewToggle
            chart={
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revBucketData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v + '%'} domain={[0, 100]} />
              <Tooltip formatter={v => v + '%'} />
              <Bar dataKey="v" fill="#185fa5" radius={[4, 4, 0, 0]} name="Cumulative % of options revenue" />
            </BarChart>
          </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>Client bucket</th><th>Cumulative % of options revenue</th><th>Share %</th></tr></thead>
                <tbody>
                  {revTableRows.map(r => (
                    <tr key={r.name} style={r.isTotal ? { fontWeight: 700, borderTop: '2px solid rgba(0,0,0,0.15)' } : undefined}>
                      <td>{r.name}</td>
                      <td>{r.cum}%</td>
                      <td>{r.share}%</td>
                    </tr>
                  ))}
                  {revTableRows.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                </tbody>
              </table>
            }
          />
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Pareto view: top N clients vs % of total options clearing revenue. Healthy = top 100 below 60%.</p>
        </div>
        <div className="panel">
          <div className="ptitle">📊 Float concentration — top clients by ledger balance<InfoBtn text="Cumulative % of total client float (ledger balance) held by successive top-N client buckets. Higher curve means float is concentrated in few accounts." /></div>
          <ViewToggle
            chart={
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={floatBucketData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v + '%'} domain={[0, 100]} />
              <Tooltip formatter={v => v + '%'} />
              <Bar dataKey="v" fill="#9FE1CB" radius={[4, 4, 0, 0]} name="% of total float" />
            </BarChart>
          </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>Client bucket</th><th>Cumulative % of total float</th><th>Share %</th></tr></thead>
                <tbody>
                  {floatTableRows.map(r => (
                    <tr key={r.name} style={r.isTotal ? { fontWeight: 700, borderTop: '2px solid rgba(0,0,0,0.15)' } : undefined}>
                      <td>{r.name}</td>
                      <td>{r.cum}%</td>
                      <td>{r.share}%</td>
                    </tr>
                  ))}
                  {floatTableRows.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                </tbody>
              </table>
            }
          />
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📈 Monthly concentration trend — are we moving in the right direction?<InfoBtn text="Month-by-month share of revenue held by the top 10 and top 50 clients, against a 35% target line for top-50 concentration. Lower is healthier." /></div>
        <ViewToggle
          chart={
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trendData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v + '%'} />
            <Tooltip formatter={v => pct1(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
            <Line dataKey="top10_pct" stroke="#185fa5" strokeWidth={2} name="Top 10 clients % of revenue" />
            <Line dataKey="top50_pct" stroke="#e0803a" strokeWidth={2} name="Top 50 clients % of revenue" />
            <Line dataKey="target" stroke="#3b9e5a" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="Target — top 50 below 35%" />
          </LineChart>
        </ResponsiveContainer>
          }
          table={
            <table>
              <thead><tr><th>Month</th><th>Top 10 % of revenue</th><th>Top 50 % of revenue</th><th>Target</th></tr></thead>
              <tbody>
                {trendData.map(r => (
                  <tr key={r.month}><td>{r.month}</td><td>{pct1(r.top10_pct)}</td><td>{pct1(r.top50_pct)}</td><td>{r.target}%</td></tr>
                ))}
                {trendData.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
              </tbody>
            </table>
          }
        />
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 8 }}>Target: top-50 client revenue concentration below 35%. Current: {pct1(kpis.top50_turnover_pct)}. Green dashed line = target threshold.</p>
      </div>

      <div className="panel">
        <div className="ptitle">📋 Top 20 clients by options revenue — concentration watch<InfoBtn text="Highest-revenue clients ranked by MTD options turnover, with each client's % of total revenue, cumulative %, mapped RM, and an unmapped-account risk flag." /></div>
        <div className="tw"><table>
          <thead><tr><th>Rank</th><th>UCC</th><th>Name</th><th>Type</th><th>Options TO (MTD)</th><th>Revenue (MTD)</th><th>% of total rev</th><th>Cum %</th><th>RM</th><th>Risk flag</th></tr></thead>
          <tbody>
            {top_clients.map(r => (
              <tr key={r.ucc}>
                <td>{r.rank}</td><td>{r.ucc}</td><td><ClientLink ucc={r.ucc} name={r.name} /></td>
                <td><span className="badge b-ri">{r.client_type}</span></td>
                <td>{rupee(r.opt_to)}</td>
                <td>{r.brokerage > 0 ? rupee(r.brokerage) : '—'}</td>
                <td>{pct2(r.pct_of_total)}</td><td>{pct1(r.cum_pct)}</td>
                <td>{r.rm_name}</td>
                <td>{r.unmapped ? <span className="badge b-pend">Unmapped</span> : '—'}</td>
              </tr>
            ))}
            {top_clients.length === 0 && <tr><td colSpan={10} style={{ color: 'var(--tx3)' }}>No trade data.</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">💰 MTF book concentration — top 10 exposures<InfoBtn text="Largest margin-trading-facility (MTF) exposures, ranked by outstanding balance. Columns: MTF balance, that client's % of the total MTF book, estimated interest per day (monthly interest ÷ 30), and margin status from collateral coverage — latest post-haircut DP holdings ÷ MTF balance (≥1.5× Healthy, 1–1.5× Adequate, below 1× Shortfall)." /></div>
          <div className="tw"><table>
            <thead><tr><th>Rank</th><th>UCC</th><th>Client</th><th>MTF balance</th><th>% of book</th><th>Interest/day</th><th>Margin status</th></tr></thead>
            <tbody>
              {mtf_top.map(r => (
                <tr key={r.ucc}><td>{r.rank}</td><td>{r.ucc}</td><td><ClientLink ucc={r.ucc} name={r.name} /></td><td>{rupee(r.balance)}</td><td>{pct1(r.pct_of_book)}</td><td>{rupee(r.interest_per_day != null ? r.interest_per_day : r.interest / 30)}</td><td><span className="badge" style={marginStyle(r.margin_status)} title={r.coverage != null ? `${r.coverage}× collateral coverage` : 'No collateral / exposure'}>{r.margin_status || '—'}</span></td></tr>
              ))}
              {mtf_top.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--tx3)' }}>No MTF data for latest month.</td></tr>}
            </tbody>
          </table></div>
        </div>
        <div className="panel">
          <div className="ptitle">🥧 Segment &amp; revenue-stream concentration<InfoBtn text="Share of revenue by segment / revenue stream. Options clearing is Navia's primary revenue driver and the main concentration risk." /></div>
          {segPie.length === 0 ? <div style={{ color: 'var(--tx3)', fontSize: 13, padding: '20px 0' }}>No revenue-stream data yet.</div> : (
            <ViewToggle
              chart={
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={segPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50}
                     label={(e) => `${e.name}: ${pct1(e.percent * 100)}`} labelLine={false}>
                  {segPie.map((_, i) => <Cell key={i} fill={SEG_COLORS[i % SEG_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => rupee(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
              }
              table={
                <table>
                  <thead><tr><th>Segment</th><th>Revenue</th></tr></thead>
                  <tbody>
                    {segPie.map(r => (
                      <tr key={r.name}><td>{r.name}</td><td>{rupee(r.value)}</td></tr>
                    ))}
                    {segPie.length === 0 && <tr><td colSpan={2} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                  </tbody>
                </table>
              }
            />
          )}
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Revenue dependency by segment. Options clearing is Navia's primary revenue driver and the main concentration risk.</p>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📋 Float concentration — top 20 clients by opening balance<InfoBtn text="Clients ranked by their latest opening ledger balance, showing each one's % of total float, cumulative %, and whether they traded this month (idle float = cross-sell opportunity)." /></div>
        <div className="tw"><table>
          <thead><tr><th>Rank</th><th>UCC</th><th>Client</th><th>Type</th><th>Opening balance</th><th>% of total float</th><th>Cum %</th><th>Trading activity</th><th>Float utilisation</th></tr></thead>
          <tbody>
            {float_top.map(r => (
              <tr key={r.ucc}>
                <td>{r.rank}</td><td>{r.ucc}</td><td><ClientLink ucc={r.ucc} name={r.name} /></td>
                <td><span className="badge b-ri">{r.client_type}</span></td>
                <td>{rupee(r.balance)}</td><td>{pct1(r.pct_of_total)}</td><td>{pct1(r.cum_pct)}</td>
                <td><span className={`badge ${r.traded_this_month ? 'b-act' : 'b-pend'}`}>{r.traded_this_month ? 'Active' : 'Low'}</span></td>
                <td>—</td>
              </tr>
            ))}
            {float_top.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--tx3)' }}>No ledger data.</td></tr>}
          </tbody>
        </table></div>
        <div className="alert a-i" style={{ marginTop: 10 }}>
          ℹ️ Clients with high float but low trading activity (Idle) are both a retention risk and a cross-sell opportunity — MTF, options advisory, or partner products can deploy their capital productively.
        </div>
      </div>
    </div>
  );
};

export default ConcentrationRisk;