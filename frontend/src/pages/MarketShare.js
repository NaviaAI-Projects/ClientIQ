import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api';
import { InfoBtn, ViewToggle, DateRange, rangeParams } from '../components/ui';

const Pending = ({ h = 220 }) => (
  <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 13, textAlign: 'center', padding: '0 20px' }}>
    Pending — market share needs external exchange total-volume figures (no exchange feed ingested yet).
  </div>
);

const MarketShare = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange]     = useState({ key: 'all' });

  useEffect(() => {
    if (range.key === 'custom' && !(range.from && range.to)) return;
    setLoading(true);
    api.get('/analytics/market-share', { params: rangeParams(range) }).then(r => setData(r.data)).catch(() => setError('Could not load market share.')).finally(() => setLoading(false));
  }, [range]);

  if (loading && !data) return <div className="ph"><h2>Market share analysis</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Market share analysis</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, cards, rows } = data;

  return (
    <div>
      <div className="ph">
        <h2>Market share analysis</h2>
        <p>Navia's share of exchange volumes — monthly view · Data auto-fetched from configured exchange feed URLs{meta && meta.as_of ? ` · As of ${meta.as_of}` : ''}</p>
      </div>

      <DateRange value={range} onChange={setRange} bounds={meta && meta.range ? { min: meta.range.data_min, max: meta.range.data_max } : undefined} active={meta && meta.range} />
      {loading && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>Updating…</div>}

      <div className="cards">
        <div className="card ci"><div className="clbl">Eq Options mkt share</div><div className="cval">—</div><div className="csub">needs exchange feed</div></div>
        <div className="card cs"><div className="clbl">Peak mkt share (Eq Opt)</div><div className="cval">—</div><div className="csub">needs exchange feed</div></div>
        <div className="card cw"><div className="clbl">Exchange Eq Options avg/day</div><div className="cval">—</div><div className="csub">needs exchange feed</div></div>
        <div className="card cd"><div className="clbl">Navia Eq Options avg/day</div><div className="cval">₹{cards.navia_avg}Cr</div><div className="csub">latest month · live</div></div>
      </div>

      <div className="alert a-i">
        🔄 Exchange volumes not yet fetched — configure feed URLs in Admin → MIS Settings. <button className="btn sm" style={{ marginLeft: 8 }} disabled>Refresh now</button>
      </div>

      <div className="panel">
        <div className="ptitle">📈 Navia market share trend by segment (%)<InfoBtn text="Navia's percentage share of exchange volume by segment over time. Pending until an external exchange total-volume feed is configured." /></div>
        <Pending />
      </div>

      <div className="panel">
        <div className="ptitle">📋 Monthly market share table<InfoBtn text="Monthly Navia daily volumes for Eq Options, Comm Options and Eq Futures; exchange totals and share columns fill in once an exchange feed is configured." /></div>
        <div className="tw"><table>
          <thead><tr><th>Month</th><th>Navia Eq Opt (₹Cr/d)</th><th>Exchange (₹Cr/d)</th><th>Mkt share</th><th>Navia Comm Opt</th><th>Exchange Comm</th><th>Comm share</th><th>Navia Eq Fut</th><th>Eq Fut share</th></tr></thead>
          <tbody>
            {rows.slice().reverse().map(r => (
              <tr key={r.month}>
                <td>{r.month}</td>
                <td>{r.navia_eqopt}</td><td>—</td><td>—</td>
                <td>{r.navia_commopt}</td><td>—</td><td>—</td>
                <td>{r.navia_eqfut}</td><td>—</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--tx3)' }}>No trade data.</td></tr>}
          </tbody>
        </table></div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Navia's own volumes (Eq Opt / Comm Opt / Eq Fut) are live; Exchange and share columns fill in once an exchange-volume feed is configured.</p>
      </div>

      <div className="panel">
        <div className="ptitle">📊 Navia volume vs exchange benchmark (Eq Options)<InfoBtn text="Navia's daily Eq Options volume (₹Cr/day) by month. The exchange benchmark bar appears once an exchange-volume feed is configured." /></div>
        <ViewToggle
          chart={
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v + 'Cr'} />
            <Tooltip formatter={v => '₹' + v + 'Cr'} /><Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
            <Bar dataKey="navia_eqopt" fill="#185fa5" radius={[4, 4, 0, 0]} name="Navia Eq Options (₹Cr/day)" />
          </BarChart>
        </ResponsiveContainer>
          }
          table={
        <table>
          <thead><tr><th>Month</th><th>Navia Eq Options (₹Cr/day)</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.month}><td>{r.month}</td><td>{'₹' + r.navia_eqopt + 'Cr'}</td></tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={2} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
          </tbody>
        </table>
          }
        />
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Exchange benchmark bar appears once the feed is configured.</p>
      </div>
    </div>
  );
};

export default MarketShare;