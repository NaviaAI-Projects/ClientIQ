import React, { useEffect, useState } from 'react';
import api from '../api';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';

const RevenueRamp = () => {
  const [rampData, setRampData]   = useState([]);
  const [splitData, setSplitData] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    api.get('/reports/revenue-ramp')
      .then(res => {
        setRampData(res.data.ramp  || []);
        setSplitData(res.data.split || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const SPLIT_COLORS = {
    'Options activated': '#185fa5',
    'Equity only':       '#9FE1CB',
    'Never traded options': '#d3d1c7'
  };

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>
  );

  const noData = rampData.length === 0 || rampData.every(r => r.avg_revenue === 0);

  return (
    <div>
      <div className="ph">
        <h2>Client Revenue Ramp</h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
          New client revenue ramp-up — options activation impact
        </p>
      </div>

      {/* ch-ramp-curve: Revenue ramp line */}
      <div className="panel" style={{ marginBottom: '14px' }}>
        <div className="ptitle">
          New Client Avg Monthly Brokerage Ramp (₹/client) — M1 to M8
        </div>
        {noData ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
            Not enough cohort data yet — needs clients with 2+ months of trading history
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={rampData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={v => v >= 1000 ? '₹' + (v/1000).toFixed(0) + 'K' : '₹' + v}
              />
              <Tooltip formatter={v => ['₹' + v.toLocaleString('en-IN'), 'Avg Revenue']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone" dataKey="avg_revenue"
                name="Avg monthly brokerage (₹/client)"
                stroke="#185fa5"
                fill="rgba(24,95,165,0.08)"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="tc2">
        {/* ch-ramp-optact: Options activation % by month */}
        <div className="panel">
          <div className="ptitle">% Clients with Options Activity by Month</div>
          {noData ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
              No data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={rampData} margin={{ top: 8, right: 4, bottom: 8, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={v => v + '%'}
                  domain={[0, 100]}
                />
                <Tooltip formatter={v => [v + '%', '% with options']} />
                <Bar dataKey="options_pct" name="% with options activity" radius={[3,3,0,0]}>
                  {rampData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={['#d3d1c7','#b5d4f4','#9FE1CB','#185fa5','#3b6d11','#185fa5','#9FE1CB','#3b6d11'][i] || '#185fa5'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ch-ramp-split: Avg revenue by segment */}
        <div className="panel">
          <div className="ptitle">Avg Brokerage by Segment (₹/client/month)</div>
          {splitData.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
              No segment data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={splitData} margin={{ top: 8, right: 4, bottom: 8, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="segment" tick={{ fontSize: 9 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={v => v >= 1000 ? '₹' + (v/1000).toFixed(0) + 'K' : '₹' + v}
                />
                <Tooltip formatter={v => ['₹' + Math.round(v).toLocaleString('en-IN')]} />
                <Bar dataKey="avg_brokerage" name="Avg brokerage (₹/client)" radius={[3,3,0,0]}>
                  {splitData.map((entry, i) => (
                    <Cell key={i} fill={SPLIT_COLORS[entry.segment] || '#185fa5'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default RevenueRamp;