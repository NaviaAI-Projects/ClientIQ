import React, { useEffect, useState } from 'react';
import api from '../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const MyPerformance = () => {
  const [stats, setStats] = useState({
    clients: 0,
    leads: 0,
    interactions: 0
  });

  const [monthlyTrend, setMonthlyTrend] = useState([]);

  useEffect(() => {
    loadPerformance();
  }, []);

  const loadPerformance = async () => {
    try {

      const [clientsRes, leadsRes, logsRes] = await Promise.all([
        api.get('/clients/my/clients'),
        api.get('/leads/my'),
        api.get('/contact-logs'),
        api.get('/reports/monthly-brokerage').then(r => setMonthlyTrend(r.data)).catch(console.error)
      ]);

      setStats({
        clients: clientsRes.data.length || 0,
        leads: leadsRes.data.length || 0,
        interactions: logsRes.data.length || 0
      });

    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ padding: '30px' }}>
      <h2>My Performance</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        RM performance summary
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '20px'
        }}
      >
        <div
          style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '10px'
          }}
        >
          <h3>Clients</h3>
          <h1>{stats.clients}</h1>
        </div>

        <div
          style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '10px'
          }}
        >
          <h3>Assigned Leads</h3>
          <h1>{stats.leads}</h1>
        </div>

        <div
          style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '10px'
          }}
        >
          <h3>Interactions</h3>
          <h1>{stats.interactions}</h1>
        </div>
      </div>
      {monthlyTrend.length > 0 && (
  <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', marginTop: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
    <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#223872', marginBottom: '16px' }}>My Revenue Trend</h3>
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={monthlyTrend}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E6EBF2" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="brokerage" name="Brokerage" fill="#223872" radius={[4,4,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
)}
    </div>
  );
};

export default MyPerformance;