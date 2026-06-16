import React from 'react';

const InactiveDP = () => (
  <div>
    <h2>Inactive DP</h2>
    <p style={{ color: '#666' }}>Clients inactive in DP activity</p>

    <div style={styles.card}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Client</th>
            <th>Last Activity</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Raj Kumar</td>
            <td>12/06/2026</td>
            <td>Active</td>
            <td>Monitor</td>
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

export default InactiveDP;