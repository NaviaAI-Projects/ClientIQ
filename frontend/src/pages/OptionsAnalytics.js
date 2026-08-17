import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, Cell,
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
const spct = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + Number(n).toFixed(1) + '%');
const spct0 = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + Math.round(Number(n)) + '%');
const colorOf = (n) => (n == null ? 'var(--tx2)' : n >= 0 ? 'var(--sc)' : 'var(--dc)');

// red dot on expiry days
const ExpiryDot = (props) => {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  return payload.is_expiry
    ? <circle cx={cx} cy={cy} r={4} fill="#e24b4a" stroke="#fff" strokeWidth={1} />
    : <circle cx={cx} cy={cy} r={2.5} fill="#185fa5" />;
};

const OptionsAnalytics = () => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [range, setRange]     = useState({ key: 'month' });

  useEffect(() => {
    if (range.key === 'custom' && !(range.from && range.to)) return;
    setLoading(true);
    api.get('/analytics/options', { params: rangeParams(range) })
      .then(res => setData(res.data))
      .catch(() => setError('Could not load options analytics.'))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading && !data) return <div className="ph"><h2>Options analytics</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Options analytics</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, kpis, daily, monthly, expiry_analysis, top_clients } = data;
  const lm = meta.latest_month || '';
  const pm = meta.prior_month || '';

  return (
    <div>
      <div className="ph">
        <h2>Options analytics</h2>
        <p>Equity &amp; Commodity options — Navia's primary revenue driver (40% of revenue) · Premium turnover, expiry patterns, client behaviour{meta.as_of ? ` · As of ${meta.as_of}` : ''}</p>
      </div>

      <DateRange value={range} onChange={setRange} bounds={meta && meta.range ? { min: meta.range.data_min, max: meta.range.data_max } : undefined} active={meta && meta.range} />
      {loading && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>Updating…</div>}

      <div className="cards">
        <div className="card ci">
          <div className="clbl">Avg daily Eq Opt TO ({lm})</div>
          <div className="cval">₹{kpis.eq_opt_avg_daily_cr}Cr</div>
          <div className="csub">vs {pm} avg ₹{kpis.eq_opt_prev_cr}Cr · {spct(kpis.eq_opt_mom_pct)}</div>
        </div>
        <div className="card cs">
          <div className="clbl">Options clients (Eq, {lm} avg)</div>
          <div className="cval">{kpis.eq_opt_clients_avg.toLocaleString('en-IN')}/day</div>
          <div className="csub">{pm} avg {kpis.eq_opt_clients_prev.toLocaleString('en-IN')} · {spct(kpis.eq_opt_clients_mom_pct)}</div>
        </div>
        <div className="card cw">
          <div className="clbl">Expiry-day TO premium</div>
          <div className="cval">{spct0(kpis.expiry_premium_pct)}</div>
          <div className="csub">vs non-expiry avg</div>
        </div>
        <div className="card cp">
          <div className="clbl">Comm Options avg ({lm})</div>
          <div className="cval">₹{kpis.comm_opt_avg_daily_cr}Cr/day</div>
          <div className="csub">vs {pm} ₹{kpis.comm_opt_prev_cr}Cr · {spct(kpis.comm_opt_mom_pct)}</div>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📈 Equity options daily premium TO — expiry days marked (₹Cr)<InfoBtn text="Daily equity-options premium turnover (SUM of traded_value for NFO/BFO OPTIDX+OPTSTK), in ₹ crore. Dashed line = month-to-date average. Red dots mark expiry days." /></div>
        <ViewToggle
          chart={
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={daily} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v + 'Cr'} />
                <Tooltip formatter={v => '₹' + v + 'Cr'} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                <Line dataKey="eq_opt_to_cr" stroke="#185fa5" strokeWidth={2} dot={<ExpiryDot />} name="Eq Options TO (₹Cr)" />
                <Line dataKey="mtd_avg_cr" stroke="#9aa7bd" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="MTD avg" />
              </LineChart>
            </ResponsiveContainer>
          }
          table={
            <table>
              <thead><tr><th>Date</th><th>Eq Opt TO (₹Cr)</th><th>MTD avg (₹Cr)</th><th>Expiry</th></tr></thead>
              <tbody>
                {daily.map((r, i) => (
                  <tr key={i}><td>{r.date}</td><td>{r.eq_opt_to_cr}</td><td>{r.mtd_avg_cr}</td><td>{r.is_expiry ? '● Expiry' : '—'}</td></tr>
                ))}
                {daily.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--tx3)' }}>No options data.</td></tr>}
              </tbody>
            </table>
          }
        />
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Red markers = expiry days (Tue/Thu). Volume spike on expiry days is consistently 25–30% above non-expiry average.</p>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">👥 Options client count — expiry vs non-expiry days<InfoBtn text="Distinct equity-options clients trading each day (COUNT DISTINCT ucc). Red bars = expiry days, which typically draw more participants." /></div>
          <ViewToggle
            chart={
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={daily} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="clients" name="Options clients" radius={[4, 4, 0, 0]}>
                    {daily.map((d, i) => <Cell key={i} fill={d.is_expiry ? '#e24b4a' : '#185fa5'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>Date</th><th>Options clients</th><th>Expiry</th></tr></thead>
                <tbody>
                  {daily.map((r, i) => (
                    <tr key={i}><td>{r.date}</td><td>{Number(r.clients).toLocaleString('en-IN')}</td><td>{r.is_expiry ? '● Expiry' : '—'}</td></tr>
                  ))}
                  {daily.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--tx3)' }}>No options data.</td></tr>}
                </tbody>
              </table>
            }
          />
        </div>
        <div className="panel">
          <div className="ptitle">📈 Month-on-month options volume trend (₹Cr avg/day)<InfoBtn text="Average daily premium turnover per month (month total ÷ trading days), in ₹ crore, for Equity options (blue) and Commodity options (orange)." /></div>
          <ViewToggle
            chart={
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthly} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v + 'Cr'} />
                  <Tooltip formatter={v => '₹' + v + 'Cr'} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                  <Line dataKey="eq_opt_to_cr" stroke="#185fa5" strokeWidth={2} name="Eq Opt avg/day (₹Cr)" />
                  <Line dataKey="comm_opt_to_cr" stroke="#e0803a" strokeWidth={2} name="Comm Opt avg/day (₹Cr)" />
                </LineChart>
              </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>Month</th><th>Eq Opt (₹Cr/d)</th><th>Comm Opt (₹Cr/d)</th></tr></thead>
                <tbody>
                  {monthly.map(r => (
                    <tr key={r.month}><td>{r.month}</td><td>{r.eq_opt_to_cr}</td><td>{r.comm_opt_to_cr}</td></tr>
                  ))}
                  {monthly.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--tx3)' }}>No options data.</td></tr>}
                </tbody>
              </table>
            }
          />
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📋 Options business — monthly comparison<InfoBtn text="Per-month options business: avg daily premium turnover (₹Cr), avg daily client count, and MoM change in Eq-options turnover. Clearing-fee columns fill in once brokerage/clearing data is imported." /></div>
        <div className="tw"><table>
          <thead><tr>
            <th>Month</th><th>Eq Opt TO (₹Cr/d)</th><th>Eq Opt clients</th><th>Eq Opt clearing (₹/d)</th>
            <th>Comm Opt TO</th><th>Comm Opt clients</th><th>Comm clearing (₹/d)</th><th>Total options rev (₹/d)</th><th>MoM change</th>
          </tr></thead>
          <tbody>
            {monthly.slice().reverse().map((m) => (
              <tr key={m.month}>
                <td>{m.month}</td>
                <td>{m.eq_opt_to_cr}</td>
                <td>{m.eq_opt_clients.toLocaleString('en-IN')}</td>
                <td>₹{(m.eq_opt_clearing || 0).toLocaleString('en-IN')}</td>
                <td>{m.comm_opt_to_cr}</td>
                <td>{m.comm_opt_clients.toLocaleString('en-IN')}</td>
                <td>₹{(m.comm_opt_clearing || 0).toLocaleString('en-IN')}</td>
                <td>₹{(m.total_options_rev || 0).toLocaleString('en-IN')}</td>
                <td style={{ color: colorOf(m.mom_pct) }}>{spct(m.mom_pct)}</td>
              </tr>
            ))}
            {monthly.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--tx3)' }}>No options data.</td></tr>}
          </tbody>
        </table></div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Clearing columns = options turnover × the configured options commission rate ÷ 100 (Admin → Commission Rates). Total options rev = Eq + Comm clearing per day.</p>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📅 Expiry day analysis — {lm}<InfoBtn text="Each expiry day's premium turnover and client count vs the month-to-date average. Expiries fall on Tuesday (NSE) and Thursday (BSE)." /></div>
          <div className="alert a-i" style={{ marginBottom: 10 }}>ℹ️ Weekly expiries: Tuesday (NSE) &amp; Thursday (BSE).</div>
          <div className="tw"><table>
            <thead><tr><th>Expiry date</th><th>Eq Opt TO (₹Cr)</th><th>vs MTD avg</th><th>Clients</th><th>vs MTD avg</th></tr></thead>
            <tbody>
              {expiry_analysis.map((e, i) => (
                <tr key={i}>
                  <td>{e.date}</td>
                  <td>{e.eq_opt_to_cr}</td>
                  <td style={{ color: colorOf(e.vs_mtd_pct) }}>{spct0(e.vs_mtd_pct)}</td>
                  <td>{e.clients.toLocaleString('en-IN')}</td>
                  <td style={{ color: colorOf(e.clients_vs_mtd_pct) }}>{spct0(e.clients_vs_mtd_pct)}</td>
                </tr>
              ))}
              {expiry_analysis.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--tx3)' }}>No expiry days in range.</td></tr>}
            </tbody>
          </table></div>
        </div>
        <div className="panel">
          <div className="ptitle">⭐ Top 10 options clients by premium TO (MTD)<InfoBtn text="Highest equity-options premium turnover this month (sum of traded_value per client, current month). Lots = number of contracts (traded quantity ÷ board lot). Unmapped high-TO clients are flagged as priority leads." /></div>
          <div className="tw"><table>
            <thead><tr><th>UCC</th><th>Client</th><th>Type</th><th>Eq Opt TO</th><th>Lots</th><th>RM</th></tr></thead>
            <tbody>
              {top_clients.map(r => (
                <tr key={r.ucc}>
                  <td>{r.ucc}</td><td><ClientLink ucc={r.ucc} name={r.name} /></td>
                  <td><span className="badge b-ri">{r.client_type}</span></td>
                  <td>{rupee(r.eq_opt_to)}</td>
                  <td>{Math.round(r.lots).toLocaleString('en-IN')}</td>
                  <td>{r.rm_name}</td>
                </tr>
              ))}
              {top_clients.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--tx3)' }}>No options data.</td></tr>}
            </tbody>
          </table></div>
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 8 }}>Unmapped high-TO clients flagged as priority leads in AI scoring. "Lots" = number of contracts (traded quantity ÷ board lot).</p>
        </div>
      </div>
    </div>
  );
};

export default OptionsAnalytics;