import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api';
import { InfoBtn, NotesBtn, ViewToggle, DateRange, rangeParams } from '../components/ui';

const rupee = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + 'L';
  return '₹' + Math.round(v).toLocaleString('en-IN');
};
const BAR_COLORS = ['#185fa5', '#e0803a', '#9FE1CB', '#AFA9EC', '#FAC775'];

const RMPerformance = () => {
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState({ key: 'month' });

  useEffect(() => {
    if (range.key === 'custom' && !(range.from && range.to)) return; // wait for both custom dates
    setLoading(true);
    api.get('/analytics/rm-performance', { params: rangeParams(range) })
      .then(res => setData(res.data))
      .catch(() => setError('Could not load RM performance.'))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading && !data) return <div className="ph"><h2>RM performance</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>RM performance</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, cards, rm_names, chart, rows } = data;
  const rangeLbl = meta && meta.range && meta.range.from ? `${meta.range.from} – ${meta.range.to}` : 'selected range';

  return (
    <div>
      <div className="ph">
        <h2>RM performance</h2>
        <p>Cross-RM analysis — revenue, lead conversion, client growth, activity{meta && meta.as_of ? ` · As of ${meta.as_of}` : ''}</p>
      </div>

      <DateRange value={range} onChange={setRange} bounds={meta && meta.range ? { min: meta.range.data_min, max: meta.range.data_max } : undefined} active={meta && meta.range} />
      {loading && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>Updating…</div>}

      <div className="cards">
        <div className="card cs"><div className="clbl">Best performing</div><div className="cval">{cards.best_rm}</div><div className="csub">{rupee(cards.best_turnover)} turnover · {rangeLbl}</div></div>
        <div className="card cw"><div className="clbl">Needs attention</div><div className="cval">{cards.worst_rm}</div><div className="csub">{rupee(cards.worst_turnover)} turnover · {rangeLbl}</div></div>
        <div className="card ci"><div className="clbl">Team revenue</div><div className="cval">{rupee(cards.team_rev)}</div><div className="csub">Brokerage-based · {rangeLbl}</div></div>
        <div className="card cp"><div className="clbl">Leads converted</div><div className="cval">{cards.team_converted}</div><div className="csub">Cumulative (all-time)</div></div>
      </div>

      <div className="panel">
        <div className="ptitle">📊 RM revenue comparison (5 months)
          <InfoBtn text="Monthly client turnover per RM over the last few months, as an activity proxy for revenue. Amounts auto-scale (₹ / L / Cr). Independent of the date-range filter above." />
          <NotesBtn text={"Bars show each RM's total client turnover per calendar month (₹ crore), not brokerage — brokerage revenue is thin until the brokerage file is imported.\n\nThis 5-month trend is fixed and does NOT change with the date-range filter; the filter drives the KPI cards and the detailed table below.\n\nTurnover = EQ cash + EQ F&O + commodity F&O + options premium, summed across the RM's mapped clients."} /></div>
        <ViewToggle
          chart={
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={rupee} />
            <Tooltip formatter={v => rupee(v)} /><Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
            {rm_names.map((rm, i) => <Bar key={rm} dataKey={rm} fill={BAR_COLORS[i % BAR_COLORS.length]} radius={[3, 3, 0, 0]} />)}
          </BarChart>
        </ResponsiveContainer>
          }
          table={
            <table>
              <thead><tr><th>Month</th>{rm_names.map(rm => <th key={rm}>{rm} turnover</th>)}</tr></thead>
              <tbody>
                {chart.map(row => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    {rm_names.map(rm => <td key={rm}>{row[rm] != null ? rupee(row[rm]) : '—'}</td>)}
                  </tr>
                ))}
                {chart.length === 0 && <tr><td colSpan={rm_names.length + 1} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
              </tbody>
            </table>
          }
        />
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Revenue is brokerage-based (thin until imported); chart shows client turnover per RM as the activity proxy.</p>
      </div>

      <div className="panel">
        <div className="ptitle">📋 Detailed comparison
          <InfoBtn text="Per-RM breakdown. The 'Rev (range)' column reflects the date-range filter above; 'YTD Rev' is fiscal-year-to-date and is not affected by the filter." />
          <NotesBtn text={"Rev (range) = brokerage earned by each RM's mapped clients over the selected date range (default: current month).\n\nYTD Rev = brokerage since 1 April of the current financial year — always fiscal-YTD, independent of the range filter.\n\nConv% = converted ÷ leads. Target% shows '—' until per-RM revenue targets are configured. Churn alerts = mapped clients with an AI churn-risk score ≥ 60."} /></div>
        <div className="tw"><table>
          <thead><tr><th>RM</th><th>Clients</th><th>Rev (range)</th><th>Target%</th><th>YTD Rev</th><th>Leads</th><th>Converted</th><th>Conv%</th><th>Interactions</th><th>Churn alerts</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.rm_name}>
                <td>{r.rm_name}</td>
                <td>{r.clients}</td>
                <td>{r.mtd_rev > 0 ? rupee(r.mtd_rev) : '—'}</td>
                <td>—</td>
                <td>{r.ytd_rev > 0 ? rupee(r.ytd_rev) : '—'}</td>
                <td>{r.leads}</td>
                <td>{r.converted}</td>
                <td>{Math.round(r.conv_pct)}%</td>
                <td>{r.interactions}</td>
                <td>{r.churn_alerts}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} style={{ color: 'var(--tx3)' }}>No RMs.</td></tr>}
          </tbody>
        </table></div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Target% shows "—" until per-RM revenue targets are configured. Revenue columns are brokerage-based.</p>
      </div>
    </div>
  );
};

export default RMPerformance;