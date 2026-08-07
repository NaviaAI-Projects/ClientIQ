import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api';

const fmt = v => { const n = parseFloat(v) || 0; if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L'; if (n >= 1000) return '₹' + (n / 1000).toFixed(0) + 'K'; return n ? '₹' + n : '—'; };

const RevenueTracker = () => {
  const [stats, setStats]    = useState(null);
  const [top, setTop]        = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Single RM-scoped source of truth: /dashboard/rm now returns real revenue, monthly series, top clients.
    api.get('/dashboard/rm')
      .then(r => { setStats(r.data); setTop(r.data.top_clients || []); })
      .catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="ph"><h2>Revenue tracker</h2><p>Loading…</p></div>;

  const monthly = (stats && stats.monthly) || [];

  return (
    <div>
      <div className="ph"><h2>Revenue tracker</h2><p>Brokerage + MTF interest attributed to your mapped clients{stats?.data_as_of ? ` · As of ${stats.data_as_of}` : ''}</p></div>

      <div className="cards">
        <div className="card ci"><div className="clbl">MTD revenue</div><div className="cval">{fmt(stats?.mtd_revenue)}</div><div className="csub">Brokerage + MTF, current month</div></div>
        <div className="card cs"><div className="clbl">YTD revenue</div><div className="cval">{fmt(stats?.ytd_revenue)}</div><div className="csub">FY to date</div></div>
        <div className="card cw"><div className="clbl">Brokerage share</div><div className="cval">{stats?.brokerage_share == null ? '—' : stats.brokerage_share + '%'}</div><div className="csub">Brokerage ÷ (Brokerage + MTF)</div></div>
        <div className="card cp"><div className="clbl">Clients generating revenue</div><div className="cval">{(stats?.revenue_clients ?? 0)}/{(stats?.my_clients ?? 0)}</div><div className="csub">Mapped clients with revenue this month</div></div>
      </div>

      <div className="panel">
        <div className="ptitle">📊 Monthly revenue by stream (last 6 months)</div>
        {monthly.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmt(v)} />
              <Tooltip formatter={v => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
              <Bar dataKey="Brokerage" stackId="s" fill="#b5d4f4" />
              <Bar dataKey="MTF" stackId="s" fill="#9FE1CB" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>No revenue yet for your mapped clients.</div>}
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Only real streams are shown: brokerage (daily_trades) and MTF interest (mtf_monthly). Commission/remittance/partner streams are not tracked in the system.</p>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📋 Monthly stream breakdown</div>
          <div className="tw"><table>
            <thead><tr><th>Month</th><th>Brokerage</th><th>MTF interest</th><th>Total</th></tr></thead>
            <tbody>
              {monthly.length === 0 ? (
                <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: 'var(--tx3)' }}>No data.</td></tr>
              ) : monthly.map((r, i) => (
                <tr key={i}><td>{r.month}</td><td>{fmt(r.Brokerage)}</td><td>{fmt(r.MTF)}</td><td style={{ fontWeight: 500 }}>{fmt(r.Brokerage + r.MTF)}</td></tr>
              ))}
            </tbody>
          </table></div>
        </div>
        <div className="panel">
          <div className="ptitle">👥 Top 5 clients MTD (by brokerage)</div>
          <div className="tw"><table>
            <thead><tr><th>Client</th><th>MTD revenue</th></tr></thead>
            <tbody>
              {top.length === 0 ? (
                <tr><td colSpan="2" style={{ padding: '20px', textAlign: 'center', color: 'var(--tx3)' }}>No revenue-generating clients this month.</td></tr>
              ) : top.map((c, i) => (
                <tr key={i}>
                  <td><span className="lc" onClick={() => navigate('/client-360', { state: { ucc: c.ucc } })}>{c.name}</span></td>
                  <td>{fmt(c.mtd_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
};
export default RevenueTracker;