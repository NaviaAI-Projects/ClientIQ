import React, { useEffect, useState } from 'react';
import api from '../api';

const AssignedLeads = () => {
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      const res = await api.get('/leads/my');
      setLeads(res.data);
    } catch (err) {
      console.error(err);
      alert('Failed to load assigned leads');
    }
  };

  return (
    <div>
      <div className="ph">
  <h2>Assigned Leads</h2>
  <p>Leads assigned to you based on AI scoring</p>
</div>

      <div className="panel">
  <div className="tw"><table>
    <thead><tr>
      <th>UCC</th>
              <th>Client Name</th>
              <th>Client Type</th>
              <th>Lead Score</th>
              <th>Churn Risk</th>
              <th>Expiry Date</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                  No leads assigned
                </td>
              </tr>
            ) : (
              leads.map(lead => (
                <tr key={lead.id} style={{ borderBottom: '1px solid #f1f1f1' }}>
                  <td style={{ padding: '10px' }}>{lead.ucc}</td>
                  <td style={{ padding: '10px' }}>{lead.client_name}</td>
                  <td style={{ padding: '10px' }}>{lead.client_type}</td>
                  <td style={{ padding: '10px' }}>{lead.lead_score}</td>
                  <td style={{ padding: '10px' }}>{lead.churn_risk_score}</td>
                  <td style={{ padding: '10px' }}>
                    {lead.assignment_expires_at
                      ? new Date(lead.assignment_expires_at).toLocaleDateString('en-IN')
                      : '-'}
                  </td>
                  <td style={{ padding: '10px' }}>{lead.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
};

export default AssignedLeads;