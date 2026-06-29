import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const AiDigest = () => {
  const [digest, setDigest]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadDigest(); }, []);

  const loadDigest = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get('/ai/daily-digest');
      setDigest(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load AI digest');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const getScoreInfo = (score) => {
    const s = parseFloat(score) || 0;
    if (s >= 70) return { bg: '#fcebeb', color: '#a32d2d', label: 'High Priority', msg: 'High value client — call today for retention.' };
    if (s >= 50) return { bg: '#faeeda', color: '#854f0b', label: 'Medium Priority', msg: 'Good conversion potential — follow up this week.' };
    if (s >= 30) return { bg: '#e8f3ff', color: '#185fa5', label: 'Low-Medium', msg: 'Nurture with regular touchpoints.' };
    return { bg: '#f5f5f5', color: '#888', label: 'Low Priority', msg: 'Monitor activity — low conversion probability now.' };
  };

  const getTypeIcon = (type) => {
    const icons = { call: '📞', whatsapp: '💬', email: '📧', meeting: '🤝', note: '📝' };
    return icons[type] || '📋';
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🤖</div>
        <div style={{ fontSize: '14px', color: '#888' }}>Loading AI digest...</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
      <div style={{ color: '#a32d2d', fontSize: '14px', marginBottom: '16px' }}>{error}</div>
      <button onClick={() => loadDigest()} style={{ padding: '8px 20px', background: '#223872', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
        Try Again
      </button>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111', margin: 0 }}>🤖 AI Daily Digest</h2>
          <p style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>Personalised intelligence · {today}</p>
        </div>
        <button onClick={() => loadDigest(true)} disabled={refreshing}
          style={{ padding: '7px 14px', background: 'white', border: '1px solid #ddd', borderRadius: '7px', cursor: 'pointer', fontSize: '13px', color: '#555' }}>
          {refreshing ? '⏳ Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      {/* Stats Row */}
      {digest?.stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'My Clients',      value: digest.stats.total_clients,   color: '#223872', path: '/mapped-clients' },
            { label: 'Active Leads',    value: digest.stats.active_leads,    color: '#185fa5', path: '/assigned-leads' },
            { label: 'To Call Today',   value: digest.stats.active_leads,    color: '#a32d2d', path: '/to-call-today' },
            { label: 'Dormant',         value: digest.stats.dormant,         color: '#854f0b', path: '/dormant-clients' },
            { label: 'Interactions 7d', value: digest.stats.interactions_7d, color: '#3b6d11', path: '/interaction-log' },
          ].map((s, i) => (
            <div key={i} onClick={() => navigate(s.path)} style={{ background: 'white', borderRadius: '10px', padding: '16px', border: '1px solid #eee', textAlign: 'center', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
              <div style={{ fontSize: '26px', fontWeight: '700', color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', fontWeight: '500' }}>{s.label}</div>
              <div style={{ fontSize: '10px', color: s.color, marginTop: '2px', opacity: 0.7 }}>View →</div>
            </div>
          ))}
        </div>
      )}

      {/* Groq AI Narrative */}
      {digest?.digest && (
        <div style={{ background: 'linear-gradient(135deg, #1a2d5a 0%, #223872 100%)', borderRadius: '12px', padding: '24px', marginBottom: '20px', color: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <span style={{ fontSize: '20px' }}>🤖</span>
            <span style={{ fontSize: '14px', fontWeight: '600', opacity: 0.9 }}>Groq AI Analysis</span>
            <span style={{ marginLeft: 'auto', fontSize: '11px', opacity: 0.6, background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '10px' }}>Powered by Llama 3</span>
          </div>
          <div style={{ fontSize: '13.5px', lineHeight: '1.7', whiteSpace: 'pre-wrap', opacity: 0.95 }}>
            {digest.digest}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Priority Clients */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', fontSize: '14px', fontWeight: '600', color: '#111' }}>
            ⭐ Priority Clients
          </div>
          <div style={{ padding: '12px' }}>
            {(digest?.top_clients || digest?.clients || []).length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No clients mapped</div>
            ) : (
              (digest?.top_clients || digest?.clients || []).map((c, i) => {
                const scoreInfo = getScoreInfo(c.lead_score || c.churn_risk_score);
                return (
                  <div key={i} onClick={() => navigate('/client-360', { state: { ucc: c.ucc } })}
                    style={{ padding: '12px', borderRadius: '8px', marginBottom: '8px', cursor: 'pointer', background: scoreInfo.bg, border: `1px solid ${scoreInfo.color}22` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: '600', color: '#111', fontSize: '13px' }}>{c.name}</div>
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{c.ucc} · {c.client_type}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ background: scoreInfo.color, color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                          {scoreInfo.label}
                        </span>
                        <div style={{ fontSize: '11px', color: scoreInfo.color, marginTop: '3px' }}>Score: {parseFloat(c.lead_score || 0).toFixed(0)}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: '#555', marginTop: '6px' }}>{scoreInfo.msg}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Interactions */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', fontSize: '14px', fontWeight: '600', color: '#111' }}>
            📋 Recent Interactions
          </div>
          <div style={{ padding: '12px' }}>
            {(digest?.recent_interactions || []).length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No recent interactions</div>
            ) : (
              [...new Map((digest?.recent_interactions || []).map(i => [i.id, i])).values()].slice(0, 8).map((interaction, i) => (
                <div key={i} style={{ padding: '10px 12px', borderRadius: '8px', marginBottom: '6px', background: '#f8f9fb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>{getTypeIcon(interaction.interaction_type)}</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#111' }}>{interaction.client_name}</div>
                      <div style={{ fontSize: '11px', color: '#888' }}>{interaction.interaction_type} · {interaction.outcome || 'completed'}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#aaa', textAlign: 'right' }}>
                    {interaction.created_at ? new Date(interaction.created_at).toLocaleDateString('en-IN') : '—'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Action Plan */}
      <div style={{ background: '#eaf3de', borderRadius: '10px', padding: '16px 20px', marginTop: '16px', border: '1px solid #c3dba0' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#3b6d11', marginBottom: '6px' }}>✅ Today's Action Plan</div>
        <div style={{ fontSize: '13px', color: '#3b6d11' }}>
          Focus on high-score clients first → complete pending follow-ups → log all interactions → update outcome after each call.
        </div>
      </div>

    </div>
  );
};

export default AiDigest;