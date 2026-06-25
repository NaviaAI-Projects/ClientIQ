import React, { useEffect, useState } from 'react';
import api from '../api';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const fmt = n => {
  if (!n) return '₹0';
  if (n >= 10000000) return `₹${(n/10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n/100000).toFixed(1)}L`;
  return `₹${Number(n).toLocaleString('en-IN')}`;
};

const DailyMIS = () => {
  const [stats, setStats] = useState(null);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [activeClients, setActiveClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/company'),
      api.get('/reports/monthly-brokerage'),
      api.get('/reports/client-activity-trend')
    ]).then(([statsRes, trendRes, activeRes]) => {
      setStats(statsRes.data);
      setMonthlyTrend(trendRes.data);
      setActiveClients(activeRes.data);
    }).catch(console.error)
    .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  const cardStyle = (color) => ({
    background: 'white', borderRadius: '12px', padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${color}`
  });

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#223872' }}>Corporate Daily MIS</h1>
        <p style={{ fontSize: '13px', color: '#62708A', marginTop: '4px' }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={cardStyle('#223872')}>
          <div style={{ fontSize: '11px', color: '#62708A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Clients</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#223872', marginTop: '6px' }}>{stats?.total_clients?.toLocaleString()}</div>
        </div>
        <div style={cardStyle('#0BA86D')}>
          <div style={{ fontSize: '11px', color: '#62708A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Clients</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#0BA86D', marginTop: '6px' }}>{stats?.active_clients?.toLocaleString()}</div>
        </div>
        <div style={cardStyle('#ED4D37')}>
          <div style={{ fontSize: '11px', color: '#62708A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Today's Brokerage</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#ED4D37', marginTop: '6px' }}>{fmt(stats?.today_brokerage)}</div>
        </div>
        <div style={cardStyle('#F5A524')}>
          <div style={{ fontSize: '11px', color: '#62708A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Today's Turnover</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#F5A524', marginTop: '6px' }}>{fmt(stats?.today_turnover)}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

        {/* Monthly Income Trend */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#223872', marginBottom: '16px' }}>Monthly Brokerage Income</h3>
          {monthlyTrend.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '13px' }}>No data — import trade files first</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6EBF2" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip formatter={v => [fmt(v), 'Brokerage']} />
                <Bar dataKey="brokerage" name="Brokerage" fill="#223872" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Monthly Options Volume */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#223872', marginBottom: '16px' }}>Monthly Options Turnover</h3>
          {monthlyTrend.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '13px' }}>No data — import trade files first</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6EBF2" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip formatter={v => [fmt(v), 'Options TO']} />
                <Bar dataKey="options_turnover" name="Options Turnover" fill="#ED4D37" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Active Clients Trend */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#223872', marginBottom: '16px' }}>Monthly Active Clients</h3>
        {activeClients.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '13px' }}>No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={activeClients}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E6EBF2" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="active_clients" name="Active Clients" stroke="#223872" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default DailyMIS;