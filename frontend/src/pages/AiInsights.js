import React, { useEffect, useState } from 'react';
import api from '../api';

const N = { navy:'#223872', red:'#ED4D37', bg:'#f5f4f0', card:'#fff', border:'rgba(0,0,0,0.10)', tx:'#111', tx2:'#555', tx3:'#999', ic:'#185fa5', ibg:'#e6f1fb', sc:'#3b6d11', sbg:'#eaf3de', wc:'#854f0b', wbg:'#faeeda', dc:'#a32d2d', dbg:'#fcebeb' };

const AiInsights = () => {
  const [insights, setInsights]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState(null);

  useEffect(() => { loadInsights(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadInsights = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get('/ai/insights');
      setInsights(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load AI insights');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const panel = { background: N.card, borderRadius: '10px', border: `1px solid ${N.border}`, overflow: 'hidden', marginBottom: '16px' };
  const panelHead = { padding: '14px 18px', borderBottom: `1px solid ${N.border}`, fontSize: '14px', fontWeight: '600', color: N.tx };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🤖</div>
        <div style={{ color: N.tx3, fontSize: '14px' }}>Generating AI insights...</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
      <div style={{ color: N.dc, fontSize: '14px', marginBottom: '16px' }}>{error}</div>
      <button onClick={() => loadInsights()} style={{ padding: '8px 20px', background: N.navy, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Try Again</button>
    </div>
  );

  return (
    <div style={{ fontFamily: "-apple-system,'Segoe UI',system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: N.tx, margin: 0 }}>🤖 AI Insights</h2>
          <p style={{ fontSize: '13px', color: N.tx3, marginTop: '4px' }}>Company-level AI analysis powered by Groq · Llama 3</p>
        </div>
        <button onClick={() => loadInsights(true)} disabled={refreshing}
          style={{ padding: '7px 14px', background: N.card, border: `1px solid ${N.border}`, borderRadius: '7px', cursor: 'pointer', fontSize: '13px', color: N.tx2 }}>
          {refreshing ? '⏳ Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      {/* Summary Stats */}
      {insights?.stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' }}>
          {[
            { label: 'Total Clients',    value: insights.stats.total_clients,   color: N.navy, bg: N.ibg },
            { label: 'High Priority',    value: insights.stats.high_priority,   color: N.dc,   bg: N.dbg },
            { label: 'Churn Risk',       value: insights.stats.churn_risk,      color: N.wc,   bg: N.wbg },
            { label: 'Unassigned Leads', value: insights.stats.unassigned,      color: N.ic,   bg: N.ibg },
          ].map((s, i) => (
            <div key={i} style={{ background: N.card, borderRadius: '10px', padding: '16px', border: `1px solid ${N.border}`, borderTop: `3px solid ${s.color}` }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: N.tx3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{s.label}</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Groq AI Narrative */}
      {(insights?.insights || insights?.narrative) && (
        <div style={{ background: 'linear-gradient(135deg, #1a2d5a 0%, #223872 100%)', borderRadius: '12px', padding: '24px', marginBottom: '16px', color: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <span style={{ fontSize: '20px' }}>🤖</span>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>Groq AI Company Analysis</span>
            <span style={{ marginLeft: 'auto', fontSize: '11px', opacity: 0.6, background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '10px' }}>Powered by Llama 3</span>
          </div>
          <div style={{ fontSize: '13.5px', lineHeight: '1.8', opacity: 0.95 }}>
            {(insights.narrative || insights.insights || '').split('\n').map((line, i) => { const clean = line.replace(/\*\*/g, ''); if (!clean.trim()) return null; if (clean.match(/^[📊🎯📈]/u)) return <div key={i} style={{ fontWeight: '700', fontSize: '14px', marginTop: '14px', marginBottom: '4px', color: 'rgba(255,255,255,0.95)' }}>{clean}</div>; return <div key={i} style={{ marginBottom: '4px', paddingLeft: '4px', opacity: 0.9 }}>{clean}</div>; })}
          </div>
        </div>
      )}

      {/* Two column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* High Priority Clients */}
        <div style={panel}>
          <div style={panelHead}>⭐ High Priority Clients</div>
          <div style={{ padding: '8px' }}>
            {(insights?.high_priority_clients || []).length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: N.tx3, fontSize: '13px' }}>No high priority clients</div>
            ) : (insights?.high_priority_clients || []).map((c, i) => (
              <div key={i} style={{ padding: '10px 12px', borderRadius: '8px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.background = N.bg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '13px', color: N.tx }}>{c.name}</div>
                  <div style={{ fontSize: '11px', color: N.tx3 }}>{c.ucc} · {c.rm_name || 'Unassigned'}</div>
                </div>
                <span style={{ background: N.dbg, color: N.dc, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>
                  Score: {parseFloat(c.lead_score||0).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Churn Risk Clients */}
        <div style={panel}>
          <div style={panelHead}>⚠️ Churn Risk Clients</div>
          <div style={{ padding: '8px' }}>
            {(insights?.churn_risk_clients || []).length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: N.tx3, fontSize: '13px' }}>No churn risk clients</div>
            ) : (insights?.churn_risk_clients || []).map((c, i) => (
              <div key={i} style={{ padding: '10px 12px', borderRadius: '8px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.background = N.bg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '13px', color: N.tx }}>{c.name}</div>
                  <div style={{ fontSize: '11px', color: N.tx3 }}>{c.ucc} · {c.rm_name || 'Unassigned'}</div>
                </div>
                <span style={{ background: N.wbg, color: N.wc, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>
                  Risk: {parseFloat(c.churn_risk_score||0).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Opportunities */}
      {(insights?.opportunities || []).length > 0 && (
        <div style={panel}>
          <div style={panelHead}>💡 AI Recommendations</div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {insights.opportunities.map((opp, i) => (
              <div key={i} style={{ padding: '12px 16px', borderRadius: '8px', background: N.ibg, borderLeft: `3px solid ${N.ic}` }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: N.ic, marginBottom: '3px' }}>{opp.title}</div>
                <div style={{ fontSize: '12px', color: N.tx2 }}>{opp.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default AiInsights;