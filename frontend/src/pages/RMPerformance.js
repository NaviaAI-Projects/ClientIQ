import React, { useEffect, useState } from 'react';
import api from '../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const FMT = v => v >= 100000 ? '₹'+(v/100000).toFixed(1)+'L' : v >= 1000 ? '₹'+(v/1000).toFixed(0)+'K' : '₹'+v;

const RMPerformance = () => {
  const [rmData, setRmData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/rm-performance')
      .then(res => setRmData(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      <div className="ph">
        <h2>RM Performance</h2>
        <p>Cross-RM analysis — revenue, leads, client growth, activity</p>
      </div>

      <div className="panel">
        <div className="ptitle">RM Revenue (30 Days)</div>
        {rmData.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No RM data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={rmData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={FMT} />
              <Tooltip formatter={v => [FMT(v), 'Brokerage']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="total_brokerage" name="Brokerage" fill="#b5d4f4" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="panel">
        <div className="ptitle">RM Summary Table</div>
        <div className="tw"><table>
          <thead><tr>
            <th>RM Name</th><th>Clients</th><th>Interactions</th><th>Revenue</th>
          </tr></thead>
          <tbody>
            {rmData.length === 0 ? (
              <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No data</td></tr>
            ) : rmData.map((rm, i) => (
              <tr key={i}>
                <td style={{ fontWeight: '500' }}>{rm.name}</td>
                <td>{rm.total_clients}</td>
                <td>{rm.total_interactions}</td>
                <td style={{ fontWeight: '600', color: 'var(--ic)' }}>{FMT(rm.total_brokerage)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

export default RMPerformance;