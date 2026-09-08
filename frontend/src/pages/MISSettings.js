import React, { useState, useEffect } from 'react';
import api from '../api';

const MISSettings = () => {
  const [loading, setLoading]   = useState(true);
  const [floatStats, setFloatStats] = useState({ total_float: null, daily_income: null });
  const [saving, setSaving]     = useState('');
  const [msg, setMsg]           = useState('');

  const [floatSettings, setFloatSettings] = useState({
    fd_rate:        6.5,
    effective_from: '01-04-2026'
  });

  const [expirySettings, setExpirySettings] = useState({
    nse_weekly_expiry:  'Tuesday & Thursday',
    bse_weekly_expiry:  'Monday & Wednesday',
    mcx_weekly_expiry:  'Monday',
    monthly_expiry:     'Last Thursday of month',
    custom_expiry:      '',
    dormancy_threshold: 2
  });

  const [feedUrls, setFeedUrls] = useState({
    nse_feed_url: '',   // NSE — cash + derivatives reports (one URL per line)
    bse_feed_url: '',   // BSE — day-wise derivatives summary
    mcx_feed_url: ''    // MCX — commodity futures + options report
  });
  const [feedReport, setFeedReport] = useState(null);   // result of "Test fetch now"

  // Run the exchange-volume auto-fetch now — headless-browser scrape of NSE/BSE/MCX.
  // Takes ~30–60s (launches Chromium, loads four portals). Returns a per-source report.
  const testFetch = async () => {
    setSaving('test'); setFeedReport(null);
    try {
      const res = await api.post('/admin-settings/scrape-exchanges');
      setFeedReport(res.data);
    } catch (e) {
      setFeedReport({ error: e.response?.data?.error || e.message || 'Auto-fetch failed' });
    }
    setSaving('');
  };

  const [weights, setWeights] = useState({
    options_to_weight:  35,
    equity_weight:      20,
    float_weight:       20,
    mtf_weight:         10
  });

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin-settings');
      const s   = res.data.data || {};
      setFloatSettings({
        fd_rate:        parseFloat(s.fd_rate)  || 6.5,
        effective_from: s.effective_from || '01-04-2026'
      });
      setExpirySettings({
        nse_weekly_expiry:  s.nse_weekly_expiry  || 'Tuesday & Thursday',
        bse_weekly_expiry:  s.bse_weekly_expiry  || 'Monday & Wednesday',
        mcx_weekly_expiry:  s.mcx_weekly_expiry  || 'Monday',
        monthly_expiry:     s.monthly_expiry     || 'Last Thursday of month',
        custom_expiry:      s.custom_expiry      || '',
        dormancy_threshold: s.dormancy_threshold || 2
      });
      setFeedUrls({
        nse_feed_url: s.nse_feed_url || '',
        bse_feed_url: s.bse_feed_url || '',
        mcx_feed_url: s.mcx_feed_url || ''
      });
      setWeights({
        options_to_weight: parseFloat(s.options_to_weight) || 35,
        equity_weight:     parseFloat(s.equity_weight)     || 20,
        float_weight:      parseFloat(s.float_weight)      || 20,
        mtf_weight:        parseFloat(s.mtf_weight)        || 10
      });
    } catch (err) { console.error(err); }
    // Fetch live float stats
    try {
      const fRes = await api.get('/dashboard/float-stats');
      if (fRes.data) setFloatStats(fRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const saveSection = async (key, data) => {
    setSaving(key); setMsg('');
    try {
      await api.put('/admin-settings', data);
      setMsg(key + '_success');
      setTimeout(() => setMsg(''), 3000);
    } catch { setMsg(key + '_error'); }
    setSaving('');
  };

  const inp   = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '100%', boxSizing: 'border-box' };
  const lbl   = { display: 'block', fontSize: '11px', fontWeight: '600', color: '#666', marginBottom: '4px' };
  const panel = { background: 'white', borderRadius: '12px', border: '1px solid #eee', padding: '20px', marginBottom: '16px' };
  const btn   = (s) => ({ padding: '8px 20px', background: saving === s ? '#94a3b8' : '#1B3F7A', color: 'white', border: 'none', borderRadius: '6px', cursor: saving === s ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600', marginRight: '8px' });

  const showMsg = (key) => msg === key + '_success'
    ? <span style={{ color: '#10B981', fontSize: '12px' }}>✓ Saved</span>
    : msg === key + '_error'
    ? <span style={{ color: '#EF4444', fontSize: '12px' }}>✗ Failed</span>
    : null;

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#111', margin: 0 }}>MIS Settings</h2>
      <p style={{ fontSize: '13px', color: '#777', marginTop: '4px', marginBottom: '20px' }}>
        Configure float income rate, exchange volume feed URLs, expiry calendar, and AI scoring weights
      </p>

      {/* Float Income Settings */}
      <div style={panel}>
        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>₹ Float Income Settings</div>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
          Float income is estimated daily as: total client ledger balance × rate ÷ 365. Displayed in Corporate Daily MIS.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
          <div>
            <label style={lbl}>Float Deployment Rate (% p.a.)</label>
            <input type="number" step="0.1" value={floatSettings.fd_rate}
              onChange={e => setFloatSettings({ ...floatSettings, fd_rate: Number(e.target.value) })} style={inp} />
          </div>
          <div>
            <label style={lbl}>Effective From</label>
            <input value={floatSettings.effective_from}
              onChange={e => setFloatSettings({ ...floatSettings, effective_from: e.target.value })} style={inp} />
          </div>
          <div>
            <label style={lbl}>Total Client Float (₹Cr) — Last Computed</label>
            <input value={floatStats.total_float ? '₹' + parseFloat(floatStats.total_float).toLocaleString('en-IN', {maximumFractionDigits: 2}) : '—'} disabled style={{ ...inp, background: '#f5f5f5', color: '#888' }} />
          </div>
        </div>
        <button style={btn('float')} onClick={() => saveSection('float', floatSettings)}>
          {saving === 'float' ? 'Saving...' : '💾 Save rate'}
        </button>
        {showMsg('float')}
      </div>

      {/* Expiry Calendar Settings */}
      <div style={panel}>
        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>📅 Expiry Calendar Settings</div>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
          System highlights expiry days in the MIS and applies the expiry signal in AI churn scoring for options traders.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
          <div>
            <label style={lbl}>NSE Weekly Expiry Days</label>
            <select value={expirySettings.nse_weekly_expiry}
              onChange={e => setExpirySettings({ ...expirySettings, nse_weekly_expiry: e.target.value })} style={inp}>
              <option>Tuesday & Thursday</option>
              <option>Thursday only</option>
              <option>Wednesday & Thursday</option>
            </select>
          </div>
          <div>
            <label style={lbl}>BSE Weekly Expiry Days</label>
            <select value={expirySettings.bse_weekly_expiry}
              onChange={e => setExpirySettings({ ...expirySettings, bse_weekly_expiry: e.target.value })} style={inp}>
              <option>Monday & Wednesday</option>
              <option>Tuesday & Friday</option>
              <option>Monday only</option>
            </select>
          </div>
          <div>
            <label style={lbl}>MCX Weekly Expiry</label>
            <select value={expirySettings.mcx_weekly_expiry}
              onChange={e => setExpirySettings({ ...expirySettings, mcx_weekly_expiry: e.target.value })} style={inp}>
              <option>Monday</option>
              <option>Tuesday</option>
              <option>Friday</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Monthly Expiry Rule</label>
            <select value={expirySettings.monthly_expiry}
              onChange={e => setExpirySettings({ ...expirySettings, monthly_expiry: e.target.value })} style={inp}>
              <option>Last Thursday of month</option>
              <option>Last Wednesday of month</option>
              <option>Last Friday of month</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Dormancy Threshold (consecutive expiry weeks missed)</label>
            <input type="number" value={expirySettings.dormancy_threshold}
              onChange={e => setExpirySettings({ ...expirySettings, dormancy_threshold: Number(e.target.value) })} style={inp} />
          </div>
          <div>
            <label style={lbl}>Custom Expiry Dates (DD/MM/YYYY, comma-separated)</label>
            <input value={expirySettings.custom_expiry} placeholder="e.g. 26/06/2026, 03/07/2026"
              onChange={e => setExpirySettings({ ...expirySettings, custom_expiry: e.target.value })} style={inp} />
          </div>
        </div>
        <button style={btn('expiry')} onClick={() => saveSection('expiry', expirySettings)}>
          {saving === 'expiry' ? 'Saving...' : '💾 Save expiry settings'}
        </button>
        {showMsg('expiry')}
      </div>

      {/* Exchange Volume Feed URLs */}
      <div style={panel}>
        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>🌐 Exchange Volume Auto-Fetch</div>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
          The system fetches NSE / BSE / MCX turnover <strong>daily</strong> (after market close, ~01:30 IST) using a
          headless browser that loads each exchange's own report portal — the reliable way past their anti-bot blocks —
          and writes it to the Market Share data. Options are read as premium turnover. Use “Run auto-fetch now” to
          trigger it on demand (takes ~30–60s).
        </p>
        <p style={{ fontSize: '11px', color: '#F59E0B', marginBottom: '16px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '8px 10px' }}>
          Auto-fetch uses the exchanges' built-in portal pages (NSE Business Growth, BSE Day-Wise Summary, MCX
          Historical Data) — it needs the headless browser installed on the server. If a source can't be read, upload
          that exchange's file on the Import page instead. The URL fields below are the legacy direct-file feed and are
          optional.
        </p>
        <div style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
          {[
            ['NSE Volume Feed URL(s)', 'nse_feed_url', 'NSE Cash + Derivatives — one URL per line'],
            ['BSE Volume Feed URL(s)', 'bse_feed_url', 'BSE day-wise derivatives summary'],
            ['MCX Volume Feed URL(s)', 'mcx_feed_url', 'MCX commodity futures + options'],
          ].map(([label, key, hint]) => (
            <div key={key}>
              <label style={lbl}>{label}</label>
              <textarea value={feedUrls[key]} placeholder={`https://...  (${hint})`} rows={2}
                onChange={e => setFeedUrls({ ...feedUrls, [key]: e.target.value })}
                style={{ ...inp, fontFamily: 'inherit', resize: 'vertical' }} />
            </div>
          ))}
        </div>
        <button style={btn('feeds')} onClick={() => saveSection('feeds', feedUrls)}>
          {saving === 'feeds' ? 'Saving...' : '💾 Save URLs'}
        </button>
        <button style={{ ...btn('test'), background: 'white', color: '#1B3F7A', border: '1px solid #223872' }}
          disabled={saving === 'test'}
          onClick={testFetch}>
          {saving === 'test' ? 'Running… (~30–60s)' : '🔄 Run auto-fetch now'}
        </button>
        {showMsg('feeds')}
        {feedReport && (
          <div style={{ marginTop: 12, fontSize: 12, background: '#f8fafc', border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
            {feedReport.error
              ? <div style={{ color: '#EF4444' }}>✗ {feedReport.error}</div>
              : <>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    Fetched {feedReport.total_rows} row(s) · {new Date(feedReport.ran_at).toLocaleString('en-IN')}
                  </div>
                  {(feedReport.results || []).map((r, i) => (
                    <div key={i} style={{ marginBottom: 6, lineHeight: 1.4 }}>
                      <span style={{ color: r.ok ? '#10B981' : (r.http >= 400 || r.error ? '#EF4444' : '#F59E0B') }}>
                        {r.ok ? '✓' : (r.http >= 400 || r.error ? '✗' : '⚠')}
                      </span>{' '}
                      <strong>{r.source}</strong>
                      {r.http ? <span style={{ color: '#888' }}> · HTTP {r.http}</span> : null}
                      {' — '}
                      {r.ok
                        ? `parsed ${r.rows_parsed} row(s)${r.kind ? ` (${r.kind})` : ''}`
                        : (r.error || r.note || 'no data')}
                      {r.url ? <div style={{ color: '#aaa', fontSize: 11, wordBreak: 'break-all' }}>{r.url}</div> : null}
                    </div>
                  ))}
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #ddd', color: '#888', fontSize: 11 }}>
                    Rows shown are what parsed from the feeds and were written to the market-share data.
                    If a source shows ⚠ or ✗ (blocked / not a data file), use the file-upload importer for that exchange instead.
                  </div>
                </>}
          </div>
        )}
      </div>

      {/* Revenue Model Weights */}
      <div style={panel}>
        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>📊 Revenue Model Weights (for AI Scoring)</div>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
          These reflect Navia's actual revenue split and drive lead scoring priorities.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase' }}>Revenue Stream</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase' }}>Your Revenue Share</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase' }}>AI Lead Scoring Weight (%)</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Options clearing / turnover', share: '40%', key: 'options_to_weight' },
              { label: 'Equity brokerage',            share: '30%', key: 'equity_weight' },
              { label: 'Client float (ledger balance)',share: '20%', key: 'float_weight' },
              { label: 'MTF interest',                share: '10%', key: 'mtf_weight' },
            ].map(row => (
              <tr key={row.key} style={{ borderBottom: '1px solid #f5f5f5' }}>
                <td style={{ padding: '10px 12px' }}>{row.label}</td>
                <td style={{ padding: '10px 12px', color: '#888' }}>{row.share}</td>
                <td style={{ padding: '10px 12px' }}>
                  <input type="number" value={weights[row.key]}
                    onChange={e => setWeights({ ...weights, [row.key]: Number(e.target.value) })}
                    style={{ ...inp, maxWidth: '100px' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button style={btn('weights')} onClick={() => saveSection('weights', weights)}>
          {saving === 'weights' ? 'Saving...' : '💾 Save weights'}
        </button>
        {showMsg('weights')}
      </div>
    </div>
  );
};

export default MISSettings;