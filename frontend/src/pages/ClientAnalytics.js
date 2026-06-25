import React, { useEffect, useState } from 'react';
import api from '../api';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const ClientAnalytics = () => {
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/client-analytics?days=17')
      .then(res => setData(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>
  );

  const noData = data.length === 0;

  // Summary cards
  const totalActive  = data.reduce((s, r) => s + r.total_clients, 0);
  const totalProfit  = data.reduce((s, r) => s + r.profitable_clients, 0);
  const totalNRI     = data.length > 0 ? Math.max(...data.map(r => r.nri_clients)) : 0;
  const avgDaily     = data.length > 0 ? Math.round(totalActive / data.length) : 0;

  return (
    <div>
      <div className="ph">
        <h2>Client Analytics</h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
          Daily client-level behavioural analytics
        </p>
      </div>

      {/* Summary cards */}
      <div className="cards" style={{ marginBottom: '16px' }}>
        <div className="card ci">
          <div className="clbl">Avg Daily Active</div>
          <div className="cval">{avgDaily.toLocaleString()}</div>
        </div>
        <div className="card cs">
          <div className="clbl">Total Profitable Days</div>
          <div className="cval">{totalProfit.toLocaleString()}</div>
        </div>
        <div className="card cp">
          <div className="clbl">Peak NRI Active</div>
          <div className="cval">{totalNRI}</div>
        </div>
        <div className="card cw">
          <div className="clbl">Days Tracked</div>
          <div className="cval">{data.length}</div>
        </div>
      </div>

      {/* ch-ca-pnl: Profitable vs Loss clients */}
      <div className="panel" style={{ marginBottom: '14px' }}>
        <div className="ptitle">Daily Profitable vs Loss Clients</div>
        {noData ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
            No data — import trade files first
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9 }}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="profitable_clients" name="Profitable clients" fill="#3b6d11" radius={[3,3,0,0]} />
              <Bar dataKey="loss_clients"       name="Loss clients"       fill="#a32d2d" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ch-ca-nri: NRI vs Resident active clients */}
      <div className="panel">
        <div className="ptitle">Daily Active Clients — NRI vs Resident</div>
        {noData ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
            No data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9 }}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                label={{ value: 'Clients', angle: -90, position: 'insideLeft', fontSize: 10 }}
              />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone" dataKey="nri_clients"
                name="NRI clients"
                stroke="#185fa5"
                fill="rgba(24,95,165,0.08)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone" dataKey="resident"
                name="Resident clients"
                stroke="#854f0b"
                fill="rgba(133,79,11,0.05)"
                strokeWidth={1.5}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default ClientAnalytics;