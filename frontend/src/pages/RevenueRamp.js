import React, { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api';
import { InfoBtn } from '../components/ui';

const rupee = (n) => {
  if (n == null) return '—';
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + 'L';
  return '₹' + Math.round(v).toLocaleString('en-IN');
};
const Pending = ({ h = 200 }) => (
  <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 13, textAlign: 'center', padding: '0 20px' }}>
    Pending — needs more post-opening months of brokerage history to compute this elapsed month.
  </div>
);

const RevenueRamp = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/analytics/revenue-ramp').then(r => setData(r.data)).catch(() => setError('Could not load revenue ramp.')).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="ph"><h2>Client revenue ramp</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Client revenue ramp</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, cards, cohorts, ramp_curve = [], opt_activation_by_cohort = [] } = data;
  const pct = v => v == null ? '—' : v + '%';

  return (
    <div>
      <div className="ph">
        <h2>Client revenue ramp</h2>
        <p>How quickly do new clients generate revenue? Average monthly contribution at M1, M3, M6, M12 by opening cohort{meta && meta.as_of ? ` · As of ${meta.as_of}` : ''}</p>
      </div>

      <div className="cards">
        <div className="card ci"><div className="clbl">Avg M1 revenue/new client</div><div className="cval">{rupee(cards.m1)}</div><div className="csub">Month 1 after account opening</div></div>
        <div className="card cs"><div className="clbl">Avg M3 revenue/new client</div><div className="cval">{rupee(cards.m3)}</div><div className="csub">Month 3</div></div>
        <div className="card cw"><div className="clbl">Avg M6 revenue/new client</div><div className="cval">{rupee(cards.m6)}</div><div className="csub">Month 6 — ramp stabilises</div></div>
        <div className="card cp"><div className="clbl">Options activation by M2</div><div className="cval">{pct(cards.opt_activation)}</div><div className="csub">New clients who trade options within 60d</div></div>
      </div>

      <div className="panel">
        <div className="ptitle">📈 Revenue ramp curve — avg monthly revenue per client from opening month<InfoBtn text="Average revenue (brokerage + MTF interest) per client each elapsed month from their account-opening month onward, blended across cohorts. Only elapsed months with loaded trade history are plotted." /></div>
        {ramp_curve.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={ramp_curve} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="m" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={rupee} />
              <Tooltip formatter={(v) => rupee(v)} /><Line dataKey="rev" stroke="#185fa5" strokeWidth={2} name="Avg revenue/client" dot />
            </LineChart>
          </ResponsiveContainer>
        ) : <Pending />}
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Revenue = brokerage + MTF interest. M0 = opening month; blended across cohorts, weighted by clients opened. Only elapsed months with trade data are shown.</p>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📊 Options activation rate by cohort — % who trade options within 60 days<InfoBtn text="Share of each opening-month cohort that places its first options trade within 60 days of account opening." /></div>
          {opt_activation_by_cohort.some(r => r.pct != null) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={opt_activation_by_cohort} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="cohort" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} unit="%" />
                <Tooltip formatter={(v) => v + '%'} /><Bar dataKey="pct" fill="#185fa5" name="Options activation %" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Pending />}
        </div>
        <div className="panel">
          <div className="ptitle">📊 Avg revenue at M6 — options vs non-options activated clients<InfoBtn text="Compares average month-6 revenue per client between those who activated options trading and those who did not. Needs 6+ months of post-opening history." /></div>
          <Pending />
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Needs 6+ post-opening months; only ~4 months of trade history loaded today.</p>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📋 Cohort revenue ramp — by opening month (₹ avg/client/month)<InfoBtn text="Average revenue per client per month at M1–M12 for each opening-month cohort, with cohort size and options-activation %. Cells fill where the elapsed month falls inside loaded trade history." /></div>
        <div className="tw"><table>
          <thead><tr><th>Opening cohort</th><th>Clients</th><th>M1 avg rev</th><th>M2 avg rev</th><th>M3 avg rev</th><th>M6 avg rev</th><th>M12 avg rev</th><th>Options activation %</th></tr></thead>
          <tbody>
            {cohorts.map(r => (
              <tr key={r.cohort}>
                <td>{r.cohort}</td>
                <td>{r.clients.toLocaleString('en-IN')}</td>
                <td>{rupee(r.m1)}</td><td>{rupee(r.m2)}</td><td>{rupee(r.m3)}</td>
                <td>{rupee(r.m6)}</td><td>{rupee(r.m12)}</td>
                <td>{pct(r.opt_activation)}</td>
              </tr>
            ))}
            {cohorts.length === 0 && <tr><td colSpan={8} style={{ color: 'var(--tx3)' }}>No cohorts.</td></tr>}
          </tbody>
        </table></div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Revenue = brokerage + MTF interest per client. Cells blank where the elapsed month is beyond loaded trade history (never shown as a fake ₹0).</p>
      </div>
    </div>
  );
};

export default RevenueRamp;