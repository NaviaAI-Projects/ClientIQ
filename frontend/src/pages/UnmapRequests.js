import React from 'react';

const UnmapRequests = () => (
  <div>
    <h2>Unmap Requests</h2>
    <p style={{ color: '#666' }}>Review client unmapping requests</p>

    <div style={styles.card}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Client</th>
            <th>Current RM</th>
            <th>Reason</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Raj Kumar - 100001</td>
            <td>Banu</td>
            <td>RM reassignment required</td>
            <td><button style={styles.btn}>Approve Unmap</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

const styles = {
  card: { background: '#fff', padding: 20, borderRadius: 10, marginTop: 20 },
  table: { width: '100%', borderCollapse: 'collapse' },
  btn: { background: '#185fa5', color: '#fff', border: 'none', padding: '6px 12px' }
};

export default UnmapRequests;