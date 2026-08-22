import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api';
import { ViewToggle } from '../components/ui';

// Exact ₹ below a lakh (up to 2 decimals), then ₹X.XXL, then ₹X.XXCr.
const fmt = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + 'L';
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};
const chg = (p) => (p == null ? '—' : (p >= 0 ? '+' : '') + p + '%');

const RMImpact = () => {
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/analytics/rm-impact')
      .then(res => setData(res.data))
      .catch(() => setError('Could not load RM impact.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="ph"><h2>RM impact analysis</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>RM impact analysis</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, cards, per_rm, no_improvement } = data;
  const dash = (v, suff = '') => (v == null ? '—' : v + suff);

  return (
    <div>
      <div className="ph">
        <h2>RM impact analysis</h2>
        <p>Revenue and volume change per client — 3 months before RM mapping vs 3 months after</p>
      </div>

      <div className="alert a-i">
        ℹ️ Only clients mapped for at least 3 months are included. Revenue attribution starts from opt-in date. Pre-mapping baseline uses the 3 calendar months before opt-in.
      </div>

      {meta.insufficient_history && (
        <div className="alert a-w" style={{ marginTop: 8 }}>
          ⚠️ Pre/post-mapping impact can't be computed yet — it needs a stored mapping date and ~3 months of trade history on each side of the mapping. Current trade history is ~{meta.trade_months} month(s). Metrics below populate once mapping dates are tracked and history accumulates. Per-RM client counts are live.
        </div>
      )}

      <div className="cards">
        <div className="card cs"><div className="clbl">Clients with revenue increase</div><div className="cval">{dash(cards.rev_increase_pct, '%')}</div><div className="csub">of all mapped clients</div></div>
        <div className="card ci"><div className="clbl">Avg options TO increase</div><div className="cval">{dash(cards.to_increase_pct, '%')}</div><div className="csub">post-mapping vs pre</div></div>
        <div className="card cw"><div className="clbl">Avg float increase</div><div className="cval">{dash(cards.float_increase_pct, '%')}</div><div className="csub">ledger balance change</div></div>
        <div className="card cd"><div className="clbl">Clients with no improvement</div><div className="cval">{dash(cards.no_improve_pct, '%')}</div><div className="csub">Unmap candidates</div></div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📊 RM attributed revenue — pre vs post mapping (avg/month)</div>
          <ViewToggle
            chart={
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={per_rm.map(r => ({ name: r.rm_name, Pre: r.rev_pre || 0, Post: r.rev_post || 0 }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} />
              <Tooltip formatter={v => fmt(v)} /><Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
              <Bar dataKey="Pre" fill="#c7cfdb" name="Avg monthly rev 3M pre-mapping" />
              <Bar dataKey="Post" fill="#185fa5" name="Avg monthly rev 3M post-mapping" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>RM</th><th>Avg rev pre/mo</th><th>Avg rev post/mo</th><th>Change</th></tr></thead>
                <tbody>
                  {per_rm.map(r => (
                    <tr key={r.rm_name}>
                      <td>{r.rm_name}</td>
                      <td>{r.clients_measured ? fmt(r.rev_pre) : '—'}</td>
                      <td>{r.clients_measured ? fmt(r.rev_post) : '—'}</td>
                      <td style={{ color: r.rev_change_pct == null ? 'var(--tx2)' : r.rev_change_pct >= 0 ? 'var(--sc)' : 'var(--dc)' }}>{r.clients_measured ? chg(r.rev_change_pct) : '—'}</td>
                    </tr>
                  ))}
                  {per_rm.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                </tbody>
              </table>
            }
          />
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>{meta.insufficient_history ? 'Awaiting mapping-date + pre/post history.' : `Based on ${meta.measured_clients} measured client(s) · up to ${meta.window_months} months each side of the mapping date.`}</p>
        </div>
        <div className="panel">
          <div className="ptitle">📊 Options turnover — pre vs post mapping (avg/month)</div>
          <ViewToggle
            chart={
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={per_rm.map(r => ({ name: r.rm_name, Pre: r.to_pre || 0, Post: r.to_post || 0 }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} />
              <Tooltip formatter={v => fmt(v)} /><Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
              <Bar dataKey="Pre" fill="#c7cfdb" name="Avg options TO 3M pre" />
              <Bar dataKey="Post" fill="#e0803a" name="Avg options TO 3M post" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>RM</th><th>Avg options TO pre</th><th>Avg options TO post</th><th>Change</th></tr></thead>
                <tbody>
                  {per_rm.map(r => (
                    <tr key={r.rm_name}>
                      <td>{r.rm_name}</td>
                      <td>{r.clients_measured ? fmt(r.to_pre) : '—'}</td>
                      <td>{r.clients_measured ? fmt(r.to_post) : '—'}</td>
                      <td style={{ color: r.to_change_pct == null ? 'var(--tx2)' : r.to_change_pct >= 0 ? 'var(--sc)' : 'var(--dc)' }}>{r.clients_measured ? chg(r.to_change_pct) : '—'}</td>
                    </tr>
                  ))}
                  {per_rm.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                </tbody>
              </table>
            }
          />
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>{meta.insufficient_history ? 'Awaiting mapping-date + pre/post history.' : `Based on ${meta.measured_clients} measured client(s) · up to ${meta.window_months} months each side of the mapping date.`}</p>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📋 Per-RM summary — impact metrics</div>
        <div className="tw"><table>
          <thead><tr><th>RM</th><th>Clients measured</th><th>Avg rev pre (₹/mo)</th><th>Avg rev post (₹/mo)</th><th>Rev change</th><th>Avg options TO pre</th><th>Avg options TO post</th><th>TO change</th><th>Float change</th><th>Unmap candidates</th></tr></thead>
          <tbody>
            {per_rm.map(r => (
              <tr key={r.rm_name}>
                <td>{r.rm_name}</td>
                <td>{r.clients_measured} <span style={{ color: 'var(--tx3)', fontSize: 11 }}>(of {r.total_clients})</span></td>
                <td>{r.clients_measured ? fmt(r.rev_pre) : '—'}</td>
                <td>{r.clients_measured ? fmt(r.rev_post) : '—'}</td>
                <td style={{ color: r.rev_change_pct == null ? 'var(--tx2)' : r.rev_change_pct >= 0 ? 'var(--sc)' : 'var(--dc)' }}>{r.clients_measured ? chg(r.rev_change_pct) : '—'}</td>
                <td>{r.clients_measured ? fmt(r.to_pre) : '—'}</td>
                <td>{r.clients_measured ? fmt(r.to_post) : '—'}</td>
                <td style={{ color: r.to_change_pct == null ? 'var(--tx2)' : r.to_change_pct >= 0 ? 'var(--sc)' : 'var(--dc)' }}>{r.clients_measured ? chg(r.to_change_pct) : '—'}</td>
                <td style={{ color: (r.float_change || 0) >= 0 ? 'var(--sc)' : 'var(--dc)' }}>{r.clients_measured ? fmt(r.float_change) : '—'}</td>
                <td>{r.unmap_candidates}</td>
              </tr>
            ))}
            {per_rm.length === 0 && <tr><td colSpan={10} style={{ color: 'var(--tx3)' }}>No RMs.</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="panel">
        <div className="ptitle">➖ Clients showing no revenue improvement (unmap candidates)</div>
        <div className="tw"><table>
          <thead><tr><th>UCC</th><th>Client</th><th>RM</th><th>Mapped since</th><th>Options TO pre</th><th>Options TO post</th><th>Rev pre</th><th>Rev post</th><th>AI recommendation</th></tr></thead>
          <tbody>
            {no_improvement.map(r => (
              <tr key={r.ucc}><td>{r.ucc}</td><td>{r.name}</td><td>{r.rm_name}</td><td>{r.mapped_since}</td><td>{fmt(r.to_pre)}</td><td>{fmt(r.to_post)}</td><td>{fmt(r.rev_pre)}</td><td>{fmt(r.rev_post)}</td><td>{r.recommendation}</td></tr>
            ))}
            {no_improvement.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--tx3)' }}>No unmap candidates identified (needs pre/post history).</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

export default RMImpact;