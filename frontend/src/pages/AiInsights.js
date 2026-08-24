import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

// Lead score is a 0–100 "hotness" scale: high = hot lead → red badge.
const scoreClass = (s) => (s == null ? 'ais l' : s >= 75 ? 'ais h' : s >= 60 ? 'ais m' : 'ais l');
// Churn score is a 0–10 risk scale: high = high churn risk → red badge (inverse meaning).
const churnClass = (s) => (s == null ? 'ais l' : s >= 7 ? 'ais h' : s >= 5 ? 'ais m' : 'ais l');

// Module-level cache — survives navigation within the SPA session, so returning to this page
// renders instantly from the last payload while a fresh copy loads in the background.
let aiCache = null;
const aiChurnCache = {};

const AiInsights = () => {
  const [data, setData]       = useState(aiCache);
  const [loading, setLoading] = useState(!aiCache);
  const [error, setError]     = useState('');
  const [churnPage, setChurnPage] = useState(1);   // paginated churn list (all mapped churn clients)
  const [churn, setChurn]     = useState(aiChurnCache[1] || null);
  const [churnLoading, setChurnLoading] = useState(false);   // true only while an uncached page is fetching
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/analytics/ai-insights')
      .then(res => { aiCache = res.data; setData(res.data); })
      .catch(() => { if (!aiCache) setError('Could not load AI insights.'); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (aiChurnCache[churnPage]) { setChurn(aiChurnCache[churnPage]); return; }  // cached → instant, no fetch/spinner
    setChurnLoading(true);
    api.get('/analytics/ai-insights/churn', { params: { page: churnPage, pageSize: 10 } })
      .then(res => { aiChurnCache[churnPage] = res.data; setChurn(res.data); })
      .catch(() => {})
      .finally(() => setChurnLoading(false));
  }, [churnPage]);

  if (loading) return <div className="ph"><h2>AI insights</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>AI insights</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, pace_text, churn_alerts, top_leads, unmap_text, unmap_suggestions } = data;
  const lastRun = meta?.last_run
    ? new Date(meta.last_run).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
  const openClient = (ucc) => navigate('/client-360', { state: { ucc } });

  return (
    <div>
      <div className="ph">
        <h2>AI insights</h2>
        <p>Analysis across all {Number(meta?.total_clients || 0).toLocaleString('en-IN')} clients and {meta?.rms || 0} RMs · Last run: {lastRun}</p>
      </div>

      {/* Revenue pace */}
      <div className="panel" style={{ borderLeft: '3px solid var(--ic)' }}>
        <div className="ptitle">📈 Revenue pace analysis</div>
        <div className="aibox">{pace_text}</div>
      </div>

      {/* Churn risk — all mapped clients at risk, paginated */}
      <div className="panel" style={{ borderLeft: '3px solid var(--dc)' }}>
        <div className="ptitle">⚠️ Churn risk — mapped clients{churn?.total ? ` (${churn.total})` : ''}
          {churnLoading && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--tx3)', marginLeft: 8 }}>Loading…</span>}
        </div>
        <table style={{ opacity: churnLoading ? 0.5 : 1, transition: 'opacity .15s' }}>
          <thead><tr><th>Client</th><th>RM</th><th>Signal</th><th>Score</th></tr></thead>
          <tbody>
            {(!churn || churn.rows.length === 0) ? (
              <tr><td colSpan="4" style={{ padding: '18px', textAlign: 'center', color: 'var(--tx3)' }}>{churn ? 'No churn alerts on mapped clients.' : 'Loading…'}</td></tr>
            ) : churn.rows.map((c, i) => (
              <tr key={i}>
                <td><span className="lc" onClick={() => openClient(c.ucc)}>{c.name}</span></td>
                <td>{c.rm_name}</td>
                <td style={{ fontSize: '12px', color: 'var(--tx2)' }}>{c.signal}</td>
                <td><span className={churnClass(c.score)}>{c.score}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {churn && churn.pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 12 }}>
            <span style={{ color: 'var(--tx3)' }}>Showing {(churn.page - 1) * churn.pageSize + 1}–{Math.min(churn.page * churn.pageSize, churn.total)} of {churn.total}</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn sm" disabled={churnLoading || churn.page <= 1} onClick={() => setChurnPage(p => Math.max(1, p - 1))}>‹ Prev</button>
              <span style={{ color: 'var(--tx2)' }}>Page {churn.page} / {churn.pages}</span>
              <button className="btn sm" disabled={churnLoading || churn.page >= churn.pages} onClick={() => setChurnPage(p => p + 1)}>Next ›</button>
            </span>
          </div>
        )}
      </div>

      <div className="tc2">
        {/* Top leads to assign */}
        <div className="panel" style={{ borderLeft: '3px solid var(--sc)' }}>
          <div className="ptitle">⭐ Top 5 leads to assign today</div>
          <table>
            <thead><tr><th>UCC</th><th>Name</th><th>Score</th><th>Top signal</th></tr></thead>
            <tbody>
              {top_leads.length === 0 ? (
                <tr><td colSpan="4" style={{ padding: '18px', textAlign: 'center', color: 'var(--tx3)' }}>No unassigned leads.</td></tr>
              ) : top_leads.map((l, i) => (
                <tr key={i}>
                  <td><span className="lc" onClick={() => openClient(l.ucc)}>{l.ucc}</span></td>
                  <td><span className="lc" onClick={() => openClient(l.ucc)}>{l.name}</span></td>
                  <td><span className={scoreClass(l.score)}>{l.score == null ? '—' : l.score}</span></td>
                  <td style={{ fontSize: '12px', color: 'var(--tx2)' }}>{l.signal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Unmap suggestions */}
        <div className="panel" style={{ borderLeft: '3px solid var(--wc)' }}>
          <div className="ptitle">➖ AI unmap suggestions</div>
          <div className="aibox" style={{ marginBottom: '10px' }}>{unmap_text}</div>
          <table>
            <thead><tr><th>Client</th><th>RM</th><th>Signal</th></tr></thead>
            <tbody>
              {unmap_suggestions.length === 0 ? (
                <tr><td colSpan="3" style={{ padding: '18px', textAlign: 'center', color: 'var(--tx3)' }}>No unmap candidates.</td></tr>
              ) : unmap_suggestions.map((u, i) => (
                <tr key={i}>
                  <td><span className="lc" onClick={() => openClient(u.ucc)}>{u.name}</span></td>
                  <td>{u.rm_name}</td>
                  <td style={{ fontSize: '12px', color: 'var(--tx2)' }}>{u.signal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AiInsights;