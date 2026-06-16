import React from 'react';

const RMImpact = () => (
  <div>
    <h2>RM Impact</h2>
    <p style={{ color: '#666' }}>Measure RM contribution and client engagement impact</p>

    <div style={styles.card}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>RM Name</th>
            <th>Clients Handled</th>
            <th>Interactions</th>
            <th>Revenue Impact</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Banu</td>
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

export default RMImpact;