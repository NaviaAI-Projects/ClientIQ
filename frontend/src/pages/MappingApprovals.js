import React from 'react';

const MappingApprovals = () => (
  <div>
    <h2>Mapping Approvals</h2>
    <p style={{ color: '#666' }}>Approve pending RM-client mapping requests</p>

    <div style={styles.card}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Client</th>
            <th>Requested RM</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Raj Kumar - 100001</td>
            <td>Banu</td>
            <td>Pending</td>
            <td>
              <button style={styles.btn}>Approve</button>
              <button style={styles.btn2}>Reject</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

const styles = {
  card: { background: '#fff', padding: 20, borderRadius: 10, marginTop: 20 },
  table: { width: '100%', borderCollapse: 'collapse' },
  btn: { background: '#185fa5', color: '#fff', border: 'none', padding: '6px 12px', marginRight: 8 },
  btn2: { background: '#dc2626', color: '#fff', border: 'none', padding: '6px 12px' }
};

export default MappingApprovals;