import React, { useEffect, useState } from 'react';
import axios from 'axios';

const CrossSell = () => {
  const [clients, setClients] = useState([]);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const token = localStorage.getItem('token');

      const res = await axios.get(
        'http://localhost:5000/api/clients',
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setClients(res.data.clients || []);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ padding: '30px' }}>
      <h2>Cross-sell Opportunities</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Clients eligible for additional products
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
              <th align="left">Plan</th>
              <th align="left">Opportunity</th>
            </tr>
          </thead>

          <tbody>
            {clients.length > 0 ? (
              clients.map(client => (
                <tr key={client.ucc}>
                  <td>{client.ucc}</td>
                  <td>{client.name}</td>
                  <td>{client.plan}</td>
                  <td>MTF Activation</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" align="center">
                  No opportunities available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CrossSell;