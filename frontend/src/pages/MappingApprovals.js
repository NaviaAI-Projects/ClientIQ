import React, { useEffect, useState } from 'react';
import api from '../api';

const MappingApprovals = () => {
  const [leads, setLeads]         = useState([]);
  const [rms, setRms]             = useState([]);
  const [selectedRM, setSelectedRM] = useState({});
  const [loading, setLoading]     = useState(true);

  // Filters
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [scoreFilter, setScoreFilter] = useState('');

  useEffect(() => { fetchData(); }, []);

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
    if (!rm_id) { alert('Please select an RM before approving'); return; }
    try {
      const lead = leads.find(l => l.ucc === ucc);
      const rm   = rms.find(r => String(r.rm_id) === String(rm_id));
      await api.post('/leads/approve-mapping', { ucc, rm_id });
      alert(`✅ Client ${lead?.client_name || ucc} has been successfully mapped to ${rm?.name || 'RM'}.`);
      fetchData();
    } catch (err) {
      alert(`❌ Mapping failed: ${err.response?.data?.message || 'Please try again.'}`);
    }
  };

  const handleReject = async (ucc) => {
    if (!window.confirm('Reject this mapping request?')) return;
    try {
      await api.post('/leads/reject-mapping', { ucc });
      alert(`✅ Mapping request for ${ucc} has been rejected.`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Rejection failed');
    }
  };

  // Apply filters client-side
  const filtered = leads.filter(lead => {
    const matchSearch = !search ||
      lead.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      lead.ucc?.toLowerCase().includes(search.toLowerCase());

    const matchType = !typeFilter || lead.client_type === typeFilter;

    const matchScore = !scoreFilter ||
      (scoreFilter === 'high'   && lead.lead_score >= 70) ||
      (scoreFilter === 'medium' && lead.lead_score >= 50 && lead.lead_score < 70) ||
      (scoreFilter === 'low'    && lead.lead_score < 50);

    return matchSearch && matchType && matchScore;
  });

  const hasFilters = search || typeFilter || scoreFilter;

  // Unique client types from current leads
  const clientTypes = [...new Set(leads.map(l => l.client_type).filter(Boolean))];

  return (
    <div>
      <div className="ph">
        <h2>Mapping Approvals</h2>
        <p>Approve AI-identified leads and assign to an RM</p>
      </div>

      {/* Filters */}
      <div className="panel" style={{ marginBottom: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
          <div className="fgrp">
            <label>Search</label>
            <input
              type="text"
              placeholder="Search by UCC or client name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="fgrp">
            <label>Client Type</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {clientTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="fgrp">
            <label>Lead Score</label>
            <select value={scoreFilter} onChange={e => setScoreFilter(e.target.value)}>
              <option value="">All scores</option>
              <option value="high">High (≥ 70)</option>
              <option value="medium">Medium (50–69)</option>
              <option value="low">Low (&lt; 50)</option>
            </select>
          </div>
          {hasFilters && (
            <button
              className="btn sm"
              style={{ marginBottom: '1px' }}
              onClick={() => { setSearch(''); setTypeFilter(''); setScoreFilter(''); }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Results count */}
        {!loading && leads.length > 0 && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--tx2)' }}>
            Showing {filtered.length} of {leads.length} pending approvals
            {hasFilters && filtered.length === 0 && (
              <span style={{ color: 'var(--dc)', marginLeft: '8px' }}>
                — no results match your filters
              </span>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="panel">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx3)' }}>Loading...</div>
        ) : leads.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx3)', fontSize: '13px' }}>
            No pending mapping approvals — run AI Rescore to generate leads.
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx3)', fontSize: '13px' }}>
            No leads match your filters — try clearing them.
          </div>
        ) : (
          <div className="tw"><table>
            <thead><tr>
              <th>Client</th>
              <th>UCC</th>
              <th>Type</th>
              <th>Lead Score</th>
              <th>Churn Risk</th>
              <th>AI Notes</th>
              <th>Assign RM</th>
              <th>Action</th>
            </tr></thead>
            <tbody>
              {filtered.map(lead => (
                <tr key={lead.id}>
                  <td style={{ fontWeight: '500' }}>{lead.client_name}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--tx2)' }}>{lead.ucc}</td>
                  <td>
                    <span className={`badge ${
                      ['nri','nre','nro'].some(t => lead.client_type?.toLowerCase().includes(t))
                        ? 'b-nri'
                        : lead.client_type?.toLowerCase().includes('hv')
                        ? 'b-hv'
                        : 'b-ri'
                    }`}>
                      {lead.client_type}
                    </span>
                  </td>
                  <td>
                    <span className={`ais ${lead.lead_score >= 70 ? 'h' : lead.lead_score >= 50 ? 'm' : 'l'}`}>
                      {lead.lead_score}
                    </span>
                  </td>
                  <td>
                    <span className={`ais ${lead.churn_risk_score >= 70 ? 'h' : lead.churn_risk_score >= 50 ? 'm' : 'l'}`}>
                      {lead.churn_risk_score}
                    </span>
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--tx2)', maxWidth: '200px' }}>
                    {lead.ai_notes || '-'}
                  </td>
                  <td>
                    <select
                      value={selectedRM[lead.ucc] || ''}
                      onChange={e => setSelectedRM(prev => ({ ...prev, [lead.ucc]: e.target.value }))}
                    >
                      <option value=''>Select RM</option>
                      {rms.map(rm => (
                        <option key={rm.rm_id} value={rm.rm_id}>
                          {rm.name} ({rm.assigned_clients}/{rm.capacity})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn bp sm" onClick={() => handleApprove(lead.ucc)}>Approve</button>
                      <button className="btn bd sm" onClick={() => handleReject(lead.ucc)}>Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
};

export default MappingApprovals;