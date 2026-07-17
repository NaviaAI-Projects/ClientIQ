import React, { useEffect, useState } from 'react';
import TradeInsights from './TradeInsights';
import api from '../api';

const TradeInsightsPublic = () => {
  const params = new URLSearchParams(window.location.search);
  const ucc = params.get('ucc');
  const urlToken = params.get('token');
  const [client, setClient] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ucc) {
      setError('Missing UCC. Please reopen from your trading platform.');
      setLoading(false);
      return;
    }
    if (urlToken) {
      api.post('/trade-insights/public', { ucc, token: urlToken })
        .then(res => { setClient(res.data); setLoading(false); })
        .catch(err => { setError(err.response?.data?.message || 'Access denied.'); setLoading(false); });
    } else {
      api.get('/trade-insights/' + ucc)
        .then(res => { setClient(res.data); setLoading(false); })
        .catch(err => { setError(err.response?.data?.message || 'Failed to load.'); setLoading(false); });
    }
  }, []);

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}>
      <p>Loading trade insights...</p>
    </div>
  );

  if (error) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#a32d2d'}}>
      <p>{error}</p>
    </div>
  );

  return <TradeInsights clientData={client} publicMode={!!urlToken} />;
};

export default TradeInsightsPublic;
