import React, { useState } from 'react';

const ClientInsights = () => {
  const [client, setClient] = useState({
    name: 'Raj Kumar',
    ucc: '100001',
    leadScore: 75,
    churnRisk: 0,
    recommendation: 'High opportunity client. Recommended for RM follow-up and MTF discussion.'
  });

  return (
    <div>
      <h2>Client Insight Email</h2>
      <p style={{ color: '#666' }}>Preview and generate client insight email</p>

      <div style={styles.card}>
        <h3>Preview</h3>

        <p><b>Client:</b> {client.name}</p>
        <p><b>UCC:</b> {client.ucc}</p>
        <p><b>Lead Score:</b> {client.leadScore}</p>
        <p><b>Churn Risk:</b> {client.churnRisk}</p>

        <div style={styles.preview}>
          <p>Dear RM,</p>
          <p>
            Client {client.name} has a lead score of {client.leadScore}.
            {client.recommendation}
          </p>
          <p>Please review the client profile and complete the follow-up.</p>
          <p>Regards,<br />ClientIQ</p>
        </div>

        <button style={styles.button} onClick={() => alert('Client insight email generated successfully')}>
          Generate Email
        </button>
      </div>
    </div>
  );
};

const styles = {
  card: { background: '#fff', padding: 20, borderRadius: 10, marginTop: 20 },
  preview: { background: '#f8faff', padding: 16, borderRadius: 8, marginTop: 15 },
  button: { marginTop: 18, padding: '8px 16px', background: '#185fa5', color: '#fff', border: 'none', borderRadius: 5 }
};

export default ClientInsights;