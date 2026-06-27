import React, { useEffect, useState } from 'react';
import api from '../api';

const InteractionLog = () => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.get('/contact-logs').then(res => setLogs(res.data || [])).catch(console.error);
  }, []);

  return (
    <div>
      <div className="ph">
        <h2>Interaction Log</h2>
        <p>All logged interactions with leads and mapped clients — calls, emails, WhatsApp, meetings</p>
      </div>
      <div className="panel">
        <div className="tw"><table>
          <thead><tr>
            <th>Date</th><th>Client</th><th>Type</th><th>Notes</th><th>Status</th>
          </tr></thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No interaction logs found</td></tr>
            ) : logs.map(log => (
              <tr key={log.id}>
                <td>{log.created_at ? new Date(log.created_at).toLocaleDateString('en-IN') : '-'}</td>
                <td style={{ fontWeight: '500' }}>{log.client_name}</td>
                <td><span className="badge b-int">{log.interaction_type || '-'}</span></td>
                <td>{log.notes || '-'}</td>
                <td>{log.status || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

export default InteractionLog;