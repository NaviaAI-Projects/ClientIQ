import React from 'react';

const RMPerformance = () => (
  <div>
    <h2>RM Performance</h2>
    <p style={{ color: '#666' }}>RM-wise performance summary</p>

    <div style={styles.card}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>RM Name</th>
            <th>Clients</th>
            <th>Leads</th>
            <th>Interactions</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Banu</td>
            <td>1</td>
            <td>1</td>
            <td>1</td>
            <td>₹550</td>
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

export default RMPerformance;