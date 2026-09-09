import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api';

const fmt = v => { const n = parseFloat(v) || 0; if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L'; if (n >= 1000) return '₹' + (n / 1000).toFixed(0) + 'K'; return n ? '₹' + n : '—'; };
const prettyDate = d => { if (!d) return ''; const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };

const RevenueTracker = () => {
  const [stats, setStats]    = useState(null);
  const [top, setTop]        = useState([]);
  const [loading, setLoading] = useState(true);

  // Custom date-range filter
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');
  const [range, setRange] = useState(null);      // fetched range result, or null for default view
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeErr, setRangeErr] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    // Single RM-scoped source of truth: /dashboard/rm returns real revenue, monthly series, top clients.
    api.get('/dashboard/rm')
      .then(r => { setStats(r.data); setTop(r.data.top_clients || []); })
      .catch(console.error).finally(() => setLoading(false));
  }, []);

  const applyRange = async () => {
    setRangeErr('');
    if (!from || !to) { setRangeErr('Pick both a From and To date.'); return; }
    if (from > to)    { setRangeErr('From date must be on or before To date.'); return; }
    setRangeLoading(true);
    try {
      const r = await api.get('/dashboard/rm/revenue-range', { params: { from, to } });
      setRange(r.data);
    } catch (err) {
      setRangeErr(err.response?.data?.message || 'Could not load revenue for that range.');
    } finally {
      setRangeLoading(false);
    }
  };

  const clearRange = () => { setRange(null); setRangeErr(''); setFrom(''); setTo(''); };

  if (loading) return <div className="ph"><h2>Revenue tracker</h2><p>Loading…</p></div>;

  // When a range is applied, the panels below read from it; otherwise the default /dashboard/rm view.
  const monthly = range ? (range.monthly || []) : ((stats && stats.monthly) || []);
  const topList = range ? (range.top_clients || []) : top;

  const field = { padding: '7px 10px', border: '1px solid #ccd3df', borderRadius: '6px', fontSize: '13px', color: '#111', outline: 'none' };
  const btn = (bg, fg, bd) => ({ padding: '7px 16px', background: bg, color: fg, border: `1px solid ${bd || bg}`, borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' });

  return (
    <div>
      <div className="ph"><h2>Revenue tracker</h2><p>Brokerage + MTF interest attributed to your mapped clients{stats?.data_as_of ? ` · As of ${stats.data_as_of}` : ''}</p></div>

      {/* ── Custom date-range filter ─────────────────────────────── */}
      <div className="panel" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#667085', marginBottom: 4 }}>From</label>
            <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} style={field} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#667085', marginBottom: 4 }}>To</label>
            <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} style={field} />
          </div>
          <button onClick={applyRange} disabled={rangeLoading} style={btn(rangeLoading ? '#94a3b8' : '#223872', '#fff')}>
            {rangeLoading ? 'Loading…' : 'Apply range'}
          </button>
          {range && <button onClick={clearRange} style={btn('#fff', '#c0392b', '#f1a1a1')}>Clear</button>}
          {range && (
            <span style={{ fontSize: 12, color: '#667085', marginLeft: 4 }}>
              Showing <strong style={{ color: '#344054' }}>{prettyDate(range.from)} → {prettyDate(range.to)}</strong>
            </span>
          )}
        </div>
        {rangeErr && <div style={{ marginTop: 10, fontSize: 12, color: '#DC2626', fontWeight: 600 }}>{rangeErr}</div>}
        {range && <div style={{ marginTop: 8, fontSize: 11, color: '#98a2b3' }}>Brokerage is exact to the day; MTF interest is monthly, so it includes any month the range touches.</div>}
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────── */}
      {range ? (
        <div className="cards">
          <div className="card ci"><div className="clbl">Range revenue</div><div className="cval">{fmt(range.total)}</div><div className="csub">Brokerage + MTF in selected range</div></div>
          <div className="card cs"><div className="clbl">Brokerage</div><div className="cval">{fmt(range.brokerage)}</div><div className="csub">daily_trades, in range</div></div>
          <div className="card cw"><div className="clbl">MTF interest</div><div className="cval">{fmt(range.mtf)}</div><div className="csub">months the range touches</div></div>
          <div className="card cp"><div className="clbl">Clients generating revenue</div><div className="cval">{range.revenue_clients ?? 0}</div><div className="csub">with brokerage in range</div></div>
        </div>
      ) : (
        <div className="cards">
          <div className="card ci"><div className="clbl">MTD revenue</div><div className="cval">{fmt(stats?.mtd_revenue)}</div><div className="csub">Brokerage + MTF, current month</div></div>
          <div className="card cs"><div className="clbl">YTD revenue</div><div className="cval">{fmt(stats?.ytd_revenue)}</div><div className="csub">FY to date</div></div>
          <div className="card cw"><div className="clbl">Brokerage share</div><div className="cval">{stats?.brokerage_share == null ? '—' : stats.brokerage_share + '%'}</div><div className="csub">Brokerage ÷ (Brokerage + MTF)</div></div>
          <div className="card cp"><div className="clbl">Clients generating revenue</div><div className="cval">{(stats?.revenue_clients ?? 0)}/{(stats?.my_clients ?? 0)}</div><div className="csub">Mapped clients with revenue this month</div></div>
        </div>
      )}

      <div className="panel">
        <div className="ptitle">📊 {range ? 'Revenue by stream — selected range' : 'Monthly revenue by stream (last 6 months)'}</div>
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
        ) : <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>{range ? 'No revenue in the selected range.' : 'No revenue yet for your mapped clients.'}</div>}
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Only real streams are shown: brokerage (daily_trades) and MTF interest (mtf_monthly). Commission/remittance/partner streams are not tracked in the system.</p>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📋 {range ? 'Stream breakdown — selected range' : 'Monthly stream breakdown'}</div>
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
          <div className="ptitle">👥 {range ? 'Top 5 clients — selected range (by brokerage)' : 'Top 5 clients MTD (by brokerage)'}</div>
          <div className="tw"><table>
            <thead><tr><th>Client</th><th>{range ? 'Revenue' : 'MTD revenue'}</th></tr></thead>
            <tbody>
              {topList.length === 0 ? (
                <tr><td colSpan="2" style={{ padding: '20px', textAlign: 'center', color: 'var(--tx3)' }}>{range ? 'No revenue-generating clients in this range.' : 'No revenue-generating clients this month.'}</td></tr>
              ) : topList.map((c, i) => (
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
