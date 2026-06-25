import React from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const ClientAnalytics = () => {
  const DATES = ['4 May','5 May','6 May','7 May','8 May','11 May','12 May','13 May','14 May','15 May','18 May','19 May','20 May','21 May','22 May','1 Jun','2 Jun'];

  const pnlData = DATES.map((date, i) => ({
    date,
    profitable: [788,801,820,798,745,830,815,790,810,800,860,790,680,750,720,820,880][i],
    loss:       [620,615,640,630,590,650,630,610,620,600,640,610,490,580,560,640,710][i],
  }));

  const nriData = DATES.map((date, i) => ({
    date,
    nri:      [18,18,20,20,16,21,20,19,16,19,26,21,19,19,23,21,27][i],
    resident: [17.3,20.1,18.4,20.0,16.4,18.2,21.0,17.9,20.3,16.9,18.7,20.4,17.7,20.0,16.0,17.4,21.3][i],
  }));

  return (
    <div>
      <div className="ph">
        <h2>Client Analytics</h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Daily client-level behavioural analytics</p>
      </div>

      {/* ch-ca-pnl: Profitable vs Loss clients */}
      <div className="panel" style={{ marginBottom: '14px' }}>
        <div className="ptitle">Daily Profitable vs Loss Clients</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={pnlData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="profitable" name="Profitable clients" fill="#3b6d11" />
            <Bar dataKey="loss"       name="Loss clients"       fill="#a32d2d" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ch-ca-nri: NRI vs Resident active clients */}
      <div className="panel">
        <div className="ptitle">Daily Active Clients — NRI vs Resident</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={nriData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10 }} label={{ value: 'Clients', angle: -90, position: 'insideLeft', fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="nri" name="NRI clients"
              stroke="#185fa5" fill="rgba(24,95,165,0.08)"
              strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="resident" name="Resident (÷100)"
              stroke="#854f0b" fill="rgba(133,79,11,0.05)"
              strokeWidth={1.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ClientAnalytics;