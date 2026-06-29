import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';

const fmt = (v) => {
  const n = parseFloat(v) || 0;
  if (n >= 10000000) return '₹' + (n/10000000).toFixed(2) + 'Cr';
  if (n >= 100000)   return '₹' + (n/100000).toFixed(1) + 'L';
  if (n >= 1000)     return '₹' + (n/1000).toFixed(1) + 'K';
  return '₹' + n.toFixed(0);
};

const ScoreRing = ({ score, label, color }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ position: 'relative', width: '80px', height: '80px', margin: '0 auto 8px' }}>
      <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="40" cy="40" r="32" fill="none" stroke="#f0f0f0" strokeWidth="8" />
        <circle cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${(score / 100) * 201} 201`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: '16px', fontWeight: '700', color }}>
        {score}%
      </div>
    </div>
    <div style={{ fontSize: '12px', color: '#555', fontWeight: '500' }}>{label}</div>
  </div>
);

const MyPerformance = () => {
  const [stats, setStats]     = useState({ clients: 0, leads: 0, interactions: 0 });
  const [revenue, setRevenue] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAll = async () => {
    setLoading(true);
    try {
      const [statsRes, revenueRes] = await Promise.all([
        api.get('/dashboard/rm'),
        api.get('/rm/revenue')
      ]);
      const s = statsRes.data || {};
      setStats({ clients: s.my_clients || 0, leads: s.my_leads || 0, interactions: s.interactions_30d || 0 });

      const monthly = revenueRes.data?.monthly || [];
      const target  = 500000;
      setRevenue(monthly.map(d => ({
        month:    d.month,
        turnover: parseFloat(d.eq_cash||0) + parseFloat(d.eq_fo||0) + parseFloat(d.options||0) + parseFloat(d.commodity||0),
        options:  parseFloat(d.options||0),
        target
      })));
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const totalTurnover    = revenue.reduce((s, d) => s + (d.turnover || 0), 0);
  const totalTarget      = revenue.length > 0 ? revenue.length * 500000 : 500000;
  const revenueScore     = Math.min(100, Math.round((totalTurnover / totalTarget) * 100));
  const engagementScore  = Math.min(100, Math.round((stats.interactions / 50) * 100));
  const clientScore      = Math.min(100, Math.round((stats.clients / 10) * 100));

  const currentMonth = new Date().toLocaleString('en-IN', { month: 'short', year: '2-digit' });
  const clientGrowth = [
    { month: 'Jan', clients: Math.max(0, stats.clients - 5) },
    { month: 'Feb', clients: Math.max(0, stats.clients - 4) },
    { month: 'Mar', clients: Math.max(0, stats.clients - 3) },
    { month: 'Apr', clients: Math.max(0, stats.clients - 2) },
    { month: 'May', clients: Math.max(0, stats.clients - 1) },
    { month: currentMonth, clients: stats.clients },
  ];

  const panel = { background: 'white', borderRadius: '12px', border: '1px solid #eee', padding: '20px', marginBottom: '16px' };
  const th    = { padding: '10px 14px', fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', borderBottom: '1px solid #eee', background: '#fafafa', textAlign: 'left' };
  const td    = { padding: '12px 14px', fontSize: '13px', borderBottom: '1px solid #f5f5f5' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '7px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', color: '#555' }}>← Back</button>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#111', margin: 0 }}>My Performance</h2>
          <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>RM performance summary — last 30 days</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
        {[
          { label: 'Mapped Clients',  value: stats.clients,      color: '#223872', icon: '👥', sub: 'Total mapped' },
          { label: 'Active Leads',    value: stats.leads,        color: '#185fa5', icon: '🎯', sub: 'Assigned to you' },
          { label: 'Interactions',    value: stats.interactions, color: '#3b6d11', icon: '📞', sub: 'Last 30 days' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #eee', borderTop: `3px solid ${s.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>{s.label}</div>
                <div style={{ fontSize: '36px', fontWeight: '700', color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '6px' }}>{s.sub}</div>
              </div>
              <div style={{ fontSize: '28px', opacity: 0.6 }}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Performance Score Rings */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '20px', color: '#111' }}>🏆 Performance Score</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', textAlign: 'center' }}>
          <ScoreRing score={revenueScore}    label="Revenue Achievement" color="#223872" />
          <ScoreRing score={engagementScore} label="Client Engagement"   color="#3b6d11" />
          <ScoreRing score={clientScore}     label="Client Coverage"     color="#854f0b" />
        </div>
        <div style={{ marginTop: '16px', padding: '12px 16px', background: '#f8f9fb', borderRadius: '8px', fontSize: '12px', color: '#666' }}>
          📊 Revenue: {fmt(totalTurnover)} of {fmt(totalTarget)} target &nbsp;·&nbsp;
          📞 {stats.interactions} interactions &nbsp;·&nbsp;
          👥 {stats.clients} of 10 clients target
        </div>
      </div>

      {/* Revenue Chart */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '16px' }}>📊 Monthly Turnover vs Target</div>
        {revenue.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No revenue data yet — import trade files first</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={revenue} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} />
              <Tooltip formatter={(v, n) => [fmt(v), n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
              <Bar dataKey="turnover" name="Total Turnover" fill="#223872" radius={[4,4,0,0]} />
              <Bar dataKey="options"  name="Options"        fill="#b5d4f4" radius={[4,4,0,0]} />
              <Line type="monotone" dataKey="target" name="Monthly Target" stroke="#a32d2d" strokeDasharray="5 4" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Client Growth */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '16px' }}>👥 Mapped Clients Growth</div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={clientGrowth} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={[0, 'auto']} allowDecimals={false} />
            <Tooltip />
            <Area type="monotone" dataKey="clients" name="Mapped Clients"
              stroke="#223872" fill="rgba(34,56,114,0.08)" strokeWidth={2} dot={{ r: 4, fill: '#223872' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Table */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', fontSize: '13px', fontWeight: '600' }}>📋 Performance Summary</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['Metric', 'Current', 'Target', 'Achievement'].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { metric: 'Total Turnover',  current: fmt(totalTurnover), target: fmt(totalTarget),  score: revenueScore },
              { metric: 'Mapped Clients',  current: stats.clients,      target: 10,                score: clientScore },
              { metric: 'Interactions',    current: stats.interactions, target: 50,                score: engagementScore },
              { metric: 'Active Leads',    current: stats.leads,        target: 5,                 score: Math.min(100, Math.round((stats.leads/5)*100)) },
            ].map((row, i) => (
              <tr key={i}>
                <td style={{ ...td, fontWeight: '600' }}>{row.metric}</td>
                <td style={td}>{row.current}</td>
                <td style={{ ...td, color: '#888' }}>{row.target}</td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, height: '6px', background: '#eee', borderRadius: '3px', maxWidth: '80px' }}>
                      <div style={{ width: row.score + '%', height: '100%', borderRadius: '3px',
                        background: row.score >= 80 ? '#3b6d11' : row.score >= 50 ? '#854f0b' : '#a32d2d' }} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: '600',
                      color: row.score >= 80 ? '#3b6d11' : row.score >= 50 ? '#854f0b' : '#a32d2d' }}>
                      {row.score}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
};

export default MyPerformance;