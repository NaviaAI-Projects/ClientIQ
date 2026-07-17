import React, { useEffect, useState } from 'react';
import TradeInsights from './TradeInsights';
import api from '../api';

const TradeInsightsPublic = () => {
  const params  = new URLSearchParams(window.location.search);
  const ucc     = params.get('ucc');
  const token   = params.get('token');

  const [client,  setClient]  = useState(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ucc) {
      setError('Missing UCC. Please reopen from your trading platform.');
      setLoading(false);
      return;
    }

    if (token) {
      // Opened from trading app — use public POST endpoint
      api.post('/trade-insights/public', { ucc, token })
        .then(res => { setClient(res.data); setLoading(false); })
        .catch(err => {
          setError(err.response?.data?.message || 'Access denied.');
          setLoading(false);
        });
    } else {
      // Opened from ClientIQ — use authenticated GET endpoint
      api.get(`/trade-insights/${ucc}`)
        .then(res => { setClient(res.data); setLoading(false); })
        .catch(err => {
          setError(err.response?.data?.message || 'Failed to load trade insights.');
          setLoading(false);
        });
    }
  }, []); // eslint-disable-line

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', flexDirection: 'column', gap: '14px',
      background: '#F1F4F9', fontFamily: "'Manrope', sans-serif"
    }}>
      <div style={{ fontSize: '32px' }}>📊</div>
      <div style={{ fontSize: '15px', color: '#62708A', fontWeight: '600' }}>
        Loading your trade insights...
      </div>
      <div style={{ fontSize: '12px', color: '#8A96AC' }}>
        Analysing {ucc ? `account ${ucc}` : 'your account'}
      </div>
    </div>
  );

  if (error) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', flexDirection: 'column', gap: '14px',
      background: '#F1F4F9', fontFamily: "'Manrope', sans-serif"
    }}>
      <div style={{ fontSize: '32px' }}>⚠️</div>
      <div style={{
        fontSize: '15px', color: '#C8313B', fontWeight: '600',
        maxWidth: '420px', textAlign: 'center', lineHeight: 1.6
      }}>
        {error}
      </div>
      <div style={{ fontSize: '12px', color: '#8A96AC' }}>
        If this keeps happening, contact support.
      </div>
    </div>
  );

  return (
    <div style={{ background: '#F1F4F9', minHeight: '100vh', fontFamily: "'Manrope', sans-serif" }}>

      {/* Topbar */}
      <div style={{
        position:   'sticky', top: 0, zIndex: 100,
        background: 'white', borderBottom: '1px solid #E6EBF2',
        padding:    '12px 24px',
        display:    'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow:  '0 1px 3px rgba(10,18,38,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            fontSize:   '16px', fontWeight: '800', color: '#1B3F7A',
            fontFamily: "'Sora', sans-serif", letterSpacing: '-0.5px'
          }}>
            Navia ClientIQ
          </span>
          <span style={{
            fontSize: '9px', padding: '2px 8px', fontWeight: '700',
            background: '#EDEFF6', color: '#1B3F7A', borderRadius: '20px',
            letterSpacing: '0.5px', textTransform: 'uppercase'
          }}>
            Trade Insights
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '11px', color: '#8A96AC', fontFamily: 'monospace' }}>
            {ucc}
          </div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#1B3F7A' }}>
            {client?.client_name || ''}
          </div>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: '#26c97e', flexShrink: 0
          }} />
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 24px 60px' }}>
        <TradeInsights
          ucc={ucc}
          clientName={client?.client_name}
          token={token || null}
        />
      </div>

      {/* Footer */}
      <div style={{
        padding: '20px 24px', textAlign: 'center', fontSize: '11px',
        color: '#8A96AC', borderTop: '1px solid #E6EBF2',
        background: 'white', marginTop: '20px', lineHeight: 1.7
      }}>
        This is a statistical summary of your own trading activity. It is not investment advice.<br />
        Past performance does not guarantee future results.<br />
        Navia Markets Ltd. is a SEBI-registered stockbroker. SEBI Reg. No. INZ000041331.
      </div>
    </div>
  );
};

export default TradeInsightsPublic;