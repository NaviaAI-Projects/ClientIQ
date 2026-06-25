import React, { useState, useEffect } from 'react';
import api from '../api';

const CommissionRates = () => {
  const [rates, setRates] = useState([
    { segment: 'Equity cash',       key: 'rate_eq_cash',      rate: '0.003',  effective_from: '2026-04-01' },
    { segment: 'Equity futures',    key: 'rate_eq_futures',   rate: '0.002',  effective_from: '2026-04-01' },
    { segment: 'Equity options',    key: 'rate_eq_options',   rate: '0.0015', effective_from: '2026-04-01' },
    { segment: 'Commodity futures', key: 'rate_comm_futures', rate: '0.002',  effective_from: '2026-04-01' },
    { segment: 'Commodity options', key: 'rate_comm_options', rate: '0.0015', effective_from: '2026-04-01' },
  ]);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    api.get('/admin-settings').then(res => {
      const s = res.data.data || {};
      setRates(prev => prev.map(r => ({
        ...r,
        rate: s[r.key] || r.rate,
        effective_from: s[r.key + '_from'] || r.effective_from
      })));
    }).catch(console.error);
  }, []);

  const handleChange = (index, field, value) => {
    const updated = [...rates];
    updated[index][field] = value;
    setRates(updated);
  };

  const saveRates = async () => {
    try {
      const payload = {};
      rates.forEach(r => {
        payload[r.key] = r.rate;
        payload[r.key + '_from'] = r.effective_from;
      });
      await api.put('/admin-settings', payload);
      setSaveMsg('Commission rates saved successfully');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch {
      setSaveMsg('Save failed');
    }
  };

  return (
    <div>
      <h2>Commission Rates</h2>
      <p style={{ color: '#666' }}>Per-segment rates for zero-brokerage clients. commission_earned = turnover × rate.</p>

      <div style={{ background: '#e8f3ff', padding: '10px 14px', borderRadius: '8px', color: '#185fa5', fontSize: '12.5px', margin: '14px 0' }}>
        These rates apply only to zero-brokerage plan clients. Paying-brokerage clients have actual brokerage from the brokerage import file.
      </div>

      {saveMsg && (
        <div style={{
          padding: '10px 14px', borderRadius: '6px', marginBottom: '14px', fontSize: '13px',
          background: saveMsg.includes('failed') ? '#fcebeb' : '#eaf3de',
          color: saveMsg.includes('failed') ? '#a32d2d' : '#3b6d11'
        }}>
          {saveMsg}
        </div>
      )}

      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Segment</th>
              <th style={styles.th}>Rate (%)</th>
              <th style={styles.th}>Effective From</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r, i) => (
              <tr key={i}>
                <td style={styles.td}>{r.segment}</td>
                <td style={styles.td}>
                  <input type="number" step="0.0005" value={r.rate}
                    onChange={(e) => handleChange(i, 'rate', e.target.value)}
                    style={styles.input} />
                </td>
                <td style={styles.td}>
                  <input type="date" value={r.effective_from}
                    onChange={(e) => handleChange(i, 'effective_from', e.target.value)}
                    style={{ ...styles.input, width: '140px' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button style={styles.button} onClick={saveRates}>
          Save Rates
        </button>
      </div>
    </div>
  );
};

const styles = {
  card: { background: '#fff', padding: 20, borderRadius: 10, marginTop: 20 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: 12, borderBottom: '1px solid #ddd' },
  td: { padding: 12, borderBottom: '1px solid #eee' },
  input: { padding: 7, width: 90 },
  button: { marginTop: 18, padding: '8px 16px', background: '#185fa5', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }
};

export default CommissionRates;