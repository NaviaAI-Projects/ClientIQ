import React, { useEffect, useState } from 'react';
import api from '../api';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const OptionsAnalytics = () => {
  const [dailyData, setDailyData]   = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [mtdAvg, setMtdAvg]         = useState(0);
  const [loading, setLoading]        = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/reports/daily-options?days=18'),
      api.get('/reports/monthly-brokerage')
    ]).then(([dailyRes, monthlyRes]) => {
      setDailyData(dailyRes.data.rows || []);
      setMtdAvg(dailyRes.data.mtd_avg || 0);
      setMonthlyData(monthlyRes.data || []);
    }).catch(console.error)
    .finally(() => setLoading(false));
  }, []);

  const trendData = monthlyData.map(d => ({
    month: d.month,
    eq_options: parseFloat(d.options_turnover) / 10000000 || 0
  }));

  // Custom dot — red+bigger on expiry days, blue+small on normal days
  const CustomDot = (props) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy) return null;
    return (
      <circle
        cx={cx} cy={cy}
        r={payload.is_expiry ? 6 : 3}
        fill={payload.is_expiry ? '#a32d2d' : '#185fa5'}
        stroke="none"
      />
    );
  };

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>
  );

  const noData = dailyData.length === 0;

  return (
    <div>
      <div className="ph">
        <h2>Options Analytics</h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
          Eq Options turnover · expiry-day analysis · trend &nbsp;
          <span style={{ fontSize: '11px', color: '#a32d2d' }}>● Expiry (Thu)</span>
          <span style={{ marginLeft: '8px', fontSize: '11px', color: '#185fa5' }}>● Normal day</span>
        </p>
      </div>

      {/* ch-opt-to: Daily Options TO with expiry highlights */}
      <div className="panel" style={{ marginBottom: '14px' }}>
        <div className="ptitle">Daily Eq Options Turnover (₹) — MTD avg: ₹{mtdAvg.toLocaleString('en-IN')}</div>
        {noData ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
            No options trading data — import trade files first
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={dailyData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v, n) => ['₹' + v.toLocaleString('en-IN'), n]}
                labelFormatter={label => {
                  const row = dailyData.find(d => d.date === label);
                  return label + (row?.is_expiry ? ' ⚡ Expiry' : '');
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone" dataKey="options_to_cr"
                name="Eq Options TO (₹Cr)"
                stroke="#185fa5"
                fill="rgba(24,95,165,0.07)"
                strokeWidth={2}
                dot={<CustomDot />}
              />
              <Line
                type="monotone"
                dataKey={() => mtdAvg}
                name="MTD avg"
                stroke="#854f0b"
                strokeDasharray="5 5"
                dot={false}
                strokeWidth={1.5}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="tc2">
        {/* ch-opt-clients: Daily active options clients */}
        <div className="panel">
          <div className="ptitle">Daily Options Clients</div>
          {noData ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyData} margin={{ top: 8, right: 4, bottom: 8, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v, n) => [v + ' clients', n]}
                  labelFormatter={label => {
                    const row = dailyData.find(d => d.date === label);
                    return label + (row?.is_expiry ? ' ⚡ Expiry' : '');
                  }}
                />
                <Bar
                  dataKey="options_clients"
                  name="Options Clients"
                  fill="#b5d4f4"
                  radius={[3,3,0,0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ch-opt-trend: Monthly options trend */}
        <div className="panel">
          <div className="ptitle">Monthly Options Trend (₹Cr avg/day)</div>
          {trendData.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={v => [v.toFixed(1) + ' ₹Cr']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone" dataKey="eq_options"
                  name="Eq Opt avg/day (₹Cr)"
                  stroke="#185fa5"
                  fill="rgba(24,95,165,0.08)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default OptionsAnalytics;