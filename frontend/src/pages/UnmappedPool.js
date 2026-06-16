import React from 'react';

const UnmappedPool = () => (
  <div>
    <h2>Unmapped Pool</h2>
    <p style={{ color: '#666' }}>Clients not yet mapped to any RM</p>

    <div style={styles.card}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>UCC</th>
            <th>Client Name</th>
            <th>Lead Score</th>
            <th>Suggested RM</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>100001</td>
            <td>Raj Kumar</td>
            <td>75</td>
            <td>Banu</td>
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

export default UnmappedPool;