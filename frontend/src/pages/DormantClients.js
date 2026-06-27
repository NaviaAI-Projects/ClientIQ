import React, { useEffect, useState } from 'react';
import api from '../api';

const DormantClients = () => {
  const [clients, setClients] = useState([]);

  useEffect(() => {
    api.get('/reports/inactive-clients')
      .then(res => setClients(res.data || []))
      .catch(console.error);
  }, []);

  return (
    <div>
      <div className="ph">
        <h2>Dormant Mapped Clients</h2>
        <p>Clients with no trade in 30+ days who previously traded at least monthly</p>
      </div>
      <div className="alert a-d">
        AI flags clients showing declining trading patterns. Contact this week to prevent revenue loss.
      </div>
      <div className="panel">
        <div className="tw"><table>
          <thead><tr>
            <th>UCC</th><th>Name</th><th>Type</th><th>Last Trade</th><th>Days Inactive</th><th>Status</th>
          </tr></thead>
          <tbody>
            {clients.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No dormant clients</td></tr>
            ) : clients.map(c => (
              <tr key={c.ucc}>
                <td>{c.ucc}</td>
                <td style={{ fontWeight: '500' }}>{c.name}</td>
                <td><span className={`badge b-${c.client_type?.toLowerCase() === 'nri' ? 'nri' : 'ri'}`}>{c.client_type}</span></td>
                <td>{c.last_trade_date ? new Date(c.last_trade_date).toLocaleDateString('en-IN') : '-'}</td>
                <td>{c.days_inactive || '-'}</td>
                <td><span className="badge b-dor">Dormant</span></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

export default DormantClients;