import React from 'react';

const ClientAnalytics = () => (
  <div>
    <h2>Client Analytics</h2>
    <p style={{ color: '#666' }}>Client-level behavioural analytics</p>

    <div style={styles.grid}>
      <div style={styles.card}><h3>Active Clients</h3><h1>1</h1></div>
      <div style={styles.card}><h3>Dormant Clients</h3><h1>0</h1></div>
      <div style={styles.card}><h3>High Score Clients</h3><h1>1</h1></div>
      <div style={styles.card}><h3>Churn Risk Clients</h3><h1>0</h1></div>
    </div>
  </div>
);

const styles = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginTop: 20 },
  card: { background: '#fff', padding: 20, borderRadius: 10 }
};

export default ClientAnalytics;