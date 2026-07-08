import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const FMT = v => {
  if (!v || v === 0) return '₹0';
  if (v >= 1000000) return '₹' + (v/100000).toFixed(0) + 'L';
  if (v >= 100000)  return '₹' + (v/100000).toFixed(1) + 'L';
  if (v >= 1000)    return '₹' + (v/1000).toFixed(0) + 'K';
  return '₹' + v;
};

const UnmapRequests = () => {
  const [rmRequests, setRmRequests]   = useState([]);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [actionMsg, setActionMsg]     = useState('');
  const [processing, setProcessing]   = useState(null);
  const navigate = useNavigate();

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rmRes, aiRes] = await Promise.all([
        api.get('/leads/unmap-requests'),
        api.get('/leads/ai-unmap-suggestions')
      ]);
      setRmRequests(rmRes.data  || []);
      setAiSuggestions(aiRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (ucc, request_id = null) => {
    if (!window.confirm(`Approve unmap for ${ucc}? This will free the RM's capacity slot and stop revenue attribution.`)) return;
    setProcessing(ucc);
    try {
      const res = await api.post('/leads/approve-unmap', { ucc, request_id });
      setActionMsg({ type: 'success', text: res.data.message });
      fetchData();
    } catch (err) {
      setActionMsg({ type: 'error', text: err.response?.data?.message || 'Approve failed' });
    } finally {
      setProcessing(null);
      setTimeout(() => setActionMsg(''), 4000);
    }
  };

  const handleReject = async (ucc, request_id = null) => {
    setProcessing(ucc + '_reject');
    try {
      const res = await api.post('/leads/reject-unmap', { ucc, request_id });
      setActionMsg({ type: 'success', text: res.data.message });
      fetchData();
    } catch (err) {
      setActionMsg({ type: 'error', text: err.response?.data?.message || 'Reject failed' });
    } finally {
      setProcessing(null);
      setTimeout(() => setActionMsg(''), 4000);
    }
  };

  const daysSince = (date) => {
    if (!date) return '—';
    const d = Math.floor((Date.now() - new Date(date)) / 86400000);
    return d + ' days ago';
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      {/* Header — exact prototype */}
      <div className="ph">
        <h2>Unmap requests</h2>
        <p>RM-requested and AI-suggested unmaps pending supervisor decision</p>
      </div>

      {/* Alert — exact prototype */}
      <div className="alert a-w">
        Approved unmaps free RM capacity slots. Revenue attribution stops from the unmap date.
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className={`alert ${actionMsg.type === 'success' ? 'a-s' : 'a-d'}`}>
          {actionMsg.text}
        </div>
      )}

      <div className="panel">

        {/* Section 1 — RM-requested unmaps */}
        <div className="slbl">RM-requested unmaps</div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>UCC</th>
                <th>Client</th>
                <th>RM</th>
                <th>Reason</th>
                <th>Mapped since</th>
                <th>Revenue (6M)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rmRequests.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '24px', textAlign: 'center', color: 'var(--tx3)', fontSize: '13px' }}>
                    No RM-requested unmaps pending
                  </td>
                </tr>
              ) : rmRequests.map((r, i) => (
                <tr key={i}>
                  <td>
                    <span className="lc" onClick={() => navigate('/client-360', { state: { ucc: r.ucc } })}>
                      {r.ucc}
                    </span>
                  </td>
                  <td style={{ fontWeight: '500' }}>{r.client_name}</td>
                  <td>{r.rm_name}</td>
                  <td style={{ fontSize: '12px', color: 'var(--tx2)', maxWidth: '200px' }}>{r.reason || '—'}</td>
                  <td style={{ fontSize: '12px', color: 'var(--tx3)' }}>
                    {r.mapped_since ? new Date(r.mapped_since).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : daysSince(r.created_at)}
                  </td>
                  <td style={{ color: parseFloat(r.revenue_6m) === 0 ? 'var(--dc)' : 'var(--sc)', fontWeight: '600' }}>
                    {parseFloat(r.revenue_6m) === 0 ? '₹0 last 6 months' : FMT(r.revenue_6m)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        className="btn sm bs"
                        disabled={processing === r.ucc}
                        onClick={() => handleApprove(r.ucc, r.id)}
                      >
                        {processing === r.ucc ? '...' : 'Approve'}
                      </button>
                      <button
                        className="btn sm bd"
                        disabled={processing === r.ucc + '_reject'}
                        onClick={() => handleReject(r.ucc, r.id)}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Section 2 — AI-suggested unmaps */}
        <div className="slbl" style={{ marginTop: '20px' }}>AI-suggested unmaps</div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>UCC</th>
                <th>Client</th>
                <th>Type</th>
                <th>RM</th>
                <th>AI rationale</th>
                <th>Churn risk</th>
                <th>Interactions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {aiSuggestions.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: '24px', textAlign: 'center', color: 'var(--tx3)', fontSize: '13px' }}>
                    No AI-suggested unmaps — run AI Rescore to update
                  </td>
                </tr>
              ) : aiSuggestions.map((s, i) => (
                <tr key={i}>
                  <td>
                    <span className="lc" onClick={() => navigate('/client-360', { state: { ucc: s.ucc } })}>
                      {s.ucc}
                    </span>
                  </td>
                  <td style={{ fontWeight: '500' }}>{s.client_name}</td>
                  <td>
                    <span className={`badge ${s.client_type?.toLowerCase().includes('nri') ? 'b-nri' : s.client_type?.toLowerCase().includes('hv') ? 'b-hv' : 'b-ri'}`}>
                      {s.client_type}
                    </span>
                  </td>
                  <td>{s.rm_name}</td>
                  <td style={{ fontSize: '12px', color: 'var(--tx2)', maxWidth: '240px' }}>
                    {s.ai_rationale || `Churn risk ${s.churn_risk_score}. Low engagement detected.`}
                  </td>
                  <td>
                    <span className="ais h">{s.churn_risk_score}</span>
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--tx3)' }}>
                    {s.interaction_count || 0} interactions
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        className="btn sm bs"
                        disabled={processing === s.ucc}
                        onClick={() => handleApprove(s.ucc)}
                      >
                        {processing === s.ucc ? '...' : 'Approve'}
                      </button>
                      <button
                        className="btn sm bd"
                        disabled={processing === s.ucc + '_reject'}
                        onClick={() => handleReject(s.ucc)}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};

export default UnmapRequests;