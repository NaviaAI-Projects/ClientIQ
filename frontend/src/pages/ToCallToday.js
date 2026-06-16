import React, { useEffect, useState } from 'react';
import api from '../api';

const ToCallToday = () => {

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
      alert('Failed to load leads');
    }
  };

  return (
    <div>

      <h2 style={{ fontSize: '18px', fontWeight: '600' }}>
        To Call Today
      </h2>

      <p style={{ color: '#666', marginTop: '5px' }}>
        High priority clients requiring RM follow-up
      </p>

      <div
        style={{
          background: '#fff',
          borderRadius: '10px',
          padding: '20px',
          marginTop: '20px',
          border: '1px solid #eee'
        }}
      >

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse'
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <th align="left">UCC</th>
              <th align="left">Client Name</th>
              <th align="left">Lead Score</th>
              <th align="left">Priority</th>
              <th align="left">Action</th>
            </tr>
          </thead>

          <tbody>

            {leads.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: '20px' }}>
                  No clients to call today
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id}>
                  <td style={{ padding: '10px' }}>
                    {lead.ucc}
                  </td>

                  <td style={{ padding: '10px' }}>
                    {lead.client_name}
                  </td>

                  <td style={{ padding: '10px' }}>
                    {lead.lead_score}
                  </td>

                  <td style={{ padding: '10px' }}>
                    {lead.lead_score >= 70
                      ? 'High'
                      : lead.lead_score >= 50
                      ? 'Medium'
                      : 'Low'}
                  </td>

                  <td style={{ padding: '10px' }}>
                    <button
                      style={{
                        background: '#185fa5',
                        color: '#fff',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '5px',
                        cursor: 'pointer'
                      }}
                      onClick={() =>
                        alert(
                          `Call recommendation generated for ${lead.client_name}`
                        )
                      }
                    >
                      Call Client
                    </button>
                  </td>
                </tr>
              ))
            )}

          </tbody>
        </table>

      </div>

    </div>
  );
};

export default ToCallToday;