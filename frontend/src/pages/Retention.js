import React, { useEffect, useState } from 'react';
import api from '../api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const Retention = () => {
  const [activeClients, setActiveClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/client-activity-trend')
      .then(res => setActiveClients(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#223872' }}>Retention & Cohorts</h1>
        <p style={{ fontSize: '13px', color: '#62708A', marginTop: '4px' }}>Client retention and monthly active trading analysis</p>
      </div>

      {/* Active Clients Trend */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#223872', marginBottom: '16px' }}>Monthly Active Clients Trend</h3>
        {activeClients.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '13px' }}>No data yet — import trade files first</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={activeClients}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E6EBF2" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="active_clients" name="Active Clients" stroke="#223872" strokeWidth={2} fill="#EDEFF6" dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Churn risk clients from AI scores */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#223872', marginBottom: '16px' }}>High Churn Risk Clients</h3>
        <p style={{ fontSize: '12px', color: '#62708A', marginBottom: '12px' }}>Clients with AI churn risk score ≥ 60 — run AI Rescore to update</p>
        <ChurnRiskTable />
      </div>
    </div>
  );
};

const ChurnRiskTable = () => {
  const [clients, setClients] = useState([]);
  useEffect(() => {
    api.get('/reports/churn-risk').then(r => setClients(r.data)).catch(console.error);
  }, []);

  if (clients.length === 0) return <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No high churn risk clients detected</div>;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #E6EBF2' }}>
          {['Client', 'UCC', 'Type', 'Churn Risk', 'Lead Score', 'AI Notes'].map(h => (
            <th key={h} style={{ textAlign: 'left', padding: '10px', color: '#62708A', fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {clients.map((c, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #F1F4F9' }}>
            <td style={{ padding: '10px', fontWeight: '500' }}>{c.name}</td>
            <td style={{ padding: '10px', color: '#62708A' }}>{c.ucc}</td>
            <td style={{ padding: '10px' }}>{c.client_type}</td>
            <td style={{ padding: '10px' }}>
              <span style={{ background: '#FDECEC', color: '#C8313B', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                {c.churn_risk_score}
              </span>
            </td>
            <td style={{ padding: '10px' }}>{c.lead_score}</td>
            <td style={{ padding: '10px', color: '#62708A', fontSize: '12px' }}>{c.ai_notes || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default Retention;