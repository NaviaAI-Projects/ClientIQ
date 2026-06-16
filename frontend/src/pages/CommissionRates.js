import React, { useState } from 'react';

const CommissionRates = () => {
  const [rates, setRates] = useState([
    { segment: 'Equity Delivery', rate: 20, description: 'Delivery brokerage commission' },
    { segment: 'Equity Intraday', rate: 15, description: 'Intraday brokerage commission' },
    { segment: 'F&O', rate: 30, description: 'Futures and Options commission' },
    { segment: 'Commodity', rate: 25, description: 'Commodity trading commission' },
    { segment: 'Currency', rate: 20, description: 'Currency trading commission' },
    { segment: 'MTF Interest', rate: 10, description: 'MTF interest revenue commission' }
  ]);

  const handleChange = (index, value) => {
    const updated = [...rates];
    updated[index].rate = value;
    setRates(updated);
  };

  return (
    <div>
      <h2>Commission Rates</h2>
      <p style={{ color: '#666' }}>Configure revenue commission percentage</p>

      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Segment</th>
              <th style={styles.th}>Description</th>
              <th style={styles.th}>Commission %</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r, i) => (
              <tr key={i}>
                <td style={styles.td}>{r.segment}</td>
                <td style={styles.td}>{r.description}</td>
                <td style={styles.td}>
                  <input type="number" value={r.rate} onChange={(e) => handleChange(i, e.target.value)} style={styles.input} /> %
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button style={styles.button} onClick={() => alert('Commission rates saved successfully')}>
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
  button: { marginTop: 18, padding: '8px 16px', background: '#185fa5', color: '#fff', border: 'none', borderRadius: 5 }
};

export default CommissionRates;