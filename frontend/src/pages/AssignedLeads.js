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
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>
        Assigned Leads
      </h2>

      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
        Leads assigned to you based on AI scoring
      </p>

      <div style={{
        background: 'white',
        borderRadius: '10px',
        padding: '20px',
        marginTop: '20px',
        border: '0.5px solid rgba(0,0,0,0.1)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '10px' }}>UCC</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Client Name</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Client Type</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Lead Score</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Churn Risk</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Expiry Date</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Status</th>
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
  );
};

export default AssignedLeads;