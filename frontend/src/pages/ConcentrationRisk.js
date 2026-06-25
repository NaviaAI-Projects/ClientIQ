import React, { useEffect, useState } from 'react';
import api from '../api';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const ConcentrationRisk = () => {
  const [concentration, setConcentration] = useState([]);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);

  const revenueModel = [
    { name: 'Options Clearing (40%)', value: 40, color: '#223872' },
    { name: 'Equity Brokerage (30%)', value: 30, color: '#0BA86D' },
    { name: 'Float Income (20%)', value: 20, color: '#AFA9EC' },
    { name: 'MTF Interest (10%)', value: 10, color: '#F5A524' },
  ];

  useEffect(() => {
    Promise.all([
      api.get('/reports/concentration'),
      api.get('/reports/monthly-brokerage')
    ]).then(([concRes, trendRes]) => {
      setConcentration(concRes.data);
      setTrend(trendRes.data);
    }).catch(console.error)
    .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#223872' }}>Concentration Risk</h1>
        <p style={{ fontSize: '13px', color: '#62708A', marginTop: '4px' }}>Revenue and client concentration monitoring</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

        {/* Revenue Concentration Bar */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#223872', marginBottom: '16px' }}>Cumulative % of Revenue by Top N Clients</h3>
          {concentration.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '13px' }}>No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={concentration}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6EBF2" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={v => [`${v}%`, '% of Revenue']} />
                <Bar dataKey="pct" name="% of Revenue" fill="#223872" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Revenue Model Doughnut */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#223872', marginBottom: '16px' }}>Revenue Model Mix</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={revenueModel} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${value}%`}>
                {revenueModel.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={v => [`${v}%`]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Brokerage Trend */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#223872', marginBottom: '16px' }}>Monthly Brokerage Trend</h3>
        {trend.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '13px' }}>No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E6EBF2" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="brokerage" name="Brokerage" stroke="#ED4D37" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default ConcentrationRisk;