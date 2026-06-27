import React, { useEffect, useState } from 'react';
import api from '../api';

const ToCallToday = () => {
  const [leads, setLeads]       = useState([]);
  const [calling, setCalling]   = useState(null); // tracks which UCC is being called

  useEffect(() => { loadLeads(); }, []);

  const loadLeads = async () => {
    try {
      const res = await api.get('/leads/my');
      setLeads(res.data);
    } catch (err) {
      console.error(err);
      alert('Failed to load leads');
    }
  };

  const handleCall = async (lead) => {
    setCalling(lead.ucc);
    try {
      await api.post('/calls/click-to-call', { ucc: lead.ucc });
      alert(`✅ Call initiated to ${lead.client_name}. Your phone will ring first, then the client.`);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      alert(`❌ Call failed: ${msg}`);
    } finally {
      setCalling(null);
    }
  };

  const getPriority = (score) => {
    if (score >= 70) return { label: 'High',   color: '#a32d2d', bg: '#fcebeb' };
    if (score >= 50) return { label: 'Medium', color: '#854f0b', bg: '#faeeda' };
    return               { label: 'Low',    color: '#3b6d11', bg: '#eaf3de' };
  };

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600' }}>To Call Today</h2>
      <p style={{ color: '#666', marginTop: '5px' }}>High priority clients requiring RM follow-up</p>

      <div style={{ background: '#fff', borderRadius: '10px', padding: '20px', marginTop: '20px', border: '1px solid #eee' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              {['UCC', 'Client Name', 'Lead Score', 'Priority', 'Action'].map(h => (
                <th key={h} align="left" style={{ padding: '10px', fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: '20px', color: '#888', textAlign: 'center' }}>
                  No clients to call today
                </td>
              </tr>
            ) : (
              leads.map((lead) => {
                const priority  = getPriority(lead.lead_score);
                const isCalling = calling === lead.ucc;
                return (
                  <tr key={lead.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '12px 10px', fontSize: '13px', color: '#555' }}>{lead.ucc}</td>
                    <td style={{ padding: '12px 10px', fontSize: '13px', fontWeight: '600' }}>{lead.client_name}</td>
                    <td style={{ padding: '12px 10px', fontSize: '13px' }}>
                      <span style={{ background: '#f0f4ff', color: '#223872', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                        {lead.lead_score}
                      </span>
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <span style={{ background: priority.bg, color: priority.color, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                        {priority.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <button
                        onClick={() => handleCall(lead)}
                        disabled={isCalling}
                        style={{
                          background: isCalling ? '#94a3b8' : '#223872',
                          color: '#fff', border: 'none',
                          padding: '6px 14px', borderRadius: '5px',
                          cursor: isCalling ? 'not-allowed' : 'pointer',
                          fontSize: '12px', fontWeight: '500'
                        }}
                      >
                        {isCalling ? '⏳ Calling...' : '📞 Call Client'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ToCallToday;