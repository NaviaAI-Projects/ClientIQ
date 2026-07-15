import React, { useEffect, useState } from 'react';
import api from '../api';

const MappingApprovals = () => {
  const [leads, setLeads] = useState([]);
  const [rms, setRms] = useState([]);
  const [selectedRM, setSelectedRM] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [leadsRes, rmsRes] = await Promise.all([
        api.get('/leads/mapping-pool'),
        api.get('/leads/rm-list')
      ]);
      setLeads(leadsRes.data || []);
      setRms(rmsRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (ucc) => {
    const rm_id = selectedRM[ucc];
    if (!rm_id) {
      alert('Please select an RM before approving');
      return;
    }
    try {
      await api.post('/leads/approve-mapping', { ucc, rm_id });
      setActionMsg(`Client ${ucc} successfully mapped to RM`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Approval failed');
    }
  };

  const handleReject = async (ucc) => {
    if (!window.confirm('Reject this mapping request?')) return;
    try {
      await api.post('/leads/reject-mapping', { ucc });
      setActionMsg(`Mapping request for ${ucc} rejected`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Rejection failed');
    }
  };

  const th = {
    textAlign: 'left', padding: '10px 14px',
    fontSize: '10px', fontWeight: '600', color: '#888',
    textTransform: 'uppercase', letterSpacing: '0.4px',
    borderBottom: '0.5px solid rgba(0,0,0,0.1)'
  };
  const td = { padding: '12px 14px', fontSize: '13px', borderBottom: '0.5px solid rgba(0,0,0,0.05)' };

  return (
    <div>
      <div className="ph">
  <h2>Mapping Approvals</h2>
  <p>Approve AI-identified leads and assign to an RM</p>
</div>
{actionMsg && <div className="alert a-s">✓ {actionMsg}</div>}
<div className="panel">

      <div style={{
        background: 'white', borderRadius: '12px',
        border: '0.5px solid rgba(0,0,0,0.1)', overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>
        ) : leads.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
            No pending mapping approvals. Run AI Rescore to generate leads.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={th}>Client</th>
                <th style={th}>UCC</th>
                <th style={th}>Type</th>
                <th style={th}>Lead Score</th>
                <th style={th}>Churn Risk</th>
                <th style={th}>AI Notes</th>
                <th style={th}>Assign RM</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id}>
                  <td style={{ ...td, fontWeight: '500' }}>{lead.client_name}</td>
                  <td style={{ ...td, color: '#555' }}>{lead.ucc}</td>
                  <td style={td}>{lead.client_type}</td>
                  <td style={td}>
                    <span className={`ais ${lead.lead_score >= 70 ? 'h' : lead.lead_score >= 50 ? 'm' : 'l'}`}>
  {lead.lead_score}
</span>
                  </td>
                  <td style={td}>{lead.churn_risk_score}</td>
                  <td style={{ ...td, color: '#555', maxWidth: '200px', fontSize: '12px' }}>
                    {lead.ai_notes || '-'}
                  </td>
                  <td style={td}>
                    <select
                      value={selectedRM[lead.ucc] || ''}
                      onChange={e => setSelectedRM(prev => ({ ...prev, [lead.ucc]: e.target.value }))}
                      style={{
                        padding: '6px 10px', border: '0.5px solid rgba(0,0,0,0.2)',
                        borderRadius: '6px', fontSize: '12px', minWidth: '140px'
                      }}
                    >
                      <option value=''>Select RM</option>
                      {rms.map(rm => (
                        <option key={rm.rm_id} value={rm.rm_id}>
                          {rm.name} ({rm.assigned_clients}/{rm.capacity})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={td}>
                    <button className="btn bp sm" onClick={() => handleApprove(lead.ucc)}>Approve</button>
<button className="btn bd sm" onClick={() => handleReject(lead.ucc)}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </div>
  );
};

export default MappingApprovals;