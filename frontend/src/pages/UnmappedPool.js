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
  const [rms, setRms]         = useState([]);

  // Assign modal state
  const [assignFor, setAssignFor] = useState(null); // the client row being assigned
  const [rmId, setRmId]           = useState('');
  const [busy, setBusy]           = useState(false);
  const [toast, setToast]         = useState(null);  // { ok: bool, msg: string }
  const [search, setSearch]       = useState('');

  const loadPool = (term = '') =>
    api.get('/analytics/unmapped-pool' + (term ? `?search=${encodeURIComponent(term)}` : ''))
      .then(res => setData(res.data))
      .catch(() => setError('Could not load unmapped pool.'));

  useEffect(() => {
    Promise.all([
      loadPool(''),
      api.get('/rm/list').then(res => setRms(res.data || [])).catch(() => setRms([])),
    ]).finally(() => setLoading(false));
  }, []);

  // Debounced UCC / name search across the whole pool (skips the initial load)
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => loadPool(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAssign = (client) => { setAssignFor(client); setRmId(''); setToast(null); };
  const closeAssign = () => { if (!busy) setAssignFor(null); };

  const confirmAssign = async () => {
    if (!rmId || !assignFor) return;
    setBusy(true);
    try {
      const res = await api.post('/leads/assign', { ucc: assignFor.ucc, rm_id: rmId });
      const rmName = rms.find(r => String(r.id) === String(rmId))?.rm_name || 'the RM';
      setAssignFor(null);
      setToast({ ok: true, msg: `${assignFor.name} assigned to ${rmName}. ` +
        (res.data?.optin_link ? 'Opt-in email sent to the client.' : 'Assignment saved.') });
      await loadPool(search.trim());   // refresh list + cards (keep current search)
    } catch (err) {
      setToast({ ok: false, msg: err.response?.data?.message || 'Assignment failed. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!data?.clients?.length) return;
    const head = ['UCC','Name','Type','Plan','Score','Top signals','MTD Turnover','Holdings','Last trade'];
    const rows = data.clients.map(r => [
      r.ucc, r.name, r.client_type, r.plan, r.lead_score ?? '',
      (r.signals || '').replace(/,/g, ';'),
      Math.round(Number(r.mtd_to) || 0), Math.round(Number(r.holdings) || 0), mmY(r.last_trade),
    ]);
    const csv = [head, ...rows].map(a => a.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'unmapped_scored_list.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="ph"><h2>Unmapped client pool</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Unmapped client pool</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { cards, clients } = data;

  return (
    <div>
      <div className="ph">
        <h2>Unmapped client pool</h2>
        <p>AI-ranked clients with highest potential for RM mapping — from {cards.pool_total.toLocaleString('en-IN')} unmapped</p>
      </div>

      {toast && (
        <div className={`alert ${toast.ok ? 'a-s' : 'a-d'}`} style={{ marginBottom: 12 }}>
          {toast.ok ? '✓ ' : '✗ '}{toast.msg}
        </div>
      )}

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
        <div className="brow" style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by UCC or name…"
            style={{ flex: '1 1 240px', maxWidth: 320, padding: '8px 12px', borderRadius: 8,
                     border: '1px solid var(--br2, #cbd5e1)', fontSize: 13, color: 'var(--tx2, #334155)' }}
          />
          {search && <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{clients.length} match{clients.length === 1 ? '' : 'es'}</span>}
          <button className="btn" onClick={exportCsv} style={{ marginLeft: 'auto' }}>⬇️ Export scored list</button>
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
                <td><button className="btn sm bp" onClick={() => openAssign(r)}>Assign</button></td>
              </tr>
            ))}
            {clients.length === 0 && <tr><td colSpan={10} style={{ color: 'var(--tx3)' }}>{search ? `No unmapped clients match "${search}".` : 'No unmapped clients in the pool.'}</td></tr>}
          </tbody>
        </table></div>
      </div>

      {/* ── Assign modal ─────────────────────────────────────────── */}
      {assignFor && (
        <div onClick={closeAssign} style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card, #fff)', borderRadius: 12, padding: '22px 24px',
            width: 420, maxWidth: '92vw', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, color: 'var(--tx)' }}>Assign relationship manager</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--tx3)' }}>
              {assignFor.name} · UCC {assignFor.ucc}
            </p>

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)', display: 'block', marginBottom: 6 }}>
              Choose RM
            </label>
            <select value={rmId} onChange={e => setRmId(e.target.value)} disabled={busy}
              style={{ width: '100%', padding: '9px 10px', borderRadius: 8, fontSize: 13,
                       border: '1px solid var(--br2, #cbd5e1)', color: 'var(--tx2, #334155)', marginBottom: 14 }}>
              <option value="">— Select an RM —</option>
              {rms.map(rm => (
                <option key={rm.id} value={rm.id}>
                  {rm.rm_name}{rm.capacity != null ? ` (${rm.assigned_clients ?? 0}/${rm.capacity})` : ''}
                </option>
              ))}
            </select>

            <div style={{ background: 'var(--bg3, #f1f5f9)', borderRadius: 8, padding: '9px 11px',
                          fontSize: 11, color: 'var(--tx3)', marginBottom: 16 }}>
              On assign, an opt-in email is sent to the client to confirm their RM.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={closeAssign} disabled={busy}>Cancel</button>
              <button className="btn bp" onClick={confirmAssign} disabled={busy || !rmId}>
                {busy ? 'Assigning…' : 'Assign & send opt-in'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnmappedPool;