import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const MarketShare = () => {
  const months = ['Oct\'25','Nov\'25','Dec\'25','Jan\'26','Feb\'26','Mar\'26','Apr\'26','May\'26','Jun\'26'];

  const shareData = months.map((m, i) => ({
    month: m,
    eq_options:   [0.109,0.104,0.098,0.091,0.091,0.085,0.091,0.092,0.079][i],
    comm_options: [0.0007,0.0006,0.0006,0.0009,0.0007,0.0012,0.0001,0.0006,0.0002][i],
    eq_futures:   [0.013,0.015,0.014,0.009,0.008,0.010,0.011,0.007,0.007][i],
  }));

  const volData = months.map((m, i) => ({
    month: m,
    navia:    [63.3,56.7,47.9,60.4,64.0,79.9,58.9,61.8,67.4][i],
    exchange: [57.8,54.6,49.1,66.5,70.1,93.8,64.2,67.2,85.8][i],
  }));

  return (
    <div>
      <div className="ph">
        <h2>Market Share</h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Navia segment-wise market share vs exchange volumes</p>
      </div>

      {/* ch-mkt-share */}
      <div className="panel" style={{ marginBottom: '14px' }}>
        <div className="ptitle">Segment Market Share (%)</div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={shareData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v.toFixed(3) + '%'} />
            <Tooltip formatter={v => [v.toFixed(4) + '%']} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="eq_options"   name="Eq Options mkt share (%)"
              stroke="#185fa5" fill="rgba(24,95,165,0.08)" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="comm_options" name="Comm Options mkt share (%)"
              stroke="#9FE1CB" strokeWidth={1.5} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="eq_futures"   name="Eq Futures mkt share (%)"
              stroke="#FAC775" strokeWidth={1.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ch-mkt-vol */}
      <div className="panel">
        <div className="ptitle">Navia vs Exchange Eq Options Volume (₹Cr/day)</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={volData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="navia"    name="Navia Eq Options (₹Cr/day)" fill="#b5d4f4" />
            <Bar dataKey="exchange" name="Exchange Eq Options avg (÷1000)" fill="#e0e0e0" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MarketShare;