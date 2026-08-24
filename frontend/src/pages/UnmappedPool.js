import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

// Module-level cache — survives navigation within the SPA session, so returning to this page
// renders instantly from the last payload while a fresh copy loads in the background.
let unmapCache = null;

const UnmapRequests = () => {
  const [data, setData] = useState(unmapCache || { rm_requested: [], ai_suggested: [] });
  const [loading, setLoading] = useState(!unmapCache);
  const [busy, setBusy] = useState(null);
  const navigate = useNavigate();

  const load = () => {
    if (!unmapCache) setLoading(true);   // only block on the very first load; revisits refresh silently
    api.get('/analytics/unmap-requests')
      .then(r => { const d = r.data || { rm_requested: [], ai_suggested: [] }; unmapCache = d; setData(d); })
      .catch(console.error).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const act = (id, action) => {
    setBusy(id + action);
    api.post('/analytics/unmap-requests/action', { id, action })
      .then(load).catch(console.error).finally(() => setBusy(null));
  };

  const rows = (list, isAi) => (
    list.length === 0
      ? <tr><td colSpan={isAi ? 4 : 5} style={{ padding: '18px', textAlign: 'center', color: 'var(--tx3)' }}>None pending.</td></tr>
      : list.map(r => (
        <tr key={r.id}>
          <td><span className="lc" onClick={() => navigate('/client-360', { state: { ucc: r.ucc } })}>{r.name} — {r.ucc}</span></td>
          <td>{r.rm_name}</td>
          <td>{r.reason}</td>
          {!isAi && <td>{r.mapped_since ? new Date(r.mapped_since).toLocaleDateString('en-IN') : '—'}</td>}
          <td style={{ display: 'flex', gap: 6 }}>
            <button className="btn bp sm" disabled={busy === r.id + 'approve'} onClick={() => act(r.id, 'approve')}>Approve Unmap</button>
            <button className="btn bd sm" disabled={busy === r.id + 'reject'} onClick={() => act(r.id, 'reject')}>Reject</button>
          </td>
        </tr>
      ))
  );

  if (loading) return <div className="ph"><h2>Unmap Requests</h2><p>Loading…</p></div>;

  return (
    <div>
      <div className="ph">
        <h2>Unmap Requests</h2>
        <p>RM-requested and AI-suggested unmaps pending supervisor decision</p>
      </div>
      <div className="alert a-w">
        Approved unmaps free RM capacity slots. Revenue attribution stops from the unmap date.
      </div>

      <div className="panel">
        <div className="ptitle">🙋 RM-requested unmaps</div>
        <div className="tw"><table>
          <thead><tr><th>Client</th><th>Current RM</th><th>Reason</th><th>Mapped since</th><th>Action</th></tr></thead>
          <tbody>{rows(data.rm_requested, false)}</tbody>
        </table></div>
      </div>

      <div className="panel">
        <div className="ptitle">🤖 AI-suggested unmaps</div>
        <div className="tw"><table>
          <thead><tr><th>Client</th><th>Current RM</th><th>Reason</th><th>Action</th></tr></thead>
          <tbody>{rows(data.ai_suggested, true)}</tbody>
        </table></div>
      </div>
    </div>
  );
};

export default UnmapRequests;