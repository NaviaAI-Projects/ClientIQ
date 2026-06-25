import React, { useEffect, useState } from 'react';
import api from '../api';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

const FMT = (v) => v >= 100000 ? '₹' + (v/100000).toFixed(1) + 'L' : v >= 1000 ? '₹' + (v/1000).toFixed(0) + 'K' : '₹' + v;

const MyPerformance = () => {
  const [stats, setStats] = useState({ clients: 0, leads: 0, interactions: 0 });
  const [monthlyTrend, setMonthlyTrend] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/clients/my/clients'),
      api.get('/leads/my'),
      api.get('/contact-logs'),
      api.get('/reports/monthly-brokerage')
    ]).then(([clientsRes, leadsRes, logsRes, trendRes]) => {
      setStats({
        clients: clientsRes.data.length || 0,
        leads: leadsRes.data.length || 0,
        interactions: logsRes.data.length || 0
      });
      setMonthlyTrend(trendRes.data);
    }).catch(console.error);
  }, []);

  // Add target line to monthly data
  const perfData = monthlyTrend.map(d => ({ ...d, target: 180000 }));

  return (
    <div>
      <div className="ph">
        <h2>My Performance</h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>RM performance summary</p>
      </div>

      {/* Stat cards */}
      <div className="cards" style={{ marginBottom: '20px' }}>
        <div className="card ci">
          <div className="clbl">Mapped Clients</div>
          <div className="cval">{stats.clients}</div>
        </div>
        <div className="card cs">
          <div className="clbl">Assigned Leads</div>
          <div className="cval">{stats.leads}</div>
        </div>
        <div className="card cw">
          <div className="clbl">Interactions</div>
          <div className="cval">{stats.interactions}</div>
        </div>
      </div>

      {/* Revenue vs Target — Prototype: ch-rm-perf */}
      <div className="panel" style={{ marginBottom: '14px' }}>
        <div className="ptitle">Monthly Revenue vs Target</div>
        {perfData.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={perfData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={FMT} />
              <Tooltip formatter={(v, n) => [FMT(v), n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="brokerage" name="Actual" fill="#b5d4f4" />
              <Line
                type="monotone" dataKey="target" name="Target"
                stroke="#a32d2d" strokeDasharray="4 4"
                dot={false} strokeWidth={1.5}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Mapped Clients trend — Prototype: ch-rm-clients */}
      <div className="panel">
        <div className="ptitle">Mapped Clients Growth</div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart
            data={[
              { month: 'Dec', clients: 22 }, { month: 'Jan', clients: 24 },
              { month: 'Feb', clients: 26 }, { month: 'Mar', clients: 29 },
              { month: 'Apr', clients: 32 }, { month: 'May', clients: stats.clients || 34 }
            ]}
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Area type="monotone" dataKey="clients" name="Mapped Clients"
              stroke="#185fa5" fill="rgba(24,95,165,0.08)" strokeWidth={2} dot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MyPerformance;