import React, { useState, useEffect } from 'react';
import api from '../api';

const MISSettings = () => {
  const [fd_rate, setFdRate]                   = useState('6.5');
  const [fd_effective_from, setFdFrom]         = useState('2026-04-01');
  const [totalFloat, setTotalFloat]            = useState(null);
  const [nse_expiry, setNseExpiry]             = useState('Tuesday & Thursday');
  const [bse_expiry, setBseExpiry]             = useState('Monday & Wednesday');
  const [mcx_expiry, setMcxExpiry]             = useState('Monday');
  const [monthly_expiry, setMonthlyExpiry]     = useState('Last Thursday of month');
  const [custom_expiry, setCustomExpiry]       = useState('');
  const [dormancy_weeks, setDormancyWeeks]     = useState('2');
  const [exchangeUrls, setExchangeUrls]        = useState({
    nse_options: '', nse_futures: '', mcx_options: '', mcx_futures: '', nse_cash: ''
  });
  const [revWeights, setRevWeights] = useState({
    options_to_weight: '40',
    equity_weight:     '30',
    float_weight:      '20',
    mtf_weight:        '10',
  });
  const [saveMsg, setSaveMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/admin-settings'),
      api.get('/dashboard/company')
    ]).then(([sRes, dRes]) => {
      const s = sRes.data.data || {};
      if (s.fd_rate)             setFdRate(s.fd_rate);
      if (s.fd_effective_from)   setFdFrom(s.fd_effective_from);
      if (s.nse_expiry)          setNseExpiry(s.nse_expiry);
      if (s.bse_expiry)          setBseExpiry(s.bse_expiry);
      if (s.mcx_expiry)          setMcxExpiry(s.mcx_expiry);
      if (s.monthly_expiry)      setMonthlyExpiry(s.monthly_expiry);
      if (s.custom_expiry_dates) setCustomExpiry(s.custom_expiry_dates);
      if (s.dormancy_expiry_weeks) setDormancyWeeks(s.dormancy_expiry_weeks);
      if (s.nse_options_url) setExchangeUrls({
        nse_options: s.nse_options_url || '',
        nse_futures: s.nse_futures_url || '',
        mcx_options: s.mcx_options_url || '',
        mcx_futures: s.mcx_futures_url || '',
        nse_cash:    s.nse_cash_url    || '',
      });
      if (s.options_to_weight) setRevWeights({
        options_to_weight: s.options_to_weight || '40',
        equity_weight:     s.equity_weight     || '30',
        float_weight:      s.float_weight      || '20',
        mtf_weight:        s.mtf_weight        || '10',
      });
      setTotalFloat(dRes.data?.total_float || 0);
    }).catch(console.error)
    .finally(() => setLoading(false));
  }, []);

  const showMsg = (text) => {
    setSaveMsg(text);
    setTimeout(() => setSaveMsg(''), 3000);
  };

  const save = async (payload) => {
    try {
      await api.put('/admin-settings', payload);
      showMsg('Saved successfully');
    } catch {
      showMsg('Save failed');
    }
  };

  const fmt = (n) => {
    if (!n) return '—';
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1) + 'Cr';
    if (n >= 100000)   return '₹' + (n / 100000).toFixed(1) + 'L';
    return '₹' + Number(n).toLocaleString('en-IN');
  };

  const dailyFloat = totalFloat
    ? '₹' + Math.round((totalFloat * parseFloat(fd_rate || 0)) / 100 / 365).toLocaleString('en-IN') + ' / day'
    : '—';

  // Styles — all inside component so all hooks/state are in scope
  const panel = {
    background: 'white', borderRadius: '10px', padding: '20px',
    border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: '14px'
  };
  const inputStyle = {
    padding: '7px 10px', border: '0.5px solid rgba(0,0,0,0.2)',
    borderRadius: '6px', fontSize: '12.5px', width: '100%', boxSizing: 'border-box'
  };
  const labelStyle = {
    display: 'block', fontSize: '10px', fontWeight: '600',
    color: '#555', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.4px'
  };
  const btnPrimary = {
    padding: '8px 16px', background: '#223872', color: 'white',
    border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', marginRight: '8px'
  };
  const btnSecondary = {
    padding: '8px 16px', background: 'white', color: '#223872',
    border: '0.5px solid #223872', borderRadius: '5px', cursor: 'pointer', fontSize: '12px'
  };
  const th = {
    textAlign: 'left', padding: '8px 12px', fontSize: '10px',
    fontWeight: '600', color: '#888', textTransform: 'uppercase',
    borderBottom: '0.5px solid rgba(0,0,0,0.1)'
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>MIS Settings</h2>
      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px', marginBottom: '16px' }}>
        Configure float income rate, exchange volume feed URLs, expiry calendar, and AI scoring weights for Navia's revenue model
      </p>

      {saveMsg && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px',
          background: saveMsg.includes('failed') ? '#fcebeb' : '#eaf3de',
          color:      saveMsg.includes('failed') ? '#a32d2d' : '#3b6d11'
        }}>
          {saveMsg.includes('failed') ? '✗' : '✓'} {saveMsg}
        </div>
      )}

      {/* ── PANEL 1: Float Income Settings ── */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>₹ Float income settings</div>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '14px' }}>
          Float income is estimated daily as: total client ledger balance (aggregate from ledger file) × rate ÷ 365.
          Displayed in the Corporate Daily MIS as an estimated income line.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={labelStyle}>Float Deployment Rate (% p.a.)</label>
            <input type="number" step="0.1" value={fd_rate}
              onChange={e => setFdRate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Effective From</label>
            <input type="date" value={fd_effective_from}
              onChange={e => setFdFrom(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Total Client Float (₹Cr) — Last Computed</label>
            <input readOnly value={fmt(totalFloat)} style={{ ...inputStyle, background: '#f5f4f0' }} />
          </div>
          <div>
            <label style={labelStyle}>Estimated Daily Float Income</label>
            <input readOnly value={dailyFloat} style={{ ...inputStyle, background: '#f5f4f0' }} />
          </div>
        </div>
        <button style={btnPrimary} onClick={() => save({ fd_rate, fd_effective_from })}>
          💾 Save rate
        </button>
      </div>

      {/* ── PANEL 2: Expiry Calendar Settings ── */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>📅 Expiry calendar settings</div>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '14px' }}>
          System highlights expiry days in the MIS and applies the expiry signal in AI churn scoring for options traders.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>NSE Weekly Expiry Days</label>
            <select value={nse_expiry} onChange={e => setNseExpiry(e.target.value)} style={inputStyle}>
              <option>Tuesday & Thursday</option>
              <option>Thursday only</option>
              <option>Tuesday only</option>
              <option>Custom</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>BSE Weekly Expiry Days</label>
            <select value={bse_expiry} onChange={e => setBseExpiry(e.target.value)} style={inputStyle}>
              <option>Monday & Wednesday</option>
              <option>Wednesday only</option>
              <option>Custom</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>MCX Weekly Expiry</label>
            <select value={mcx_expiry} onChange={e => setMcxExpiry(e.target.value)} style={inputStyle}>
              <option>Monday</option>
              <option>Tuesday</option>
              <option>Custom</option>
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
          <input value={custom_expiry} onChange={e => setCustomExpiry(e.target.value)}
            placeholder="e.g. 26/06/2026, 03/07/2026 for special expiries" style={inputStyle} />
        </div>
        <div style={{ marginBottom: '14px', fontSize: '12px', color: '#555' }}>
          Dormancy threshold for options traders: missing&nbsp;
          <input type="number" value={dormancy_weeks} onChange={e => setDormancyWeeks(e.target.value)}
            style={{ width: '50px', padding: '3px 6px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '4px', display: 'inline', fontSize: '12px' }} />
          &nbsp;consecutive expiry weeks = dormancy alert (regardless of calendar days)
        </div>
        <button style={btnPrimary} onClick={() => save({
          nse_expiry, bse_expiry, mcx_expiry, monthly_expiry,
          custom_expiry_dates: custom_expiry,
          dormancy_expiry_weeks: dormancy_weeks
        })}>
          💾 Save expiry settings
        </button>
      </div>

      {/* ── PANEL 3: Exchange Volume Feed URLs ── */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>🌐 Exchange volume feed URLs</div>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '14px' }}>
          System fetches exchange volumes monthly for market share computation.
          Paste the NSE/BSE data feed or scrape URL for each segment.
          Data is fetched on the 1st of each month for the prior month.
        </p>
        <div style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
          {[
            ['NSE Equity Options Volume Feed URL', 'nse_options'],
            ['NSE Equity Futures Volume Feed URL', 'nse_futures'],
            ['MCX Commodity Options Volume Feed URL', 'mcx_options'],
            ['MCX Commodity Futures Volume Feed URL', 'mcx_futures'],
            ['NSE Equity Cash Volume Feed URL', 'nse_cash'],
          ].map(([label, key]) => (
            <div key={key}>
              <label style={labelStyle}>{label}</label>
              <input type="url" value={exchangeUrls[key] || ''}
                onChange={e => setExchangeUrls(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder="https://..." style={inputStyle} />
            </div>
          ))}
        </div>
        <button style={btnPrimary} onClick={() => save({
          nse_options_url: exchangeUrls.nse_options,
          nse_futures_url: exchangeUrls.nse_futures,
          mcx_options_url: exchangeUrls.mcx_options,
          mcx_futures_url: exchangeUrls.mcx_futures,
          nse_cash_url:    exchangeUrls.nse_cash,
        })}>
          💾 Save URLs
        </button>
        <button style={btnSecondary} onClick={() => alert('Test fetch initiated')}>
          🔄 Test fetch now
        </button>
      </div>

      {/* ── PANEL 4: Revenue Model Weights ── */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>📊 Revenue model weights (for AI scoring)</div>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '14px' }}>
          These reflect Navia's actual revenue split and drive lead scoring priorities. Options volume is the primary signal.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '14px' }}>
          <thead>
            <tr>
              <th style={th}>Revenue Stream</th>
              <th style={th}>Your Revenue Share (%)</th>
              <th style={th}>AI Lead Scoring Weight (%)</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Options clearing / turnover',  share: '40%', key: 'options_to_weight' },
              { label: 'Equity brokerage',             share: '30%', key: 'equity_weight'     },
              { label: 'Client float (ledger balance)', share: '20%', key: 'float_weight'     },
              { label: 'MTF interest',                 share: '10%', key: 'mtf_weight'        },
            ].map((row, i) => (
              <tr key={i} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                <td style={{ padding: '10px 12px' }}>{row.label}</td>
                <td style={{ padding: '10px 12px', color: '#888' }}>{row.share}</td>
                <td style={{ padding: '10px 12px' }}>
                  <input
                    type="number"
                    value={revWeights[row.key]}
                    onChange={e => setRevWeights(prev => ({ ...prev, [row.key]: e.target.value }))}
                    style={{ padding: '6px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '5px', width: '80px', fontSize: '13px' }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button style={btnPrimary} onClick={() => save(revWeights)}>
          💾 Save weights
        </button>
      </div>
    </div>
  );
};

export default MISSettings;