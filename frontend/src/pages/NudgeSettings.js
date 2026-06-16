import React, { useState } from 'react';

const NudgeSettings = () => {
  const [settings, setSettings] = useState({
    email: true,
    sms: false,
    whatsapp: true,
    sevenDays: true,
    fifteenDays: true,
    thirtyDays: true
  });

  const toggle = (key) => {
    setSettings({ ...settings, [key]: !settings[key] });
  };

  return (
    <div>
      <h2>Nudge Settings</h2>
      <p style={{ color: '#666' }}>Configure automated nudges for clients and RMs</p>

      <div style={styles.card}>
        <h3>Channels</h3>

        <label style={styles.checkbox}>
          <input type="checkbox" checked={settings.email} onChange={() => toggle('email')} />
          Email Nudge
        </label>

        <label style={styles.checkbox}>
          <input type="checkbox" checked={settings.sms} onChange={() => toggle('sms')} />
          SMS Nudge
        </label>

        <label style={styles.checkbox}>
          <input type="checkbox" checked={settings.whatsapp} onChange={() => toggle('whatsapp')} />
          WhatsApp Nudge
        </label>

        <h3 style={{ marginTop: 20 }}>Trigger Days</h3>

        <label style={styles.checkbox}>
          <input type="checkbox" checked={settings.sevenDays} onChange={() => toggle('sevenDays')} />
          7 Days Follow-up
        </label>

        <label style={styles.checkbox}>
          <input type="checkbox" checked={settings.fifteenDays} onChange={() => toggle('fifteenDays')} />
          15 Days Follow-up
        </label>

        <label style={styles.checkbox}>
          <input type="checkbox" checked={settings.thirtyDays} onChange={() => toggle('thirtyDays')} />
          30 Days Follow-up
        </label>

        <button style={styles.button} onClick={() => alert('Nudge settings saved successfully')}>
          Save Nudge Settings
        </button>
      </div>
    </div>
  );
};

const styles = {
  card: { background: '#fff', padding: 20, borderRadius: 10, marginTop: 20 },
  checkbox: { display: 'block', margin: '10px 0' },
  button: { marginTop: 18, padding: '8px 16px', background: '#185fa5', color: '#fff', border: 'none', borderRadius: 5 }
};

export default NudgeSettings;