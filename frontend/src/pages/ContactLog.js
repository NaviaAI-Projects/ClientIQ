import React, { useEffect, useState } from 'react';
import api from '../api';

const ContactLog = () => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      const res = await api.get('/contact-logs');
      setLogs(res.data);
    } catch (err) {
      console.error(err);
      alert('Failed to load contact logs');
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600' }}>Contact & Log</h2>

      <p style={{ color: '#666', marginBottom: '20px' }}>
        Client interaction history and follow-up tracking
      </p>

      <table style={{ width: '100%', background: '#fff', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={styles.th}>Date</th>
            <th style={styles.th}>Client</th>
            <th style={styles.th}>Type</th>
            <th style={styles.th}>Notes</th>
            <th style={styles.th}>Status</th>
          </tr>
        </thead>

        <tbody>
          {logs.length === 0 ? (
            <tr>
              <td colSpan="5" style={styles.td}>No contact logs found</td>
            </tr>
          ) : (
            logs.map((log) => (
              <tr key={log.id}>
                <td style={styles.td}>
                  {log.created_at
                    ? new Date(log.created_at).toLocaleDateString('en-IN')
                    : '-'}
                </td>
                <td style={styles.td}>{log.client_name}</td>
                <td style={styles.td}>{log.interaction_type}</td>
                <td style={styles.td}>{log.notes}</td>
                <td style={styles.td}>{log.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

const styles = {
  th: {
    borderBottom: '1px solid #ddd',
    textAlign: 'left',
    padding: '12px'
  },
  td: {
    borderBottom: '1px solid #eee',
    padding: '12px'
  }
};

export default ContactLog;