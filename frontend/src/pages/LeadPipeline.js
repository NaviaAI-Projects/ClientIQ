import React, { useEffect, useState } from 'react';
import api from '../api';

const LeadPipeline = () => {
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    api.get('/leads?status=assigned').then(res => setLeads(res.data || [])).catch(console.error);
  }, []);

  return (
    <div>
      <div className="ph">
  <h2>Lead Pipeline</h2>
  <p>All active leads across all RMs</p>
</div>
<div className="panel">
  <div className="tw">
    <table>
          <thead>
            <tr>
              <th>UCC</th>
              <th>Client</th>
              <th>Score</th>
              <th>Assigned RM</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(l => (
              <tr key={l.id}>
                <td>{l.ucc}</td>
                <td>{l.name}</td>
                <td>{l.lead_score}</td>
                <td>{l.rm_name || '-'}</td>
                <td>{l.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
};

export default LeadPipeline;