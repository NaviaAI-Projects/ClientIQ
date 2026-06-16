import React from 'react';

const AiInsights = () => (
  <div>
    <h2>AI Insights</h2>
    <p style={{ color: '#666' }}>Company-level AI recommendations</p>

    <div style={styles.card}>
      <h3>Key Insights</h3>
      <p>High opportunity clients should be prioritized for RM follow-up.</p>
      <p>Clients with high float balance can be targeted for revenue conversion.</p>
      <p>Dormant clients require re-engagement nudges.</p>
    </div>
  </div>
);

const styles = {
  card: { background: '#fff', padding: 20, borderRadius: 10, marginTop: 20 }
};

export default AiInsights;