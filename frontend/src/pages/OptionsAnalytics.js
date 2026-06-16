import React from 'react';

const OptionsAnalytics = () => (
  <div>
    <h2>Options Analytics</h2>
    <p style={{ color: '#666' }}>Options turnover and premium opportunity</p>

    <div style={styles.card}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Client</th>
            <th>Options Turnover</th>
            <th>Lead Score</th>
            <th>Opportunity</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Raj Kumar</td>
            <td>High</td>
            <td>75</td>
            <td>Options Premium Conversion</td>
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

export default OptionsAnalytics;