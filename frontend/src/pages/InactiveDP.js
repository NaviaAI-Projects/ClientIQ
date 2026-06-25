import React, { useEffect, useState } from 'react';
import api from '../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const InactiveDP = () => {
  const [bands, setBands] = useState([]);
  const [loading, setLoading] = useState(true);

  const clientTypes = [
    { name: 'RI', value: 1840, color: '#B6C0D0' },
    { name: 'RI-HV', value: 480, color: '#F5A524' },
    { name: 'NRE/NRO', value: 340, color: '#223872' },
    { name: 'NRE-HV/NRO-HV', value: 140, color: '#0BA86D' },
  ];

  useEffect(() => {
    api.get('/reports/inactive-bands')
      .then(res => setBands(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#223872' }}>Inactive & DP Holdings</h1>
        <p style={{ fontSize: '13px', color: '#62708A', marginTop: '4px' }}>Clients inactive in trading with DP securities still held</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

        {/* Dormancy Band Bar Chart */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#223872', marginBottom: '16px' }}>Inactive Clients by Dormancy Band</h3>
          {bands.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '13px' }}>No inactive clients found</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={bands}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6EBF2" />
                <XAxis dataKey="band" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="clients" name="Total Inactive" fill="#B6C0D0" radius={[4,4,0,0]} />
                <Bar dataKey="with_holdings" name="With DP Holdings" fill="#223872" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Client Type Doughnut */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#223872', marginBottom: '16px' }}>Inactive Clients by Type</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={clientTypes} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" label={({ name }) => name}>
                {clientTypes.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Inactive clients table */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#223872', marginBottom: '16px' }}>Dormancy Summary</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E6EBF2' }}>
              <th style={{ textAlign: 'left', padding: '10px', color: '#62708A', fontSize: '11px', textTransform: 'uppercase' }}>Band</th>
              <th style={{ textAlign: 'right', padding: '10px', color: '#62708A', fontSize: '11px', textTransform: 'uppercase' }}>Total Clients</th>
              <th style={{ textAlign: 'right', padding: '10px', color: '#62708A', fontSize: '11px', textTransform: 'uppercase' }}>With DP Holdings</th>
            </tr>
          </thead>
          <tbody>
            {bands.length === 0 ? (
              <tr><td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No inactive clients</td></tr>
            ) : bands.map((b, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #F1F4F9' }}>
                <td style={{ padding: '10px', fontWeight: '500' }}>{b.band}</td>
                <td style={{ padding: '10px', textAlign: 'right' }}>{b.clients}</td>
                <td style={{ padding: '10px', textAlign: 'right', color: b.with_holdings > 0 ? '#ED4D37' : '#888' }}>{b.with_holdings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InactiveDP;