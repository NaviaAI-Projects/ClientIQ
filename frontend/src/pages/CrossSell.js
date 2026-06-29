import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const fmt = (v) => {
  const n = parseFloat(v) || 0;
  if (n >= 100000) return '₹' + (n/100000).toFixed(1) + 'L';
  if (n >= 1000)   return '₹' + (n/1000).toFixed(1) + 'K';
  return '₹' + n.toFixed(0);
};

const CrossSellOpps = () => {
  const [opps, setOpps]       = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadOpps(); }, []);

  const loadOpps = async () => {
    setLoading(true);
    try {
      const res = await api.get('/ai/cross-sell');
      setOpps(res.data || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const oppColor = {
    'MTF Activation':      { bg: '#e8f3ff', color: '#185fa5', icon: '🏦' },
    'Plan Upgrade':        { bg: '#faeeda', color: '#854f0b', icon: '⬆️' },
    'Options Trading':     { bg: '#fcebeb', color: '#a32d2d', icon: '📈' },
    'Equity Investment':   { bg: '#eaf3de', color: '#3b6d11', icon: '💹' },
    'NRI Services':        { bg: '#f0f4ff', color: '#223872', icon: '🌍' },
    'Commodity Trading':   { bg: '#fff8e6', color: '#854f0b', icon: '🥇' },
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '7px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', color: '#555' }}>← Back</button>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#111', margin: 0 }}>Cross-sell Opportunities</h2>
          <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>AI-identified revenue expansion for your mapped clients</p>
        </div>
      </div>

      {/* Info Banner */}
      <div style={{ background: '#e8f3ff', padding: '10px 14px', borderRadius: '8px', color: '#185fa5', fontSize: '12.5px', marginBottom: '16px' }}>
        🤖 AI analyses trading patterns, MTF eligibility, plan type, holdings and balance to generate these signals.
      </div>

      {/* Opportunities */}
      {opps.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#888', border: '1px solid #eee' }}>
          No cross-sell opportunities identified yet. Import more trade data for better signals.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {opps.map((opp, i) => {
            const style = oppColor[opp.opportunity] || { bg: '#f5f5f5', color: '#888', icon: '💡' };
            return (
              <div key={i} onClick={() => navigate('/client-360', { state: { ucc: opp.ucc } })}
                style={{ background: 'white', borderRadius: '12px', padding: '16px 20px', border: '1px solid #eee', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>

                {/* Opportunity Badge */}
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: style.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                  {style.icon}
                </div>

                {/* Client Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '700', fontSize: '14px', color: '#111' }}>{opp.name}</span>
                    <span style={{ fontSize: '11px', color: '#888' }}>{opp.ucc}</span>
                    <span style={{ background: '#f0f0f0', color: '#666', padding: '1px 8px', borderRadius: '10px', fontSize: '11px' }}>{opp.client_type}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#555' }}>{opp.reason}</div>
                </div>

                {/* Stats */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ background: style.bg, color: style.color, padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>
                    {opp.opportunity}
                  </div>
                  {opp.potential_value && (
                    <div style={{ fontSize: '11px', color: '#888' }}>Potential: {fmt(opp.potential_value)}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CrossSellOpps;