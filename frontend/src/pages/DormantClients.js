import React, { useEffect, useState } from 'react';
import axios from 'axios';
import api from '../api';

const DormantClients = () => {
  const [clients, setClients] = useState([]);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const token = localStorage.getItem('token');

      const res = await api.get('/clients');

      const dormantClients = res.data.filter(
        c => c.status?.toLowerCase() === 'dormant'
      );

      setClients(dormantClients);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ padding: '30px' }}>
      <h2>Dormant Clients</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Clients requiring re-engagement
      </p>

      <div
        style={{
          background: '#fff',
          padding: '20px',
          borderRadius: '10px'
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse'
          }}
        >
          <thead>
            <tr>
              <th align="left">UCC</th>
              <th align="left">Client Name</th>
              <th align="left">Type</th>
              <th align="left">Status</th>
            </tr>
          </thead>

          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan="4" align="center">
                  No dormant clients
                </td>
              </tr>
            ) : (
              clients.map(client => (
                <tr key={client.ucc}>
                  <td>{client.ucc}</td>
                  <td>{client.name}</td>
                  <td>{client.client_type}</td>
                  <td>{client.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DormantClients;
