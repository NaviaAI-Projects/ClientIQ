import React, { useEffect, useState } from 'react';
import api from '../api';

const AllClients = () => {
  const [clients, setClients] = useState([]);

  useEffect(() => {
    api.get('/clients').then(res => setClients(res.data.clients || [])).catch(console.error);
  }, []);

  return (
    <div>
      <h2>All 20,000 Clients</h2>
      <p style={{ color: '#666' }}>Complete client universe</p>

      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th>UCC</th>
              <th>Name</th>
              <th>Type</th>
              <th>Plan</th>
              <th>Mapped RM</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.ucc}>
                <td>{c.ucc}</td>
                <td>{c.name}</td>
                <td>{c.client_type}</td>
                <td>{c.plan}</td>
                <td>{c.rm_name || '-'}</td>
                <td>
                  <span style={{
                    padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                    background: c.status === 'Active' ? '#eaf3de' : c.status === 'Suspended' ? '#fcebeb' : '#faeeda',
                    color: c.status === 'Active' ? '#3b6d11' : c.status === 'Suspended' ? '#a32d2d' : '#854f0b'
                  }}>
                    {c.status || (c.is_active ? 'Active' : 'Inactive')}
                  </span>
                </td>
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

export default AllClients;