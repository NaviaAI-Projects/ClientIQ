import React, { useState } from 'react';

const MISSettings = () => {
  const [settings, setSettings] = useState({
    dailyTime: '09:00',
    weeklyTime: '10:00',
    recipients: 'manager@navia.co.in, supervisor@navia.co.in'
  });

  return (
    <div>
      <h2>MIS Settings</h2>
      <p style={{ color: '#666' }}>Configure MIS report schedule and recipients</p>

      <div style={styles.card}>
        <label>Daily MIS Time</label>
        <input type="time" value={settings.dailyTime} onChange={(e) => setSettings({ ...settings, dailyTime: e.target.value })} style={styles.input} />

        <label>Weekly MIS Time</label>
        <input type="time" value={settings.weeklyTime} onChange={(e) => setSettings({ ...settings, weeklyTime: e.target.value })} style={styles.input} />

        <label>Recipient Email IDs</label>
        <textarea value={settings.recipients} onChange={(e) => setSettings({ ...settings, recipients: e.target.value })} style={styles.textarea} />

        <button style={styles.button} onClick={() => alert('MIS settings saved successfully')}>
          Save MIS Settings
        </button>
      </div>
    </div>
  );
};

const styles = {
  card: { background: '#fff', padding: 20, borderRadius: 10, marginTop: 20 },
  input: { display: 'block', padding: 8, width: 300, margin: '6px 0 14px' },
  textarea: { display: 'block', padding: 8, width: '100%', minHeight: 80, margin: '6px 0 14px' },
  button: { marginTop: 10, padding: '8px 16px', background: '#185fa5', color: '#fff', border: 'none', borderRadius: 5 }
};

export default MISSettings;