import React, { useEffect, useState } from 'react';
import axios from 'axios';

const RevenueTracker = () => {
  const [clients, setClients] = useState([]);

  useEffect(() => {
    loadRevenue();
  }, []);

  const loadRevenue = async () => {
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

  const calculateRevenue = client => {
    const holdings = Number(client.latest_holdings || 0);
    const ledger = Number(client.latest_balance || 0);

    return ((holdings * 0.002) + (ledger * 0.01)).toFixed(2);
  };

  return (
    <div style={{ padding: '30px' }}>
      <h2>Revenue Tracker</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Estimated revenue contribution by clients
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
              <th align="left">Holdings</th>
              <th align="left">Ledger Balance</th>
              <th align="left">Estimated Revenue</th>
            </tr>
          </thead>

          <tbody>
            {clients.map(client => (
              <tr key={client.ucc}>
                <td>{client.ucc}</td>
                <td>{client.name}</td>
                <td>{client.latest_holdings}</td>
                <td>{client.latest_balance}</td>
                <td>₹ {calculateRevenue(client)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RevenueTracker;