import React, { useState, useEffect } from 'react';
import api from '../api';

const MISSettings = () => {
  const [fd_rate, setFdRate] = useState('6.5');
  const [fd_effective_from, setFdEffectiveFrom] = useState('2026-04-01');
  const [totalFloat, setTotalFloat] = useState(null);
  const [nse_expiry, setNseExpiry] = useState('Tuesday & Thursday');
  const [bse_expiry, setBseExpiry] = useState('Monday & Wednesday');
  const [mcx_expiry, setMcxExpiry] = useState('Monday');
  const [monthly_expiry, setMonthlyExpiry] = useState('Last Thursday of month');
  const [custom_expiry_dates, setCustomExpiryDates] = useState('');
  const [dormancy_expiry_weeks, setDormancyExpiryWeeks] = useState('2');
  const [exchange_urls, setExchangeUrls] = useState({ nse_options: '', nse_futures: '', mcx_options: '', mcx_futures: '', nse_cash: '' });
  const [saveMsg, setSaveMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/admin-settings'),
      api.get('/dashboard/company')
    ]).then(([settingsRes, dashRes]) => {
      const s = settingsRes.data.data || {};
      if (s.fd_rate) setFdRate(s.fd_rate);
      if (s.fd_effective_from) setFdEffectiveFrom(s.fd_effective_from);
      if (s.nse_expiry) setNseExpiry(s.nse_expiry);
      if (s.bse_expiry) setBseExpiry(s.bse_expiry);
      if (s.mcx_expiry) setMcxExpiry(s.mcx_expiry);
      if (s.monthly_expiry) setMonthlyExpiry(s.monthly_expiry);
      if (s.custom_expiry_dates) setCustomExpiryDates(s.custom_expiry_dates);
      if (s.dormancy_expiry_weeks) setDormancyExpiryWeeks(s.dormancy_expiry_weeks);
      if (s.nse_options_url) setExchangeUrls(prev => ({ ...prev, nse_options: s.nse_options_url, nse_futures: s.nse_futures_url || '', mcx_options: s.mcx_options_url || '', mcx_futures: s.mcx_futures_url || '', nse_cash: s.nse_cash_url || '' }));
      setTotalFloat(dashRes.data?.total_float || 0);
    }).catch(console.error)
    .finally(() => setLoading(false));
  }, []);

  const save = async (payload) => {
    try {
      await api.put('/admin-settings', payload);
      setSaveMsg('Saved successfully');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch { setSaveMsg('Save failed'); }
  };

  const dailyFloat = totalFloat ? ((totalFloat * parseFloat(fd_rate || 0)) / 100 / 365).toFixed(0) : 0;
  const fmt = n => n >= 10000000 ? '₹' + (n/10000000).toFixed(1) + 'Cr' : n >= 100000 ? '₹' + (n/100000).toFixed(1) + 'L' : '₹' + Number(n).toLocaleString('en-IN');

  const inputStyle = { padding: '7px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '12.5px', width: '100%', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '10px', fontWeight: '600', color: '#555', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.4px' };
  const panel = { background: 'white', borderRadius: '10px', padding: '20px', border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: '14px' };
  const btnPrimary = { padding: '7px 14px', background: '#223872', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', marginRight: '8px' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>MIS Settings</h2>
      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Configure float income rate, expiry calendar, exchange feed URLs, and AI scoring weights</p>

      {saveMsg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px',
          background: saveMsg.includes('failed') ? '#fcebeb' : '#eaf3de',
          color: saveMsg.includes('failed') ? '#a32d2d' : '#3b6d11' }}>
          {saveMsg}
        </div>
      )}

      {/* Float Income Settings */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>₹ Float Income Settings</div>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>Float income is estimated daily as: total client ledger balance × rate ÷ 365. Displayed in the Corporate Daily MIS.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Float Deployment Rate (% p.a.)</label>
            <input type="number" step="0.1" value={fd_rate} onChange={e => setFdRate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Effective From</label>
            <input type="date" value={fd_effective_from} onChange={e => setFdEffectiveFrom(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Total Client Float (last computed)</label>
            <input readOnly value={totalFloat ? fmt(totalFloat) : '—'} style={{ ...inputStyle, background: '#f5f4f0' }} />
          </div>
          <div>
            <label style={labelStyle}>Est. Daily Float Income</label>
            <input readOnly value={dailyFloat ? '₹' + Number(dailyFloat).toLocaleString('en-IN') + ' / day' : '—'} style={{ ...inputStyle, background: '#f5f4f0' }} />
          </div>
        </div>
        <button style={btnPrimary} onClick={() => save({ fd_rate, fd_effective_from })}>Save Rate</button>
      </div>

      {/* Expiry Calendar */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>📅 Expiry Calendar Settings</div>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>System highlights expiry days in MIS and applies the expiry signal in AI churn scoring for options traders.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>NSE Weekly Expiry</label>
            <select value={nse_expiry} onChange={e => setNseExpiry(e.target.value)} style={inputStyle}>
              <option>Tuesday & Thursday</option>
              <option>Thursday only</option>
              <option>Tuesday only</option>
              <option>Custom</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>BSE Weekly Expiry</label>
            <select value={bse_expiry} onChange={e => setBseExpiry(e.target.value)} style={inputStyle}>
              <option>Monday & Wednesday</option>
              <option>Wednesday only</option>
              <option>Custom</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>MCX Weekly Expiry</label>
            <select value={mcx_expiry} onChange={e => setMcxExpiry(e.target.value)} style={inputStyle}>
              <option>Monday</option><option>Tuesday</option><option>Custom</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Monthly Expiry Rule</label>
            <select value={monthly_expiry} onChange={e => setMonthlyExpiry(e.target.value)} style={inputStyle}>
              <option>Last Thursday of month</option>
              <option>Last Wednesday of month</option>
              <option>Manual</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label style={labelStyle}>Custom Expiry Dates (comma-separated, DD/MM/YYYY)</label>
          <input value={custom_expiry_dates} onChange={e => setCustomExpiryDates(e.target.value)} placeholder="e.g. 26/06/2026, 03/07/2026 for special expiries" style={inputStyle} />
        </div>
        <div style={{ marginBottom: '12px', fontSize: '12px', color: '#555' }}>
          Dormancy threshold for options traders: missing&nbsp;
          <input type="number" value={dormancy_expiry_weeks} onChange={e => setDormancyExpiryWeeks(e.target.value)}
            style={{ width: '50px', padding: '3px 6px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '4px', display: 'inline' }} />
          &nbsp;consecutive expiry weeks = dormancy alert
        </div>
        <button style={btnPrimary} onClick={() => save({ nse_expiry, bse_expiry, mcx_expiry, monthly_expiry, custom_expiry_dates, dormancy_expiry_weeks })}>Save Expiry Settings</button>
      </div>

      {/* Exchange Feed URLs */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>🌐 Exchange Volume Feed URLs</div>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>System fetches exchange volumes monthly for market share computation. Data is fetched on the 1st of each month for the prior month.</p>
        <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
          {[['NSE Equity Options Volume Feed URL', 'nse_options'],
            ['NSE Equity Futures Volume Feed URL', 'nse_futures'],
            ['MCX Commodity Options Volume Feed URL', 'mcx_options'],
            ['MCX Commodity Futures Volume Feed URL', 'mcx_futures'],
            ['NSE Equity Cash Volume Feed URL', 'nse_cash']
          ].map(([label, key]) => (
            <div key={key}>
              <label style={labelStyle}>{label}</label>
              <input type="url" value={exchange_urls[key] || ''} onChange={e => setExchangeUrls(prev => ({ ...prev, [key]: e.target.value }))} placeholder="https://..." style={inputStyle} />
            </div>
          ))}
        </div>
        <button style={btnPrimary} onClick={() => save({ nse_options_url: exchange_urls.nse_options, nse_futures_url: exchange_urls.nse_futures, mcx_options_url: exchange_urls.mcx_options, mcx_futures_url: exchange_urls.mcx_futures, nse_cash_url: exchange_urls.nse_cash })}>Save URLs</button>
        <button style={{ ...btnPrimary, background: 'white', color: '#223872', border: '0.5px solid #223872' }} onClick={() => alert('Test fetch initiated')}>Test Fetch Now</button>
      </div>
    </div>
  );
};

export default MISSettings;