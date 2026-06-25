import React, { useEffect, useState } from 'react';
import api from '../api';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const MarketShare = () => {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/market-share')
      .then(res => setData(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>
  );

  const noData = data.length === 0;

  // Summary cards
  const latestMonth  = data[data.length - 1] || {};
  const peakOptions  = data.length > 0
    ? Math.max(...data.map(r => r.navia_options_cr))
    : 0;
  const totalClients = latestMonth.total_clients || 0;

  return (
    <div>
      <div className="ph">
        <h2>Market Share</h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
          Navia segment-wise volume trend and client activity
        </p>
      </div>

      {/* Summary cards */}
      <div className="cards" style={{ marginBottom: '16px' }}>
        <div className="card ci">
          <div className="clbl">Latest Options Volume</div>
          <div className="cval">{latestMonth.navia_options_cr?.toFixed(1) || 0} ₹Cr</div>
          <div className="csub">{latestMonth.month || '-'}</div>
        </div>
        <div className="card cs">
          <div className="clbl">Peak Options Volume</div>
          <div className="cval">{peakOptions.toFixed(1)} ₹Cr</div>
          <div className="csub">Last 9 months</div>
        </div>
        <div className="card cw">
          <div className="clbl">Active Clients (Latest)</div>
          <div className="cval">{totalClients.toLocaleString()}</div>
          <div className="csub">{latestMonth.month || '-'}</div>
        </div>
        <div className="card cp">
          <div className="clbl">Options Clients (Latest)</div>
          <div className="cval">{latestMonth.options_clients?.toLocaleString() || 0}</div>
          <div className="csub">{latestMonth.month || '-'}</div>
        </div>
      </div>

      {/* ch-mkt-vol: Navia volume by segment */}
      <div className="panel" style={{ marginBottom: '14px' }}>
        <div className="ptitle">Navia Monthly Volume by Segment (₹Cr/month)</div>
        {noData ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
            No data — import trade files first
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v + ' ₹Cr'} />
              <Tooltip formatter={v => [v.toFixed(2) + ' ₹Cr']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="navia_options_cr"  name="Eq Options + F&O (₹Cr)" fill="#185fa5" radius={[3,3,0,0]} />
              <Bar dataKey="navia_eq_cash_cr"  name="Eq Cash (₹Cr)"          fill="#b5d4f4" radius={[3,3,0,0]} />
              <Bar dataKey="navia_comm_cr"     name="Commodity F&O (₹Cr)"    fill="#9FE1CB" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ch-mkt-share: Options clients trend */}
      <div className="panel" style={{ marginBottom: '14px' }}>
        <div className="ptitle">Monthly Active Clients — Total vs Options</div>
        {noData ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
            No data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone" dataKey="total_clients"
                name="Total active clients"
                stroke="#185fa5"
                fill="rgba(24,95,165,0.08)"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line
                type="monotone" dataKey="options_clients"
                name="Options clients"
                stroke="#9FE1CB"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Volume trend line */}
      <div className="panel">
        <div className="ptitle">Options Volume Trend (₹Cr/month)</div>
        {noData ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
            No data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v + ' ₹Cr'} />
              <Tooltip formatter={v => [v.toFixed(2) + ' ₹Cr']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone" dataKey="navia_options_cr"
                name="Eq Options + F&O (₹Cr/month)"
                stroke="#185fa5"
                fill="rgba(24,95,165,0.08)"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line
                type="monotone" dataKey="navia_comm_cr"
                name="Commodity F&O (₹Cr/month)"
                stroke="#9FE1CB"
                strokeWidth={1.5}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default MarketShare;