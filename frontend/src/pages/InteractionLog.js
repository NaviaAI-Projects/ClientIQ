import React, { useEffect, useState } from 'react';
import axios from 'axios';
import api from '../api';

const InteractionLog = () => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      const token = localStorage.getItem('token');

      const res = await api.get('/clients');

      setLogs(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ padding: '25px' }}>
      <h2>Interaction Log</h2>
      <p style={{ color: '#666' }}>
        Complete RM interaction history
      </p>

      <div
        style={{
          marginTop: '20px',
          background: '#fff',
          padding: '15px',
          borderRadius: '10px'
        }}
      >
        <table width="100%">
          <thead>
            <tr>
              <th align="left">Date</th>
              <th align="left">Client</th>
              <th align="left">Interaction</th>
              <th align="left">Notes</th>
              <th align="left">Status</th>
            </tr>
          </thead>

          <tbody>
            {logs.length > 0 ? (
              logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    {new Date(log.created_at).toLocaleDateString()}
                  </td>
                  <td>{log.client_name}</td>
                  <td>{log.interaction_type}</td>
                  <td>{log.notes}</td>
                  <td>{log.status}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5">
                  No interaction logs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InteractionLog;