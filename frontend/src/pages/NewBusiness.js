import React from 'react';

const NewBusiness = () => (
  <div>
    <h2>New Business</h2>
    <p style={{ color: '#666' }}>New revenue and client acquisition opportunities</p>

    <div style={styles.card}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Client</th>
            <th>Opportunity</th>
            <th>Expected Revenue</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Raj Kumar</td>
            <td>MTF Activation</td>
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

export default NewBusiness;