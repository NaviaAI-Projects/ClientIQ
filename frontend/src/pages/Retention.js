import React, { useEffect, useState } from 'react';
import api from '../api';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const Retention = () => {
  const [activeClients, setActiveClients] = useState([]);
  const [churnClients, setChurnClients]   = useState([]);
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/reports/client-activity-trend'),
      api.get('/reports/churn-risk')
    ]).then(([activeRes, churnRes]) => {
      setActiveClients(activeRes.data || []);
      setChurnClients(churnRes.data || []);
    }).catch(console.error)
    .finally(() => setLoading(false));
  }, []);

  // ch-ret-cohort — static from prototype (cohort analysis needs historical data)
  const cohortData = [
    { month: 'M1',  pct: 72, industry: 65 },
    { month: 'M2',  pct: 58, industry: 50 },
    { month: 'M3',  pct: 44, industry: 38 },
    { month: 'M4',  pct: 38, industry: 32 },
    { month: 'M5',  pct: 34, industry: 28 },
    { month: 'M6',  pct: 32, industry: 26 },
    { month: 'M7',  pct: 30, industry: 24 },
    { month: 'M8',  pct: 29, industry: 23 },
    { month: 'M9',  pct: 28, industry: 22 },
    { month: 'M10', pct: 27, industry: 21 },
    { month: 'M11', pct: 25, industry: 20 },
    { month: 'M12', pct: 22, industry: 18 },
  ];

  // ch-ret-reactiv — reactivated clients trend (static from prototype)
  const reactivData = activeClients.map((d, i) => ({
    month:       d.month,
    reactivated: [41,38,44,52,48,55,61,58,49,64,71,68][i] || 0,
    rm_assisted: [0, 0, 0, 8,12,18,22,24,20,28,34,31][i]  || 0,
  }));

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      <div className="ph">
        <h2>Retention & Cohorts</h2>
        <p>Client retention and monthly active trading analysis</p>
      </div>

      {/* ch-ret-active: Monthly active clients line */}
      <div className="panel">
        <div className="ptitle">Monthly Active Clients Trend</div>
        {activeClients.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No data yet — import trade files first</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={activeClients} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="active_clients" name="Monthly active clients"
                stroke="#185fa5" fill="rgba(24,95,165,0.08)"
                strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="tc2">
        {/* ch-ret-cohort: % still trading by month since acquisition */}
        <div className="panel">
          <div className="ptitle">Client Retention by Cohort Month — % Still Trading</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={cohortData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={v => v + '%'} />
              <Tooltip formatter={v => [v + '%']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="pct" name="% still trading"
                stroke="#185fa5" fill="rgba(24,95,165,0.08)"
                strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="industry" name="Industry avg"
                stroke="#9FE1CB" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ fontSize: '11px', color: 'var(--tx2)', marginTop: '6px' }}>
            Navia retains more clients than industry avg through M6 — RM mapping drives the gap.
          </div>
        </div>

        {/* ch-ret-reactiv: Reactivated clients stacked bar */}
        <div className="panel">
          <div className="ptitle">Monthly Client Reactivations — Total vs RM-Assisted</div>
          {reactivData.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={reactivData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="reactivated"  name="Reactivated clients"      fill="#9FE1CB" />
                <Bar dataKey="rm_assisted"  name="RM-assisted reactivations" fill="#185fa5" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* High Churn Risk Table */}
      <div className="panel">
        <div className="ptitle">High Churn Risk Clients (AI Score ≥ 60)</div>
        <p style={{ fontSize: '12px', color: 'var(--tx2)', marginBottom: '12px' }}>Run AI Rescore to update scores</p>
        {churnClients.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No high churn risk clients detected</div>
        ) : (
          <div className="tw"><table>
            <thead><tr>
              <th>Client</th><th>UCC</th><th>Type</th><th>Churn Risk</th><th>Lead Score</th><th>AI Notes</th>
            </tr></thead>
            <tbody>
              {churnClients.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: '500' }}>{c.name}</td>
                  <td>{c.ucc}</td>
                  <td>{c.client_type}</td>
                  <td><span className="ais h">{c.churn_risk_score}</span></td>
                  <td>{c.lead_score}</td>
                  <td style={{ fontSize: '12px', color: 'var(--tx2)' }}>{c.ai_notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
};

export default Retention;