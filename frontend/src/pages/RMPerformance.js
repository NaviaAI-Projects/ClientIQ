import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api';

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

  useEffect(() => {
    api.get('/analytics/rm-performance')
      .then(res => setData(res.data))
      .catch(() => setError('Could not load RM performance.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="ph"><h2>RM performance</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>RM performance</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { cards, rm_names, chart, rows } = data;

  return (
    <div>
      <div className="ph">
        <h2>RM performance</h2>
        <p>Cross-RM analysis — revenue, lead conversion, client growth, activity</p>
      </div>

      <div className="cards">
        <div className="card cs"><div className="clbl">Best performing MTD</div><div className="cval">{cards.best_rm}</div><div className="csub">{rupee(cards.best_turnover)} turnover</div></div>
        <div className="card cw"><div className="clbl">Needs attention</div><div className="cval">{cards.worst_rm}</div><div className="csub">{rupee(cards.worst_turnover)} turnover</div></div>
        <div className="card ci"><div className="clbl">Team MTD revenue</div><div className="cval">{rupee(cards.team_rev)}</div><div className="csub">Brokerage-based</div></div>
        <div className="card cp"><div className="clbl">Leads converted MTD</div><div className="cval">{cards.team_converted}</div></div>
      </div>

      <div className="panel">
        <div className="ptitle">📊 RM revenue comparison (5 months)</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v + 'Cr'} />
            <Tooltip formatter={v => '₹' + v + 'Cr'} /><Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
            {rm_names.map((rm, i) => <Bar key={rm} dataKey={rm} fill={BAR_COLORS[i % BAR_COLORS.length]} radius={[3, 3, 0, 0]} />)}
          </BarChart>
        </ResponsiveContainer>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Revenue is brokerage-based (thin until imported); chart shows client turnover per RM as the activity proxy.</p>
      </div>

      <div className="panel">
        <div className="ptitle">📋 Detailed comparison</div>
        <div className="tw"><table>
          <thead><tr><th>RM</th><th>Clients</th><th>MTD Rev</th><th>Target%</th><th>YTD Rev</th><th>Leads</th><th>Converted</th><th>Conv%</th><th>Interactions</th><th>Churn alerts</th></tr></thead>
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