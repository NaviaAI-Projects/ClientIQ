import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const AssignedLeads = () => {
  const [leads, setLeads]   = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadLeads(); }, []);

  const loadLeads = async () => {
    setLoading(true);
    try {
      const res = await api.get('/leads/my');
      setLeads(res.data || []);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  const getScoreBadge = (score) => {
    if (score >= 70) return { bg: '#fcebeb', color: '#a32d2d', label: 'High' };
    if (score >= 50) return { bg: '#faeeda', color: '#854f0b', label: 'Medium' };
    return { bg: '#e8f3ff', color: '#185fa5', label: 'Low' };
  };

  const th = { textAlign: 'left', padding: '10px 14px', fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', borderBottom: '1px solid #eee', background: '#fafafa' };
  const td = { padding: '12px 14px', fontSize: '13px', borderBottom: '1px solid #f5f5f5' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
        <button onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#223872', fontSize: '13px', fontWeight: '500' }}>
          ← Back
        </button>
      </div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>Assigned Leads</h2>
      <p style={{ color: '#666', marginTop: '4px', marginBottom: '20px', fontSize: '13px' }}>
        Leads assigned to you based on AI scoring
      </p>

      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', fontSize: '14px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
          <span>⭐ My Leads</span>
          <span style={{ background: '#e8f3ff', color: '#185fa5', padding: '2px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>
            {leads.length} leads
          </span>
        </div>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={th}>Client</th>
                <th style={th}>UCC</th>
                <th style={th}>Type</th>
                <th style={th}>Lead Score</th>
                <th style={th}>Churn Risk</th>
                <th style={th}>Expires</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '30px', textAlign: 'center', color: '#888' }}>No leads assigned yet</td></tr>
              ) : (
                leads.map(lead => {
                  const badge = getScoreBadge(lead.lead_score);
                  return (
                    <tr key={lead.id}>
                      <td style={{ ...td, fontWeight: '600' }}>{lead.client_name}</td>
                      <td style={{ ...td, color: '#555' }}>{lead.ucc}</td>
                      <td style={td}>{lead.client_type}</td>
                      <td style={td}>
                        <span style={{ background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                          {lead.lead_score} · {badge.label}
                        </span>
                      </td>
                      <td style={td}>{lead.churn_risk_score}</td>
                      <td style={{ ...td, color: '#888', fontSize: '12px' }}>
                        {lead.assignment_expires_at ? new Date(lead.assignment_expires_at).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td style={td}>
                        <button onClick={() => navigate('/client-360')}
                          style={{ padding: '4px 10px', background: '#223872', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', marginRight: '6px' }}>
                          View 360
                        </button>
                        <button onClick={() => navigate('/contact-log')}
                          style={{ padding: '4px 10px', background: 'white', color: '#223872', border: '1px solid #223872', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>
                          Log
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AssignedLeads;