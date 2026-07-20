import React, { useEffect, useState, useCallback } from 'react';
import api from '../api';
import { ClientLink } from '../components/ui';

const rupee = (n) => {
  const v = Number(n) || 0;
  if (v === 0) return '—';
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + 'L';
  return '₹' + Math.round(v).toLocaleString('en-IN');
};
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const mmY = (d) => { if (!d) return '—'; const dt = new Date(d); return `${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`; };
const scoreClass = (s) => (s == null ? 'ais l' : s >= 75 ? 'ais h' : s >= 60 ? 'ais m' : 'ais l');
const statusBadge = (s) => s === 'Active' ? 'b-act' : s === 'Lead' ? 'b-lead' : 'b-dor';

const AllClients = () => {
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage]   = useState(1);
  const [f, setF] = useState({ type: '', plan: '', status: '', activity: '', search: '' });

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 50, ...f });
    api.get('/analytics/all-clients?' + params.toString())
      .then(res => setData(res.data))
      .catch(() => setError('Could not load clients.'))
      .finally(() => setLoading(false));
  }, [page, f]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setFilter = (k, v) => { setPage(1); setF(prev => ({ ...prev, [k]: v })); };

  const cards = data?.cards;
  const clients = data?.clients || [];
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / 50));

  return (
    <div>
      <div className="ph">
        <h2>All {cards ? cards.total.toLocaleString('en-IN') : ''} clients</h2>
        <p>Complete client universe — mapped, unmapped, paying, zero-brokerage</p>
      </div>

      {cards && (
        <div className="cards">
          <div className="card ci"><div className="clbl">Total clients</div><div className="cval">{cards.total.toLocaleString('en-IN')}</div></div>
          <div className="card cs"><div className="clbl">Mapped to RM</div><div className="cval">{cards.mapped.toLocaleString('en-IN')}</div><div className="csub">{cards.total ? (cards.mapped / cards.total * 100).toFixed(1) : 0}% of base</div></div>
          <div className="card cw"><div className="clbl">Unmapped</div><div className="cval">{cards.unmapped.toLocaleString('en-IN')}</div></div>
          <div className="card cp"><div className="clbl">In lead pipeline</div><div className="cval">{cards.in_pipeline.toLocaleString('en-IN')}</div></div>
        </div>
      )}

      <div className="panel">
        <div className="phd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="ptitle" style={{ marginBottom: 0 }}>🔎 Filter</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select style={{ width: 110 }} value={f.type} onChange={e => setFilter('type', e.target.value)}>
              <option value="">All types</option><option value="NRI">NRI</option><option value="HV">HV</option><option value="RI">RI</option>
            </select>
            <select style={{ width: 120 }} value={f.plan} onChange={e => setFilter('plan', e.target.value)}>
              <option value="">All plans</option><option value="paying">Paying</option><option value="zero">Zero-brk</option>
            </select>
            <select style={{ width: 110 }} value={f.status} onChange={e => setFilter('status', e.target.value)}>
              <option value="">All status</option><option value="mapped">Mapped</option><option value="unmapped">Unmapped</option><option value="lead">Lead</option>
            </select>
            <select style={{ width: 130 }} value={f.activity} onChange={e => setFilter('activity', e.target.value)}>
              <option value="">All activity</option><option value="active">Active 30d</option><option value="dormant">Dormant 3mo+</option><option value="never">Never traded</option>
            </select>
            <input style={{ width: 170 }} placeholder="UCC or name…" value={f.search} onChange={e => setFilter('search', e.target.value)} />
            <button className="btn sm">⬇️ Export</button>
          </div>
        </div>
        <div className="tw"><table>
          <thead><tr><th>UCC</th><th>Name</th><th>Type</th><th>Plan</th><th>Status</th><th>Last trade</th><th>MTD TO</th><th>MTD Rev</th><th>AI Score</th><th>RM</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={10} style={{ color: 'var(--tx3)' }}>Loading…</td></tr>}
            {error && !loading && <tr><td colSpan={10} style={{ color: 'var(--dc)' }}>{error}</td></tr>}
            {!loading && !error && clients.map(r => (
              <tr key={r.ucc}>
                <td>{r.ucc}</td><td><ClientLink ucc={r.ucc} name={r.name} /></td>
                <td><span className="badge b-ri">{r.client_type}</span></td>
                <td><span className="badge b-zero">{/paying/i.test(r.plan) ? 'Paying' : 'Zero-brk'}</span></td>
                <td><span className={`badge ${statusBadge(r.status)}`}>{r.status}</span></td>
                <td>{mmY(r.last_trade)}</td>
                <td>{rupee(r.mtd_to)}</td>
                <td>{rupee(r.mtd_rev)}</td>
                <td><span className={scoreClass(r.lead_score)}>{r.lead_score == null ? '—' : r.lead_score}</span></td>
                <td>{r.rm_name}</td>
              </tr>
            ))}
            {!loading && !error && clients.length === 0 && <tr><td colSpan={10} style={{ color: 'var(--tx3)' }}>No clients match.</td></tr>}
          </tbody>
        </table></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 12, color: 'var(--tx2)' }}>
          <span>{total.toLocaleString('en-IN')} clients · page {page} of {pages}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button className="btn sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</button>
            <button className="btn sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </span>
        </div>
      </div>
    </div>
  );
};

export default AllClients;