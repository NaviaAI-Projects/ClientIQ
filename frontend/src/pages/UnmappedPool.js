import React, { useEffect, useState } from 'react';
import { ClientLink } from '../components/ui';
import api from '../api';

const rupee = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + 'L';
  if (v === 0) return '—';
  return '₹' + Math.round(v).toLocaleString('en-IN');
};
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const mmY = (d) => { if (!d) return '—'; const dt = new Date(d); return `${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`; };
// Lead score is a 0–100 opportunity scale: high = hot lead.
const scoreClass = (s) => (s == null ? 'ais l' : s >= 75 ? 'ais h' : s >= 60 ? 'ais m' : 'ais l');

const UnmappedPool = () => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [rms, setRms]         = useState([]);
  const [search, setSearch]   = useState('');

  // Single-client assign modal
  const [assignFor, setAssignFor] = useState(null);  // the client row being assigned
  const [rmId, setRmId]           = useState('');
  const [busy, setBusy]           = useState(false);
  const [toast, setToast]         = useState(null);  // { ok, msg }

  // Round-robin auto-assign (preview → confirm)
  const [autoPlan, setAutoPlan]       = useState(null);
  const [autoOpen, setAutoOpen]       = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoBusy, setAutoBusy]       = useState(false);

  const loadPool = (term = '') =>
    api.get('/analytics/unmapped-pool' + (term ? `?search=${encodeURIComponent(term)}` : ''))
      .then(res => { setData(res.data); setError(''); })
      .catch(() => setError('Could not load unmapped pool.'));

  useEffect(() => {
    Promise.all([
      loadPool(),
      api.get('/rm/list').then(res => setRms(res.data || [])).catch(() => setRms([])),
    ]).finally(() => setLoading(false));
  }, []);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { loadPool(search.trim()); }, 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line

  const flash = (ok, msg) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 3500); };

  const submitAssign = async () => {
    if (!assignFor || !rmId) return;
    setBusy(true);
    try {
      await api.post('/leads/assign', { ucc: assignFor.ucc, rm_id: Number(rmId) });
      const rmName = rms.find(r => String(r.id) === String(rmId))?.rm_name || 'RM';
      flash(true, `${assignFor.name} assigned to ${rmName}. The RM sends the opt-in after contact.`);
      setAssignFor(null); setRmId('');
      await loadPool(search.trim());
    } catch (e) {
      flash(false, e?.response?.data?.message || 'Could not assign this client.');
    } finally { setBusy(false); }
  };

  const openAuto = async () => {
    setAutoLoading(true); setAutoOpen(true); setAutoPlan(null);
    try {
      const res = await api.get('/leads/auto-assign/preview');
      setAutoPlan(res.data);
    } catch (e) {
      flash(false, 'Could not build the auto-assign plan.');
      setAutoOpen(false);
    } finally { setAutoLoading(false); }
  };

  const commitAuto = async () => {
    if (!autoPlan?.plan?.length) return;
    setAutoBusy(true);
    try {
      const assignments = autoPlan.plan.map(p => ({ ucc: p.ucc, rm_id: p.rm_id }));
      const res = await api.post('/leads/auto-assign/commit', { assignments });
      const r = res.data || {};
      flash(true, `Assigned ${r.assigned ?? 0} clients${r.skipped ? `, ${r.skipped} skipped` : ''}.`);
      setAutoOpen(false); setAutoPlan(null);
      await loadPool(search.trim());
    } catch (e) {
      flash(false, e?.response?.data?.message || 'Could not commit the plan.');
    } finally { setAutoBusy(false); }
  };

  if (loading) return <div className="ph"><h2>Unmapped client pool</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Unmapped client pool</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const cards = data?.cards || {};
  const clients = data?.clients || [];

  return (
    <div>
      <div className="ph">
        <h2>Unmapped client pool</h2>
        <p>High-opportunity clients not yet mapped to an RM — assign individually or auto-assign by round-robin</p>
      </div>

      {/* KPI cards */}
      <div className="cards">
        <div className="card ci">
          <div className="clbl">Unmapped pool</div>
          <div className="cval">{num(cards.pool_total)}</div>
          <div className="csub">Leads awaiting assignment</div>
        </div>
        <div className="card cs">
          <div className="clbl">In pipeline</div>
          <div className="cval">{num(cards.in_pipeline)}</div>
          <div className="csub">Assigned / pending / opted-in</div>
        </div>
        <div className="card cw">
          <div className="clbl">Capacity available</div>
          <div className="cval">{num(cards.capacity_available)}</div>
          <div className="csub">Open RM slots across the desk</div>
        </div>
        <div className="card cp">
          <div className="clbl">RM capacity limit</div>
          <div className="cval">{num(cards.capacity_limit)}</div>
          <div className="csub">Per-RM cap</div>
        </div>
      </div>

      {/* Controls */}
      <div className="panel">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search unmapped clients by UCC or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 240 }}
          />
          <button className="btn bp" onClick={openAuto}>⚡ Auto-assign (round-robin)</button>
        </div>
      </div>

      {/* Client table */}
      <div className="panel">
        <div className="ptitle">🎯 Top unmapped clients{clients.length ? ` (${clients.length})` : ''}</div>
        <div className="tw"><table>
          <thead><tr>
            <th>Client</th><th>Type</th><th>Plan</th><th>Lead score</th><th>Signals</th>
            <th>MTD turnover</th><th>Holdings</th><th>Last trade</th><th>Action</th>
          </tr></thead>
          <tbody>
            {clients.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: '18px', textAlign: 'center', color: 'var(--tx3)' }}>No unmapped clients{search ? ` for “${search}”` : ''}.</td></tr>
            ) : clients.map(c => (
              <tr key={c.ucc}>
                <td><ClientLink ucc={c.ucc} name={c.name} /></td>
                <td>{c.client_type || '—'}</td>
                <td>{c.plan || '—'}</td>
                <td><span className={scoreClass(c.lead_score)}>{c.lead_score == null ? '—' : c.lead_score}</span></td>
                <td style={{ fontSize: 12, color: 'var(--tx2)' }}>{c.signals || '—'}</td>
                <td>{rupee(c.mtd_to)}</td>
                <td>{rupee(c.holdings)}</td>
                <td style={{ fontSize: 12, color: 'var(--tx2)' }}>{mmY(c.last_trade)}</td>
                <td>
                  <button className="btn bp sm" onClick={() => { setAssignFor(c); setRmId(''); }}>Assign</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Top 50 by lead score. Assigning hands the client to the RM — no email is sent. The RM sends the opt-in link from Assigned Leads after speaking to the client.</p>
      </div>

      {/* Single-assign modal */}
      {assignFor && (
        <div style={overlay} onClick={() => !busy && setAssignFor(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Assign {assignFor.name}</div>
            <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 14 }}>{assignFor.ucc} · lead score {assignFor.lead_score ?? '—'}</div>
            <label style={{ fontSize: 12, color: 'var(--tx3)' }}>Relationship manager</label>
            <select value={rmId} onChange={e => setRmId(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
              <option value="">Select an RM…</option>
              {rms.map(r => {
                const remaining = Math.max(0, Number(r.capacity || 0) - Number(r.assigned_clients || 0));
                return <option key={r.id} value={r.id}>{r.rm_name} · {remaining} slot{remaining === 1 ? '' : 's'} free</option>;
              })}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn sm" disabled={busy} onClick={() => setAssignFor(null)}>Cancel</button>
              <button className="btn bp sm" disabled={busy || !rmId} onClick={submitAssign}>{busy ? 'Assigning…' : 'Assign to RM'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-assign preview modal */}
      {autoOpen && (
        <div style={overlay} onClick={() => !autoBusy && setAutoOpen(false)}>
          <div style={{ ...modal, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Round-robin auto-assign — preview</div>
            {autoLoading ? <p style={{ color: 'var(--tx3)' }}>Building plan…</p> : !autoPlan ? null : (
              <>
                <div style={{ fontSize: 13, color: 'var(--tx2)', marginBottom: 12 }}>
                  {autoPlan.counts.assignable} of {autoPlan.counts.eligible} eligible leads (score ≥ {autoPlan.counts.threshold}) will be assigned across {autoPlan.per_rm.length} RMs.
                  {autoPlan.counts.overflow > 0 && <span style={{ color: 'var(--wc)' }}> {autoPlan.counts.overflow} overflow (no capacity left).</span>}
                </div>
                <div className="tw" style={{ maxHeight: 260, overflow: 'auto' }}><table>
                  <thead><tr><th>RM</th><th>Current</th><th>Adding</th><th>New total</th><th>Capacity</th></tr></thead>
                  <tbody>
                    {autoPlan.per_rm.map(r => (
                      <tr key={r.rm_id}>
                        <td>{r.rm_name}</td><td>{num(r.current)}</td>
                        <td style={{ color: r.adding > 0 ? 'var(--sc)' : 'var(--tx3)' }}>{r.adding > 0 ? `+${r.adding}` : '—'}</td>
                        <td>{num(r.new_total)}</td><td>{num(r.capacity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                  <button className="btn sm" disabled={autoBusy} onClick={() => setAutoOpen(false)}>Cancel</button>
                  <button className="btn bp sm" disabled={autoBusy || !autoPlan.plan.length} onClick={commitAuto}>
                    {autoBusy ? 'Assigning…' : `Assign ${autoPlan.counts.assignable} clients`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 500, background: toast.ok ? 'var(--sbg)' : 'var(--dbg)',
          color: toast.ok ? 'var(--sc)' : 'var(--dc)', border: `1px solid ${toast.ok ? 'var(--sborder)' : 'var(--dborder)'}`,
          padding: '10px 16px', borderRadius: 'var(--r2)', fontSize: 13, boxShadow: 'var(--shadow-lg)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
};

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 400 };
const modal = { background: 'var(--bg)', borderRadius: 'var(--r2)', border: '1px solid var(--br)',
  boxShadow: 'var(--shadow-lg)', padding: 20, width: '90%', maxWidth: 420 };

export default UnmappedPool;