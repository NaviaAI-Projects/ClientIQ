import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api';

const fmt = v => { if (v == null) return '—'; const n = parseFloat(v) || 0; if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L'; if (n >= 1000) return '₹' + (n / 1000).toFixed(0) + 'K'; return n ? '₹' + n : '₹0'; };

const MyPerformance = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/rm-performance').then(r => setData(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="ph"><h2>My performance</h2><p>Loading…</p></div>;

  const months = (data && data.months) || [];
  const ytdRevenue = months.reduce((s, m) => s + (m.revenue || 0), 0);
  const totalConverted = months.reduce((s, m) => s + (m.converted || 0), 0);
  const totalLeads = months.reduce((s, m) => s + (m.leads_assigned || 0), 0);
  const totalInteractions = months.reduce((s, m) => s + (m.interactions || 0), 0);
  const convRate = totalLeads > 0 ? Math.round(totalConverted / totalLeads * 100) : null;

  return (
    <div>
      <div className="ph"><h2>My performance</h2><p>FY 2026-27 · Revenue, leads, interactions — live from your mapped clients</p></div>

      <div className="cards">
        <div className="card ci"><div className="clbl">YTD revenue</div><div className="cval">{fmt(ytdRevenue)}</div><div className="csub">Brokerage + MTF, last 6 months</div></div>
        <div className="card cs"><div className="clbl">Leads assigned</div><div className="cval">{totalLeads}</div><div className="csub">Across the period</div></div>
        <div className="card cw"><div className="clbl">Leads converted</div><div className="cval">{totalConverted}{totalLeads ? `/${totalLeads}` : ''}</div><div className="csub">{convRate == null ? '—' : convRate + '% conversion'}</div></div>
        <div className="card cp"><div className="clbl">Interactions</div><div className="cval">{totalInteractions}</div><div className="csub">Logged over the period</div></div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📊 Monthly revenue</div>
          {months.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={months} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} />
                <Tooltip formatter={fmt} />
                <Bar dataKey="revenue" name="Revenue" fill="#b5d4f4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>No revenue yet for your mapped clients.</div>}
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Monthly targets aren't tracked in the system, so no target line is shown.</p>
        </div>
        <div className="panel">
          <div className="ptitle">📈 Interactions per month</div>
          {months.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={months} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="interactions" name="Interactions" stroke="#185fa5" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>No interactions logged.</div>}
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📋 Month-wise summary</div>
        <div className="tw"><table>
          <thead><tr><th>Month</th><th>Revenue</th><th>Target</th><th>Leads assigned</th><th>Converted</th><th>Clients EOM</th><th>Interactions</th></tr></thead>
          <tbody>
            {months.length === 0 ? (
              <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: 'var(--tx3)' }}>No data.</td></tr>
            ) : months.map((r, i) => (
              <tr key={i}>
                <td>{r.month}</td>
                <td>{fmt(r.revenue)}</td>
                <td>{r.target == null ? '—' : fmt(r.target)}</td>
                <td>{r.leads_assigned}</td>
                <td>{r.converted}</td>
                <td>{r.clients_eom == null ? '—' : r.clients_eom}</td>
                <td>{r.interactions}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Target, Achieved % and Clients-EOM show "—" because targets and historical client-count snapshots aren't stored in the system yet.</p>
      </div>
    </div>
  );
};
export default MyPerformance;