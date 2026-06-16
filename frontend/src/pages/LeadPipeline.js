import React, { useEffect, useState } from 'react';
import api from '../api';

const LeadPipeline = () => {
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    api.get('/leads?status=assigned').then(res => setLeads(res.data || [])).catch(console.error);
  }, []);

  return (
    <div>
      <h2>Lead Pipeline</h2>
      <p style={{ color: '#666' }}>Supervisor view of assigned leads</p>

      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th>UCC</th>
              <th>Client</th>
              <th>Score</th>
              <th>Assigned RM</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(l => (
              <tr key={l.id}>
                <td>{l.ucc}</td>
                <td>{l.name}</td>
                <td>{l.lead_score}</td>
                <td>{l.rm_name || '-'}</td>
                <td>{l.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const styles = {
  card: { background: '#fff', padding: 20, borderRadius: 10, marginTop: 20 },
  table: { width: '100%', borderCollapse: 'collapse' }
};

export default LeadPipeline;