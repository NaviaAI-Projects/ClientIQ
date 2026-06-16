import React from 'react';

const Retention = () => (
  <div>
    <h2>Retention & Cohorts</h2>
    <p style={{ color: '#666' }}>Client retention and cohort tracking</p>

    <div style={styles.card}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Cohort</th>
            <th>Total Clients</th>
            <th>Active</th>
            <th>Dormant</th>
            <th>Retention %</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>June 2026</td>
            <td>1</td>
            <td>1</td>
            <td>0</td>
            <td>100%</td>
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

export default Retention;