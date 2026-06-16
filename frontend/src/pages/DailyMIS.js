import React from 'react';

const DailyMIS = () => (
  <div>
    <h2>Corporate Daily MIS</h2>
    <p style={{ color: '#666' }}>Daily business summary</p>

    <div style={styles.grid}>
      <div style={styles.card}><h3>Total Clients</h3><h1>1</h1></div>
      <div style={styles.card}><h3>Active Clients</h3><h1>1</h1></div>
      <div style={styles.card}><h3>Assigned Leads</h3><h1>1</h1></div>
      <div style={styles.card}><h3>Revenue</h3><h1>₹550</h1></div>
    </div>
  </div>
);

const styles = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginTop: 20 },
  card: { background: '#fff', padding: 20, borderRadius: 10 }
};

export default DailyMIS;