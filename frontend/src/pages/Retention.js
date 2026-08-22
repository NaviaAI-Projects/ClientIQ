import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api';
import { InfoBtn, ViewToggle } from '../components/ui';

const spct = (c, p) => (p ? (((c - p) / p) * 100).toFixed(1) + '%' : '—');
const smom = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + n + '%');
const pctCell = (v) => (v == null ? '—' : v.toFixed(1) + '%');
const inr = (n) => { const v = Number(n) || 0; if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr'; if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + 'L'; return '₹' + Math.round(v).toLocaleString('en-IN'); };
// heat tint: red (0%) → green (100%)
const heat = (v) => {
  if (v == null) return {};
  const t = Math.max(0, Math.min(100, v)) / 100;
  const r = Math.round(216 + (47 - 216) * t);
  const g = Math.round(90 + (158 - 90) * t);
  const b = Math.round(90 + (111 - 90) * t);
  return { background: `rgba(${r},${g},${b},0.16)`, color: '#333', fontWeight: 600 };
};
const Pending = ({ h = 200, note }) => (
  <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 13, textAlign: 'center', padding: '0 20px' }}>
    {note || 'Pending — needs multi-month per-client activity history.'}
  </div>
);

const MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];   // #14: M0 = opening month

const Retention = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cohortSel, setCohortSel] = useState('blended');   // #14: Blended Cohorts selector

  useEffect(() => {
    api.get('/analytics/retention').then(r => setData(r.data)).catch(() => setError('Could not load retention.')).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="ph"><h2>Client retention &amp; cohort analysis</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Client retention &amp; cohort analysis</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, cards, monthly_active, cohorts, retention_curve = [], segment_trend } = data;
  const curve = (retention_curve || []).map(c => ({ label: c.label || `M${c.m}`, pct: c.pct }));
  const obs = (meta && meta.observed_months) || [];

  // #14: the Blended Cohorts curve can show the weighted blend or a single opening cohort
  const chartCurve = cohortSel === 'blended'
    ? curve
    : (() => {
        const c = (cohorts || []).find(x => x.cohort === cohortSel);
        if (!c || !c.ret) return [];
        return MONTHS.map(k => ({ label: `M${k}`, pct: c.ret[k] })).filter(p => p.pct != null);
      })();

  return (
    <div>
      <div className="ph">
        <h2>Client retention &amp; cohort analysis</h2>
        <p>Of clients who opened in month X — what % are still trading at 1, 3, 6, 12 months? Monthly active client trend and reactivation rates{meta && meta.as_of ? ` · As of ${meta.as_of}` : ''}</p>
      </div>

      <div className="cards">
        <div className="card ci"><div className="clbl">Monthly active clients</div><div className="cval">{cards.monthly_active.toLocaleString('en-IN')}</div><div className="csub">vs prior {cards.monthly_active_prev.toLocaleString('en-IN')} · {spct(cards.monthly_active, cards.monthly_active_prev)} · traded ≥1 day</div></div>
        <div className="card cs"><div className="clbl">30-day retention (new clients)</div><div className="cval">{cards.retention_30 == null ? '—' : cards.retention_30.toFixed(1) + '%'}</div><div className="csub">{cards.retention_30 == null ? 'needs the month after opening observed' : 'traded in the month after account opening (M1)'}</div></div>
        <div className="card cw"><div className="clbl">90-day retention</div><div className="cval">{cards.retention_90 == null ? '—' : cards.retention_90.toFixed(1) + '%'}</div><div className="csub">{cards.retention_90 == null ? 'needs 3rd month after opening observed' : 'still trading ~3 months after opening (M3)'}</div></div>
        <div className="card cd"><div className="clbl">Churn this month</div><div className="cval">{cards.churn == null ? '—' : cards.churn.toLocaleString('en-IN')}</div><div className="csub">{cards.churn == null ? 'needs the prior month observed' : 'Active prior month, not this month'}</div></div>
        <div className="card cp"><div className="clbl">Revenue / day — {cards.rd_prev_label || 'prev month'}</div><div className="cval">{cards.rd_prev_month == null ? '—' : inr(cards.rd_prev_month)}</div><div className="csub">{cards.rd_curr_label ? `${cards.rd_curr_label} so far: ${cards.rd_curr_month == null ? '—' : inr(cards.rd_curr_month)}/day` : 'avg brokerage + clearing per trading day'}</div></div>
      </div>

      <div className="panel">
        <div className="ptitle">📈 Monthly unique active clients — 12 month trend<InfoBtn text="Distinct clients who traded at least once in each calendar month, plotted over 12 months. Active = traded ≥1 time that month (not daily active)." /></div>
        <ViewToggle
          chart={
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthly_active} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} /><YAxis tick={{ fontSize: 10 }} />
            <Tooltip /><Line dataKey="active" stroke="#185fa5" strokeWidth={2} name="Monthly active clients" />
          </LineChart>
        </ResponsiveContainer>
          }
          table={
            <table>
              <thead><tr><th>Month</th><th>Monthly active clients</th></tr></thead>
              <tbody>
                {monthly_active.map(r => (
                  <tr key={r.month}><td>{r.month}</td><td>{r.active.toLocaleString('en-IN')}</td></tr>
                ))}
                {monthly_active.length === 0 && <tr><td colSpan={2} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
              </tbody>
            </table>
          }
        />
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Active = traded at least once in the calendar month. Distinct from daily active count.</p>
      </div>

      <div className="panel">
        <div className="ptitle">📊 Cohort retention heatmap — % still trading at N months after opening<InfoBtn text="Groups clients by account-opening month; each row shows the % of that cohort who traded 1…12 months later. A cell shows a number only for a month we actually hold trade files for; all other cells are unknown (—), never assumed 0%." /></div>
        <div className="tw"><table>
          <thead><tr><th>Opening cohort</th><th>Accounts opened</th>{MONTHS.map(k => <th key={k}>M{k} %</th>)}</tr></thead>
          <tbody>
            {cohorts.map(r => (
              <tr key={r.cohort}>
                <td>{r.cohort}</td>
                <td>{r.opened.toLocaleString('en-IN')}</td>
                {MONTHS.map(k => {
                  const v = r.ret ? r.ret[k] : null;
                  return <td key={k} style={heat(v)}>{pctCell(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table></div>
        <div className="alert a-i" style={{ marginTop: 10 }}>💡 Cohort sizes are live from account-open dates. A retention % appears wherever the target month has trade data{obs.length ? ` (observed: ${obs.join(', ')})` : ''}; the rest fill in as more monthly files are loaded.</div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span>📈 Retention curve — {cohortSel === 'blended' ? 'blended cohort' : `${cohortSel} cohort`}<InfoBtn text="Percentage of clients still active as months elapse since account opening. 'Blended' pools all cohorts weighted by accounts opened; pick a single opening month to see just that cohort's curve. M0 = opening month. Only elapsed months with trade data are plotted." /></span>
            <select style={{ width: 180, fontSize: 12 }} value={cohortSel} onChange={e => setCohortSel(e.target.value)}>
              <option value="blended">Blended (all cohorts)</option>
              {(cohorts || []).map(c => <option key={c.cohort} value={c.cohort}>{c.cohort} cohort</option>)}
            </select>
          </div>
          {chartCurve.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartCurve} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} />
                <Tooltip formatter={(v) => v + '%'} />
                <Line dataKey="pct" stroke="#185fa5" strokeWidth={2} name="Still active" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Pending note="Pending — needs at least one elapsed month with trade data after a cohort's opening." />
          )}
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>M0 = opening month. Blended across cohorts, weighted by accounts opened; only elapsed months with trade data are shown.</p>
        </div>
        <div className="panel">
          <div className="ptitle">🔄 Reactivation — dormant clients who returned<InfoBtn text="Dormant clients (no trade in the prior calendar month) who then traded again. Tracks RM reactivation effectiveness. Needs at least two consecutive observed months of trades." /></div>
          <Pending note="Pending — needs two consecutive months of trade data to detect a dormant client returning (only one month observed so far)." />
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Dormant = no trade in the prior calendar month, then traded again. Tracks RM reactivation effectiveness.</p>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📋 Monthly active client trend — by segment<InfoBtn text="Distinct active clients each month split by segment (Eq Options, Eq Cash, Comm F&O, Eq Futures), with total unique, month-over-month change, new activations and churned counts." /></div>
        <div className="tw"><table>
          <thead><tr><th>Month</th><th>Eq Options</th><th>Eq Cash</th><th>Comm F&amp;O</th><th>Eq Futures</th><th>Total unique</th><th>MoM change</th><th>New activations</th><th>Churned</th></tr></thead>
          <tbody>
            {segment_trend.map(r => (
              <tr key={r.month}>
                <td>{r.month}</td>
                <td>{r.eq_options.toLocaleString('en-IN')}</td>
                <td>{r.eq_cash.toLocaleString('en-IN')}</td>
                <td>{r.comm_fo.toLocaleString('en-IN')}</td>
                <td>{r.eq_fut.toLocaleString('en-IN')}</td>
                <td>{r.total.toLocaleString('en-IN')}</td>
                <td style={{ color: r.mom == null ? 'var(--tx2)' : r.mom >= 0 ? 'var(--sc)' : 'var(--dc)' }}>{smom(r.mom)}</td>
                <td>{r.new_act.toLocaleString('en-IN')}</td>
                <td>{r.churned.toLocaleString('en-IN')}</td>
              </tr>
            ))}
            {segment_trend.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--tx3)' }}>No trade data.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

export default Retention;