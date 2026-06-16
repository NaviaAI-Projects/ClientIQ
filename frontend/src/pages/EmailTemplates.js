import React, { useState } from 'react';

const EmailTemplates = () => {
  const [templates, setTemplates] = useState([
    { name: 'Client Insight Email', subject: 'ClientIQ Insight for {{client_name}}', body: 'Dear RM, please find the latest client insight and recommendation.' },
    { name: 'Follow-up Reminder', subject: 'Follow-up Reminder', body: 'Please follow up with the client as per recommendation.' },
    { name: 'Dormant Client Reminder', subject: 'Dormant Client Alert', body: 'Client has been inactive. Please reconnect.' }
  ]);

  const updateField = (index, field, value) => {
    const updated = [...templates];
    updated[index][field] = value;
    setTemplates(updated);
  };

  return (
    <div>
      <h2>Email Templates</h2>
      <p style={{ color: '#666' }}>Configure system email templates</p>

      {templates.map((t, i) => (
        <div key={i} style={styles.card}>
          <label>Template Name</label>
          <input value={t.name} onChange={(e) => updateField(i, 'name', e.target.value)} style={styles.input} />

          <label>Subject</label>
          <input value={t.subject} onChange={(e) => updateField(i, 'subject', e.target.value)} style={styles.input} />

          <label>Body</label>
          <textarea value={t.body} onChange={(e) => updateField(i, 'body', e.target.value)} style={styles.textarea} />
        </div>
      ))}

      <button style={styles.button} onClick={() => alert('Email templates saved successfully')}>
        Save Templates
      </button>
    </div>
  );
};

const styles = {
  card: { background: '#fff', padding: 20, borderRadius: 10, marginTop: 20 },
  input: { display: 'block', padding: 8, width: '100%', margin: '6px 0 14px' },
  textarea: { display: 'block', padding: 8, width: '100%', minHeight: 90, margin: '6px 0 14px' },
  button: { marginTop: 18, padding: '8px 16px', background: '#185fa5', color: '#fff', border: 'none', borderRadius: 5 }
};

export default EmailTemplates;