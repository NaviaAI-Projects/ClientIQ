import React, { useEffect, useState } from 'react';
import api from '../api';

const UnmappedPool = () => {
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    api.get('/leads?status=unassigned').then(res => setLeads(res.data || [])).catch(console.error);
  }, []);

  return (
    <div>
      <div className="ph">
        <h2>Unmapped Client Pool</h2>
        <p>AI-ranked clients with highest potential for RM mapping</p>
      </div>
      <div className="alert a-i">
        Clients scoring above threshold. Run AI Rescore to refresh rankings.
      </div>
      <div className="panel">
        <div className="tw"><table>
          <thead><tr>
            <th>UCC</th><th>Client Name</th><th>Type</th><th>Lead Score</th><th>Churn Risk</th><th>AI Notes</th>
          </tr></thead>
          <tbody>
            {leads.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No unassigned leads — run AI Rescore first</td></tr>
            ) : leads.map(l => (
              <tr key={l.id}>
                <td>{l.ucc}</td>
                <td style={{ fontWeight: '500' }}>{l.name}</td>
                <td><span className="badge b-ri">{l.client_type}</span></td>
                <td><span className={`ais ${l.lead_score >= 70 ? 'h' : l.lead_score >= 50 ? 'm' : 'l'}`}>{l.lead_score}</span></td>
                <td>{l.churn_risk_score}</td>
                <td style={{ fontSize: '12px', color: 'var(--tx2)' }}>{l.ai_notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

export default UnmappedPool;