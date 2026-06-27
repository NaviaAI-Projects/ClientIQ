import React, { useState, useEffect } from 'react';
import api from '../api';

const BASE_RATES = [
  { segment: 'Equity cash',       key: 'rate_eq_cash',      rate: '0.003',  effective_from: '2026-04-01', effective_to: '' },
  { segment: 'Equity futures',    key: 'rate_eq_futures',   rate: '0.002',  effective_from: '2026-04-01', effective_to: '' },
  { segment: 'Equity options',    key: 'rate_eq_options',   rate: '0.0015', effective_from: '2026-04-01', effective_to: '' },
  { segment: 'Commodity futures', key: 'rate_comm_futures', rate: '0.002',  effective_from: '2026-04-01', effective_to: '' },
  { segment: 'Commodity options', key: 'rate_comm_options', rate: '0.0015', effective_from: '2026-04-01', effective_to: '' },
];

const CommissionRates = () => {
  const [rates, setRates]     = useState(BASE_RATES);
  const [saveMsg, setSaveMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin-settings')
      .then(res => {
        const s = res.data.data || {};

        // Load standard rates
        const standard = BASE_RATES.map(r => ({
          ...r,
          rate:           s[r.key]           || r.rate,
          effective_from: s[r.key + '_from'] || r.effective_from,
          effective_to:   s[r.key + '_to']   || '',
        }));

        // Load custom rate periods
        let custom = [];
        try {
          const customKeys = s['custom_rate_keys']
            ? JSON.parse(s['custom_rate_keys'])
            : [];
          custom = customKeys.map(key => ({
            segment:        s[key + '_segment']  || 'Custom segment',
            key,
            rate:           s[key]               || '0.001',
            effective_from: s[key + '_from']     || new Date().toISOString().split('T')[0],
            effective_to:   s[key + '_to']       || '',
          }));
        } catch (e) { console.error('Failed to parse custom rate keys', e); }

        setRates([...standard, ...custom]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (index, field, value) => {
    const updated = [...rates];
    updated[index][field] = value;
    setRates(updated);
  };

  const showMsg = (text) => {
    setSaveMsg(text);
    setTimeout(() => setSaveMsg(''), 3000);
  };

  const saveAll = async () => {
    try {
      const payload = {};
      const customKeys = [];
      rates.forEach(r => {
        payload[r.key]              = r.rate;
        payload[r.key + '_from']    = r.effective_from;
        payload[r.key + '_to']      = r.effective_to || '';
        payload[r.key + '_segment'] = r.segment;
        if (r.key.startsWith('rate_custom_')) customKeys.push(r.key);
      });
      payload['custom_rate_keys'] = JSON.stringify(customKeys);
      await api.put('/admin-settings', payload);
      showMsg('All rates saved successfully');
    } catch { showMsg('Save failed'); }
  };

  const saveRow = async (r) => {
    try {
      await api.put('/admin-settings', {
        [r.key]:              r.rate,
        [r.key + '_from']:    r.effective_from,
        [r.key + '_to']:      r.effective_to || '',
        [r.key + '_segment']: r.segment,
      });
      showMsg(`${r.segment} updated`);
    } catch { showMsg('Update failed'); }
  };

  const deleteRow = async (index) => {
    const r = rates[index];
    if (!r.key.startsWith('rate_custom_')) return;
    const updated = rates.filter((_, i) => i !== index);
    setRates(updated);
    try {
      const customKeys = updated
        .filter(row => row.key.startsWith('rate_custom_'))
        .map(row => row.key);
      await api.put('/admin-settings', { custom_rate_keys: JSON.stringify(customKeys) });
      showMsg('Rate period deleted');
    } catch { showMsg('Delete failed'); }
  };

  const addRatePeriod = async () => {
    const newKey  = `rate_custom_${Date.now()}`;
    const today   = new Date().toISOString().split('T')[0];
    const newRate = { segment: 'New segment', key: newKey, rate: '0.001', effective_from: today, effective_to: '' };
    const updated = [...rates, newRate];
    setRates(updated);
    try {
      const customKeys = updated.filter(r => r.key.startsWith('rate_custom_')).map(r => r.key);
      await api.put('/admin-settings', {
        [newKey]:              newRate.rate,
        [newKey + '_from']:    newRate.effective_from,
        [newKey + '_to']:      '',
        [newKey + '_segment']: newRate.segment,
        custom_rate_keys:      JSON.stringify(customKeys),
      });
      showMsg('New rate period added — edit values and click Update');
    } catch { showMsg('Failed to add rate period'); }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>Commission Rates</h2>
      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
        Per-segment rates for zero-brokerage clients. Applied at trade import. commission_earned = turnover × rate.
      </p>

      <div style={{ background: '#e8f3ff', padding: '10px 14px', borderRadius: '8px', color: '#185fa5', fontSize: '12.5px', margin: '14px 0' }}>
        ℹ️ These rates apply only to zero-brokerage plan clients. Paying-brokerage clients have actual
        brokerage from the brokerage import file. Historical rate periods are preserved.
      </div>

      {saveMsg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px',
          background: saveMsg.includes('failed') || saveMsg.includes('Failed') ? '#fcebeb' : '#eaf3de',
          color:      saveMsg.includes('failed') || saveMsg.includes('Failed') ? '#a32d2d' : '#3b6d11' }}>
          {saveMsg}
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '10px', padding: '20px', border: '0.5px solid rgba(0,0,0,0.1)' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '16px' }}>% Current active rates</div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={S.th}>Segment</th>
              <th style={S.th}>Rate (%)</th>
              <th style={S.th}>Effective From</th>
              <th style={S.th}>Effective To</th>
              <th style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r, i) => (
              <tr key={r.key} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                <td style={S.td}>
                  {r.key.startsWith('rate_custom_') ? (
                    <input value={r.segment} onChange={e => handleChange(i, 'segment', e.target.value)}
                      style={{ ...S.input, width: '160px' }} />
                  ) : (
                    <span style={{ fontWeight: '500' }}>{r.segment}</span>
                  )}
                </td>
                <td style={S.td}>
                  <input type="number" step="0.0005" value={r.rate}
                    onChange={e => handleChange(i, 'rate', e.target.value)}
                    style={{ ...S.input, width: '90px' }} />
                </td>
                <td style={S.td}>
                  <input type="date" value={r.effective_from}
                    onChange={e => handleChange(i, 'effective_from', e.target.value)}
                    style={{ ...S.input, width: '140px' }} />
                </td>
                <td style={S.td}>
                  <input type="date" value={r.effective_to || ''}
                    onChange={e => handleChange(i, 'effective_to', e.target.value)}
                    style={{ ...S.input, width: '140px' }} />
                </td>
                <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                  <button onClick={() => saveRow(r)}
                    style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '5px', cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.2)', background: 'white', color: '#223872', marginRight: '6px' }}>
                    Update
                  </button>
                  {r.key.startsWith('rate_custom_') && (
                    <button onClick={() => deleteRow(i)}
                      style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '5px', cursor: 'pointer', border: '0.5px solid #f1a1a1', background: '#fff5f5', color: '#c0392b' }}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
          <button onClick={saveAll} style={S.btnPrimary}>💾 Save rates</button>
          <button onClick={addRatePeriod} style={S.btnSecondary}>+ Add rate period</button>
        </div>
      </div>
    </div>
  );
};

const S = {
  th: { textAlign: 'left', padding: '10px 12px', fontSize: '10px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '0.5px solid rgba(0,0,0,0.1)' },
  td: { padding: '10px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.05)', verticalAlign: 'middle' },
  input: { padding: '6px 8px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '5px', fontSize: '13px', boxSizing: 'border-box' },
  btnPrimary: { padding: '8px 16px', background: '#223872', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  btnSecondary: { padding: '8px 16px', background: 'white', color: '#223872', border: '0.5px solid #223872', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }
};

export default CommissionRates;