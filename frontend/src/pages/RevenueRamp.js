import React, { useEffect, useState } from 'react';
import api from '../api';
import { InfoBtn, ViewToggle } from '../components/ui';

const Pending = ({ h = 200 }) => (
  <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 13, textAlign: 'center', padding: '0 20px' }}>
    Pending — needs per-client revenue (brokerage) and multi-month post-opening history.
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

  const { meta, cards, cohorts } = data;

  return (
    <div>
      <div className="ph">
        <h2>Client revenue ramp</h2>
        <p>How quickly do new clients generate revenue? Average monthly contribution at M1, M3, M6, M12 by opening cohort{meta && meta.as_of ? ` · As of ${meta.as_of}` : ''}</p>
      </div>

      <div className="cards">
        <div className="card ci"><div className="clbl">Avg M1 revenue/new client</div><div className="cval">—</div><div className="csub">Month 1 after account opening</div></div>
        <div className="card cs"><div className="clbl">Avg M3 revenue/new client</div><div className="cval">—</div><div className="csub">Month 3</div></div>
        <div className="card cw"><div className="clbl">Avg M6 revenue/new client</div><div className="cval">—</div><div className="csub">Month 6 — ramp stabilises</div></div>
        <div className="card cp"><div className="clbl">Options activation by M2</div><div className="cval">—</div><div className="csub">New clients who trade options within 60d</div></div>
      </div>

      <div className="panel">
        <div className="ptitle">📈 Revenue ramp curve — avg monthly revenue per client from opening month<InfoBtn text="Average revenue per client each month from their account-opening month onward, showing how fast new clients ramp; typically peaks around M4–M5 then stabilises." /></div>
        <Pending />
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Revenue per client typically peaks around M4–M5 then stabilises. M1–M3 is the critical window where RM contact drives the steepest gains.</p>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📊 Options activation rate by cohort — % who trade options within 60 days<InfoBtn text="Share of each opening-month cohort that places its first options trade within 60 days of account opening." /></div>
          <Pending />
        </div>
        <div className="panel">
          <div className="ptitle">📊 Avg revenue at M6 — options vs non-options activated clients<InfoBtn text="Compares average month-6 revenue per client between those who activated options trading and those who did not." /></div>
          <Pending />
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📋 Cohort revenue ramp — by opening month (₹ avg/client/month)<InfoBtn text="Average revenue per client per month at M1–M12 for each opening-month cohort, with cohort size and options-activation %. Cohort sizes are live; ramp fills once brokerage revenue imports." /></div>
        <div className="tw"><table>
          <thead><tr><th>Opening cohort</th><th>Clients</th><th>M1 avg rev</th><th>M2 avg rev</th><th>M3 avg rev</th><th>M6 avg rev</th><th>M12 avg rev</th><th>Options activation %</th><th>M6 revenue index</th></tr></thead>
          <tbody>
            {cohorts.map(r => (
              <tr key={r.cohort}><td>{r.cohort}</td><td>{r.clients.toLocaleString('en-IN')}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
            ))}
          </tbody>
        </table></div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Cohort sizes are live from account-open dates; ramp figures populate once brokerage revenue is imported and post-opening history builds up.</p>
      </div>
    </div>
  );
};

export default RevenueRamp;
