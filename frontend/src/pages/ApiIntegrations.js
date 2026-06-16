import React, { useState } from 'react';

const ApiIntegrations = () => {
  const [apis, setApis] = useState([
    { name: 'Trade API', url: 'https://api.navia.co.in/trades', status: 'Active' },
    { name: 'Ledger API', url: 'https://api.navia.co.in/ledger', status: 'Active' },
    { name: 'Holdings API', url: 'https://api.navia.co.in/holdings', status: 'Active' },
    { name: 'CRM API', url: 'https://api.navia.co.in/crm', status: 'Inactive' }
  ]);

  const updateField = (index, field, value) => {
    const updated = [...apis];
    updated[index][field] = value;
    setApis(updated);
  };

  return (
    <div>
      <h2>API Integrations</h2>
      <p style={{ color: '#666' }}>Manage external API configuration</p>

      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>API Name</th>
              <th style={styles.th}>Base URL</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {apis.map((api, i) => (
              <tr key={i}>
                <td style={styles.td}>{api.name}</td>
                <td style={styles.td}>
                  <input value={api.url} onChange={(e) => updateField(i, 'url', e.target.value)} style={styles.input} />
                </td>
                <td style={styles.td}>
                  <select value={api.status} onChange={(e) => updateField(i, 'status', e.target.value)} style={styles.input}>
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button style={styles.button} onClick={() => alert('API integrations saved successfully')}>
          Save Integrations
        </button>
      </div>
    </div>
  );
};

const styles = {
  card: { background: '#fff', padding: 20, borderRadius: 10, marginTop: 20 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: 12, borderBottom: '1px solid #ddd' },
  td: { padding: 12, borderBottom: '1px solid #eee' },
  input: { padding: 8, width: '90%' },
  button: { marginTop: 18, padding: '8px 16px', background: '#185fa5', color: '#fff', border: 'none', borderRadius: 5 }
};

export default ApiIntegrations;