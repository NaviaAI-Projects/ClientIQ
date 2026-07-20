import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const scoreClass = (s) => (s == null ? 'ais l' : s >= 75 ? 'ais h' : s >= 60 ? 'ais m' : 'ais l');

const AiInsights = () => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/analytics/ai-insights')
      .then(res => setData(res.data))
      .catch(() => setError('Could not load AI insights.'))
      .finally(() => setLoading(false));
  }, []);

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

      {/* Churn risk */}
      <div className="panel" style={{ borderLeft: '3px solid var(--dc)' }}>
        <div className="ptitle">⚠️ Churn risk — top alerts</div>
        <table>
          <thead><tr><th>Client</th><th>RM</th><th>Signal</th><th>Score</th></tr></thead>
          <tbody>
            {churn_alerts.length === 0 ? (
              <tr><td colSpan="4" style={{ padding: '18px', textAlign: 'center', color: 'var(--tx3)' }}>No churn alerts on mapped clients.</td></tr>
            ) : churn_alerts.map((c, i) => (
              <tr key={i}>
                <td><span className="lc" onClick={() => openClient(c.ucc)}>{c.name}</span></td>
                <td>{c.rm_name}</td>
                <td style={{ fontSize: '12px', color: 'var(--tx2)' }}>{c.signal}</td>
                <td><span className={scoreClass(c.score)}>{c.score}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
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