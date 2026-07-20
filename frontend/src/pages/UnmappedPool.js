import React, { useEffect, useState } from 'react';
import api from '../api';
import { ClientLink } from '../components/ui';

const rupee = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + 'L';
  if (v === 0) return '—';
  return '₹' + Math.round(v).toLocaleString('en-IN');
};
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const mmY = (d) => { if (!d) return '—'; const dt = new Date(d); return `${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`; };
const scoreClass = (s) => (s == null ? 'ais l' : s >= 75 ? 'ais h' : s >= 60 ? 'ais m' : 'ais l');

const UnmappedPool = () => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get('/analytics/unmapped-pool')
      .then(res => setData(res.data))
      .catch(() => setError('Could not load unmapped pool.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="ph"><h2>Unmapped client pool</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Unmapped client pool</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { cards, clients } = data;

  return (
    <div>
      <div className="ph">
        <h2>Unmapped client pool</h2>
        <p>AI-ranked clients with highest potential for RM mapping — from {cards.pool_total.toLocaleString('en-IN')} unmapped</p>
      </div>

      <div className="alert a-i">
        🤖 {cards.score_gt60.toLocaleString('en-IN')} clients score above 60. Round-robin auto-assign respects RM capacity limit ({cards.capacity_limit} clients).
      </div>

      <div className="cards">
        <div className="card cd"><div className="clbl">Score &gt;80 (high priority)</div><div className="cval">{cards.score_gt80.toLocaleString('en-IN')}</div></div>
        <div className="card cw"><div className="clbl">Score 60–80</div><div className="cval">{cards.score_60_80.toLocaleString('en-IN')}</div></div>
        <div className="card ci"><div className="clbl">In pipeline (leads)</div><div className="cval">{cards.in_pipeline.toLocaleString('en-IN')}</div></div>
        <div className="card cs"><div className="clbl">RM capacity available</div><div className="cval">{cards.capacity_available.toLocaleString('en-IN')} slots</div></div>
      </div>

      <div className="panel">
        <div className="brow" style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className="btn bp">🤖 Auto-assign top 20 (round-robin)</button>
          <button className="btn">⬇️ Export scored list</button>
        </div>
        <div className="tw"><table>
          <thead><tr><th>UCC</th><th>Name</th><th>Type</th><th>Plan</th><th>Score</th><th>Top signals</th><th>MTD TO</th><th>Holdings</th><th>Last trade</th><th>Action</th></tr></thead>
          <tbody>
            {clients.map(r => (
              <tr key={r.ucc}>
                <td>{r.ucc}</td><td><ClientLink ucc={r.ucc} name={r.name} /></td>
                <td><span className="badge b-ri">{r.client_type}</span></td>
                <td><span className="badge b-zero">{/paying/i.test(r.plan) ? 'Paying' : 'Zero-brk'}</span></td>
                <td><span className={scoreClass(r.lead_score)}>{r.lead_score == null ? '—' : r.lead_score}</span></td>
                <td>{r.signals}</td>
                <td>{rupee(r.mtd_to)}</td>
                <td>{rupee(r.holdings)}</td>
                <td>{mmY(r.last_trade)}</td>
                <td><button className="btn sm bp">Assign</button></td>
              </tr>
            ))}
            {clients.length === 0 && <tr><td colSpan={10} style={{ color: 'var(--tx3)' }}>No unmapped clients in the pool.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

export default UnmappedPool;