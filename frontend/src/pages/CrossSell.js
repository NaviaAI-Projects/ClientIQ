import React, { useEffect, useState } from 'react';
import api from '../api';

const CrossSell = () => {
  const [clients, setClients] = useState([]);

  useEffect(() => {
    api.get('/clients').then(res => setClients(res.data.clients || [])).catch(console.error);
  }, []);

  return (
    <div>
      <div className="ph">
        <h2>Cross-sell Opportunities</h2>
        <p>AI-identified revenue expansion for your mapped clients</p>
      </div>
      <div className="alert a-i">
        AI analyses trading patterns, MTF eligibility, NRI status, and holding values to generate these signals.
      </div>
      <div className="panel">
        <div className="tw"><table>
          <thead><tr>
            <th>UCC</th><th>Client Name</th><th>Plan</th><th>Opportunity</th>
          </tr></thead>
          <tbody>
            {clients.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', color: '#888', padding: '20px' }}>No opportunities available</td></tr>
            ) : clients.map(c => (
              <tr key={c.ucc}>
                <td>{c.ucc}</td>
                <td style={{ fontWeight: '500' }}>{c.name}</td>
                <td><span className="badge b-zero">{c.plan}</span></td>
                <td><span className="badge b-lead">MTF Activation</span></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

export default CrossSell;