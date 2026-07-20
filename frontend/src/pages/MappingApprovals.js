import React, { useEffect, useState } from 'react';
import api from '../api';
import { ClientLink } from '../components/ui';

const scoreClass = (s) => (s == null ? 'ais l' : s >= 75 ? 'ais h' : s >= 60 ? 'ais m' : 'ais l');
const catOf = (s) => (s == null ? 'low' : s >= 75 ? 'high' : s >= 60 ? 'medium' : 'low');

const MappingApprovals = () => {
  const [rows, setRows]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(null);
  const [filter, setFilter] = useState('all');

  const load = () => {
    setLoading(true);
    api.get('/analytics/mapping-approvals')
      .then(res => setRows(res.data.rows))
      .catch(() => setError('Could not load mapping approvals.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const act = async (id, action) => {
    setBusy(id + action);
    try { await api.post('/analytics/mapping-approvals/action', { id, action }); load(); }
    catch { /* ignore */ }
    finally { setBusy(null); }
  };

  if (loading) return <div className="ph"><h2>Mapping approvals</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Mapping approvals</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const counts = {
    all: rows.length,
    high: rows.filter(r => catOf(r.lead_score) === 'high').length,
    medium: rows.filter(r => catOf(r.lead_score) === 'medium').length,
    low: rows.filter(r => catOf(r.lead_score) === 'low').length,
  };
  const shown = filter === 'all' ? rows : rows.filter(r => catOf(r.lead_score) === filter);

  const fbtn = (key, label) => (
    <button type="button" onClick={() => setFilter(key)}
      style={{ cursor: 'pointer', border: '1px solid var(--br2, #cbd5e1)',
        background: filter === key ? 'var(--pc, #185fa5)' : 'var(--card, #fff)',
        color: filter === key ? '#fff' : 'var(--tx2, #475569)',
        borderRadius: 6, fontSize: 12, fontWeight: 600, padding: '4px 12px' }}>
      {label} ({counts[key]})
    </button>
  );

  return (
    <div>
      <div className="ph">
        <h2>Mapping approvals</h2>
        <p>Review RM requests and client opt-ins before confirming mapping</p>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 600 }}>Score:</span>
        {fbtn('all', 'All')}{fbtn('high', 'High 75+')}{fbtn('medium', 'Medium 60–74')}{fbtn('low', 'Low 50–59')}
      </div>
      <div className="alert a-i" style={{ marginBottom: 10 }}>ℹ️ Clients scoring below 50% are hidden from approval (treated as low-priority leads).</div>

      <div className="panel">
        <div className="tw"><table>
          <thead><tr><th>UCC</th><th>Client</th><th>Type</th><th>RM</th><th>Score</th><th>Opt-in</th><th>Interactions</th><th>RM notes</th><th>Actions</th></tr></thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.id}>
                <td>{r.ucc}</td><td><ClientLink ucc={r.ucc} name={r.name} /></td>
                <td><span className="badge b-ri">{r.client_type}</span></td>
                <td>{r.rm_name}</td>
                <td><span className={scoreClass(r.lead_score)}>{r.lead_score == null ? '—' : r.lead_score}</span></td>
                <td><span className={`badge ${r.optin === 'Clicked' ? 'b-act' : 'b-pend'}`}>{r.optin}</span></td>
                <td>{r.interactions}</td>
                <td style={{ fontSize: 11 }}>{r.rm_notes}</td>
                <td style={{ display: 'flex', gap: 4 }}>
                  <button className="btn sm bs" disabled={busy === r.id + 'approve'} onClick={() => act(r.id, 'approve')}>Approve</button>
                  <button className="btn sm bd" disabled={busy === r.id + 'reject'} onClick={() => act(r.id, 'reject')}>Reject</button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--tx3)' }}>No mappings in this category.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

export default MappingApprovals;