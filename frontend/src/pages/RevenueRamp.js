import React from 'react';

const RevenueRamp = () => (
  <div>
    <h2>Revenue Ramp</h2>
    <p style={{ color: '#666' }}>Revenue growth tracking</p>

    <div style={styles.card}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Month</th>
            <th>Revenue</th>
            <th>Growth</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>June 2026</td>
            <td>₹550</td>
            <td>New</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

const styles = {
  card: { background: '#fff', padding: 20, borderRadius: 10, marginTop: 20 },
  table: { width: '100%', borderCollapse: 'collapse' }
};

export default RevenueRamp;