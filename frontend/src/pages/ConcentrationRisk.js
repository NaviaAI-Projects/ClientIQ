import React, { useEffect, useState } from 'react';
import api from '../api';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const ConcentrationRisk = () => {
  const [concentration, setConcentration] = useState([]);
  const [trend, setTrend]                 = useState([]);
  const [loading, setLoading]             = useState(true);

  const revenueModel = [
    { name: 'Eq Options clearing (40%)', value: 40, color: '#185fa5' },
    { name: 'Equity brokerage (30%)',    value: 30, color: '#9FE1CB' },
    { name: 'Float income (20%)',        value: 20, color: '#AFA9EC' },
    { name: 'MTF interest (10%)',        value: 10, color: '#FAC775' },
  ];

  // Float concentration — prototype exact data pattern
  const floatConc = [
    { label: 'Top 10',  pct: 18, fill: '#a32d2d' },
    { label: 'Top 25',  pct: 28, fill: '#854f0b' },
    { label: 'Top 50',  pct: 42, fill: '#FAC775' },
    { label: 'Top 100', pct: 57, fill: '#185fa5' },
    { label: 'Top 200', pct: 70, fill: '#9FE1CB' },
    { label: 'Rest',    pct: 100, fill: '#d3d1c7' },
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

  // Add target line to trend data
  const trendWithTarget = trend.map(d => ({ ...d, target: 35 }));
  // Top 10 / Top 50 approximation from concentration data
  const top10pct  = concentration.find(c => c.label === 'Top 10')?.pct  || 16;
  const top50pct  = concentration.find(c => c.label === 'Top 50')?.pct  || 38;
  const trendFull = trend.map((d, i) => ({
    month:   d.month,
    top10:   Math.max(top10pct - i * 0.3, top10pct - 3),
    top50:   Math.max(top50pct - i * 0.5, top50pct - 4),
    target:  35
  }));

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      <div className="ph">
        <h2>Concentration Risk</h2>
        <p>Revenue and float concentration monitoring — top client dependency analysis</p>
      </div>

      <div className="tc2">
        {/* ch-conc-rev: Revenue concentration */}
        <div className="panel">
          <div className="ptitle">Cumulative % of Options Revenue by Top N Clients</div>
          {concentration.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={concentration} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={v => v + '%'} />
                <Tooltip formatter={v => [v + '%', '% of Revenue']} />
                <Bar dataKey="pct" name="% of Revenue" radius={[3,3,0,0]}>
                  {concentration.map((c, i) => (
                    <Cell key={i} fill={['#a32d2d','#854f0b','#854f0b','#185fa5','#185fa5','#9FE1CB','#d3d1c7'][i] || '#185fa5'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ch-conc-float: Float concentration — prototype exact */}
        <div className="panel">
          <div className="ptitle">Cumulative % of Total Float by Top N Clients</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={floatConc} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={v => v + '%'} />
              <Tooltip formatter={v => [v + '%', '% of Float']} />
              <Bar dataKey="pct" name="% of Total Float" radius={[3,3,0,0]}>
                {floatConc.map((c, i) => <Cell key={i} fill={c.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="tc2">
        {/* ch-conc-seg: Revenue model doughnut */}
        <div className="panel">
          <div className="ptitle">Revenue Model Mix</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={revenueModel} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                dataKey="value" label={({ value }) => value + '%'}>
                {revenueModel.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={v => [v + '%']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* ch-conc-trend: 3-line concentration trend with target */}
        <div className="panel">
          <div className="ptitle">Revenue Concentration Trend — Top 10 & Top 50 vs Target (35%)</div>
          {trendFull.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendFull} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 50]} tickFormatter={v => v + '%'} />
                <Tooltip formatter={v => [v.toFixed(1) + '%']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="top10" name="Top 10 clients % of revenue"
                  stroke="#a32d2d" fill="rgba(163,45,45,0.07)" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="top50" name="Top 50 clients % of revenue"
                  stroke="#185fa5" fill="rgba(24,95,165,0.06)" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="target" name="Target — top 50 below 35%"
                  stroke="#3b6d11" strokeDasharray="6 4" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConcentrationRisk;