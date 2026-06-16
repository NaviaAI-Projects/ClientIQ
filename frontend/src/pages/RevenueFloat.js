import React from 'react';

const RevenueFloat = () => (
  <div>
    <h2>Revenue & Float</h2>
    <p style={{ color: '#666' }}>Revenue and ledger float summary</p>

    <div style={styles.card}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Client</th>
            <th>Ledger Balance</th>
            <th>Holdings</th>
            <th>Estimated Revenue</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Raj Kumar</td>
            <td>₹25,000</td>
            <td>₹1,50,000</td>
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

export default RevenueFloat;