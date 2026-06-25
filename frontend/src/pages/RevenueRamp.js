import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const RevenueRamp = () => {
  const MTHS8 = ['M1','M2','M3','M4','M5','M6','M7','M8'];
  const COHORTS = ['Jun\'25','Sep\'25','Dec\'25','Feb\'26','Apr\'26'];

  const rampData = MTHS8.map((m, i) => ({
    month: m,
    all_clients:     [280,380,510,580,610,620,618,615][i],
    options_active:  [420,610,840,980,1050,1100,1090,1085][i],
    non_options:     [180,220,280,310,320,325,322,320][i],
  }));

  const optActData = COHORTS.map((c, i) => ({
    cohort: c,
    pct: [41,43,44,46,44][i],
    fill: ['#d3d1c7','#b5d4f4','#9FE1CB','#185fa5','#3b6d11'][i],
  }));

  const splitData = [
    { segment: 'Options activated', m3: 840,  m6: 1100 },
    { segment: 'Equity only',       m3: 280,  m6: 325  },
    { segment: 'Never traded opts', m3: 90,   m6: 110  },
  ];

  return (
    <div>
      <div className="ph">
        <h2>Client Revenue Ramp</h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>New client revenue ramp-up — options activation impact</p>
      </div>

      {/* ch-ramp-curve */}
      <div className="panel" style={{ marginBottom: '14px' }}>
        <div className="ptitle">New Client Avg Monthly Revenue Ramp (₹/month)</div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={rampData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v} />
            <Tooltip formatter={v => ['₹' + v]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="all_clients"    name="All new clients (avg ₹/month)"
              stroke="#185fa5" fill="rgba(24,95,165,0.08)" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="options_active" name="Options-activated by M2 (avg ₹/month)"
              stroke="#3b6d11" fill="rgba(59,109,17,0.06)" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="non_options"    name="Non-options clients (avg ₹/month)"
              stroke="#854f0b" strokeDasharray="4 4" strokeWidth={1.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="tc2">
        {/* ch-ramp-optact */}
        <div className="panel">
          <div className="ptitle">% Activated Options within 60 Days by Cohort</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={optActData} margin={{ top: 8, right: 4, bottom: 8, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="cohort" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v + '%'} domain={[0, 100]} />
              <Tooltip formatter={v => [v + '%']} />
              <Bar dataKey="pct" name="% activated options within 60 days">
                {optActData.map((entry, i) => (
                  <rect key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ch-ramp-split */}
        <div className="panel">
          <div className="ptitle">Avg Revenue by Segment — M3 vs M6 (₹/client)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={splitData} margin={{ top: 8, right: 4, bottom: 8, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="segment" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v} />
              <Tooltip formatter={v => ['₹' + v]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="m3" name="M3 avg rev/client" fill="#9FE1CB" />
              <Bar dataKey="m6" name="M6 avg rev/client" fill="#185fa5" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default RevenueRamp;