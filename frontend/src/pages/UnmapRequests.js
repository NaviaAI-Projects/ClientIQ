import React, { useEffect, useState } from 'react';
import api from '../api';

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const mmY = (d) => { if (!d) return '—'; const dt = new Date(d); return `${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`; };

const UnmapRequests = () => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [busy, setBusy]       = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/analytics/unmap-requests')
      .then(res => setData(res.data))
      .catch(() => setError('Could not load unmap requests.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const act = async (id, action) => {
    setBusy(id + action);
    try { await api.post('/analytics/unmap-requests/action', { id, action }); load(); }
    catch { /* ignore */ }
    finally { setBusy(null); }
  };

  if (loading) return <div className="ph"><h2>Unmap requests</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Unmap requests</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { rm_requested, ai_suggested } = data;

  return (
    <div>
      <div className="ph">
        <h2>Unmap requests</h2>
        <p>RM-requested and AI-suggested unmaps pending supervisor decision</p>
      </div>

      <div className="alert a-w">
        ℹ️ Approved unmaps free RM capacity slots. Revenue attribution stops from the unmap date.
      </div>

      <div className="panel">
        <div className="slbl">RM-requested unmaps</div>
        <div className="tw"><table>
          <thead><tr><th>UCC</th><th>Client</th><th>RM</th><th>Reason</th><th>Mapped since</th><th>Revenue trend</th><th>Actions</th></tr></thead>
          <tbody>
            {rm_requested.map(r => (
              <tr key={r.id}>
                <td>{r.ucc}</td><td>{r.name}</td><td>{r.rm_name}</td><td>{r.reason}</td><td>{mmY(r.mapped_since)}</td><td>—</td>
                <td style={{ display: 'flex', gap: 4 }}>
                  <button className="btn sm bs" disabled={busy === r.id + 'approve'} onClick={() => act(r.id, 'approve')}>Approve</button>
                  <button className="btn sm bd" disabled={busy === r.id + 'reject'} onClick={() => act(r.id, 'reject')}>Reject</button>
                </td>
              </tr>
            ))}
            {rm_requested.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--tx3)' }}>No RM-requested unmaps pending.</td></tr>}
          </tbody>
        </table></div>

        <div className="slbl" style={{ marginTop: 16 }}>AI-suggested unmaps</div>
        <div className="tw"><table>
          <thead><tr><th>UCC</th><th>Client</th><th>RM</th><th>AI rationale</th><th>Rev change since mapping</th><th>Actions</th></tr></thead>
          <tbody>
            {ai_suggested.map(r => (
              <tr key={r.id}>
                <td>{r.ucc}</td><td>{r.name}</td><td>{r.rm_name}</td><td>{r.reason}</td><td>—</td>
                <td style={{ display: 'flex', gap: 4 }}>
                  <button className="btn sm bs" disabled={busy === r.id + 'approve'} onClick={() => act(r.id, 'approve')}>Approve</button>
                  <button className="btn sm bd" disabled={busy === r.id + 'reject'} onClick={() => act(r.id, 'reject')}>Reject</button>
                </td>
              </tr>
            ))}
            {ai_suggested.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--tx3)' }}>No AI-suggested unmaps pending.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

export default UnmapRequests;