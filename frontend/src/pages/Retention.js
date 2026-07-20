import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api';
import { InfoBtn, ViewToggle } from '../components/ui';

const spct = (c, p) => (p ? (((c - p) / p) * 100).toFixed(1) + '%' : '—');
const smom = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + n + '%');
const Pending = ({ h = 200 }) => (
  <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 13, textAlign: 'center', padding: '0 20px' }}>
    Pending — needs multi-month per-client activity history (only ~2–3 months of trades available).
  </div>
);

const Retention = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/analytics/retention').then(r => setData(r.data)).catch(() => setError('Could not load retention.')).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="ph"><h2>Client retention &amp; cohort analysis</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Client retention &amp; cohort analysis</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, cards, monthly_active, cohorts, segment_trend } = data;

  return (
    <div>
      <div className="ph">
        <h2>Client retention &amp; cohort analysis</h2>
        <p>Of clients who opened in month X — what % are still trading at 1, 3, 6, 12 months? Monthly active client trend and reactivation rates{meta && meta.as_of ? ` · As of ${meta.as_of}` : ''}</p>
      </div>

      <div className="cards">
        <div className="card ci"><div className="clbl">Monthly active clients</div><div className="cval">{cards.monthly_active.toLocaleString('en-IN')}</div><div className="csub">vs prior {cards.monthly_active_prev.toLocaleString('en-IN')} · {spct(cards.monthly_active, cards.monthly_active_prev)} · traded ≥1 day</div></div>
        <div className="card cs"><div className="clbl">30-day retention (new clients)</div><div className="cval">—</div><div className="csub">needs post-opening activity history</div></div>
        <div className="card cw"><div className="clbl">90-day retention</div><div className="cval">—</div><div className="csub">needs post-opening activity history</div></div>
        <div className="card cd"><div className="clbl">Churn this month</div><div className="cval">{cards.churn == null ? '—' : cards.churn.toLocaleString('en-IN')}</div><div className="csub">Active prior month, not this month</div></div>
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
        <div className="ptitle">📊 Cohort retention heatmap — % still trading at N months after opening<InfoBtn text="Groups clients by account-opening month; each row shows the % still trading 1, 3, 6, 9, 12 months later. Cohort sizes are live; retention % fills in as trade history accumulates." /></div>
        <div className="tw"><table>
          <thead><tr><th>Opening cohort</th><th>Accounts opened</th><th>M1 active %</th><th>M3 active %</th><th>M6 active %</th><th>M9 active %</th><th>M12 active %</th></tr></thead>
          <tbody>
            {cohorts.map(r => (
              <tr key={r.cohort}><td>{r.cohort}</td><td>{r.opened.toLocaleString('en-IN')}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
            ))}
          </tbody>
        </table></div>
        <div className="alert a-i" style={{ marginTop: 10 }}>💡 Cohort sizes are live from account-open dates; the retention % columns fill in as post-opening trade history accumulates (only ~2–3 months available today).</div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📈 Retention curve — cohort<InfoBtn text="Percentage of a cohort still active as months elapse since account opening. Pending: needs multi-month per-client activity history." /></div>
          <Pending />
        </div>
        <div className="panel">
          <div className="ptitle">🔄 Reactivation — dormant clients who returned<InfoBtn text="Dormant clients (no trade for 60+ days) who then traded again. Tracks RM reactivation effectiveness. Pending: needs longer activity history." /></div>
          <Pending />
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Dormant = no trade for 60+ days then traded again. Tracks RM reactivation effectiveness.</p>
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