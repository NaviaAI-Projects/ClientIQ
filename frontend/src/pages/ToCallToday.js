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
    <>
    <div className="ph">
  <h2>To Call Today</h2>
  <p>AI-prioritised outreach list — click-to-call enabled</p>
</div>
<div className="panel">
  <div className="tw"><table>
    <thead><tr>
      <th>UCC</th><th>Client Name</th><th>Lead Score</th><th>Priority</th><th>Action</th>
    </tr></thead>
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
                      <span className="ais h">{lead.lead_score}</span>
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <span className={`badge ${priority.label === 'High' ? 'b-dor' : priority.label === 'Medium' ? 'b-pend' : 'b-act'}`}>
  {priority.label}
</span>
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <button className={`btn ${isCalling ? '' : 'bp'} sm`} onClick={() => handleCall(lead)} disabled={isCalling}>
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
    </>
  );
};

export default ToCallToday;