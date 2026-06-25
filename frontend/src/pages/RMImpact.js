import React, { useEffect, useState } from 'react';
import api from '../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const FMT = v => v >= 100000 ? '₹' + (v/100000).toFixed(1) + 'L' : v >= 1000 ? '₹' + (v/1000).toFixed(0) + 'K' : '₹' + v;

const RMImpact = () => {
  const [rmData, setRmData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/rm-performance')
      .then(res => {
        setRmData(res.data.map(rm => ({
          name: rm.name,
          pre_rev: 0,
          post_rev: parseFloat(rm.total_brokerage) || 0,
          pre_vol: 0,
          post_vol: parseFloat(rm.total_turnover) / 10000000 || 0,
        })));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      <div className="ph">
        <h2>RM Impact Analysis</h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Before vs after RM mapping — revenue and options volume impact</p>
      </div>

      <div className="tc2">
        {/* ch-rmi-rev: Pre vs Post revenue per RM */}
        <div className="panel">
          <div className="ptitle">Avg Monthly Revenue — Pre vs Post Mapping (₹)</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={rmData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={FMT} />
              <Tooltip formatter={(v) => [FMT(v)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="pre_rev"  name="Avg monthly rev 3M pre-mapping (₹)"  fill="#d3d1c7" />
              <Bar dataKey="post_rev" name="Avg monthly rev 3M post-mapping (₹)" fill="#185fa5" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ch-rmi-vol: Pre vs Post options TO per RM */}
        <div className="panel">
          <div className="ptitle">Avg Options TO — Pre vs Post Mapping (₹Cr)</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={rmData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => [v.toFixed(1) + ' ₹Cr']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="pre_vol"  name="Avg options TO 3M pre (₹Cr)"  fill="#d3d1c7" />
              <Bar dataKey="post_vol" name="Avg options TO 3M post (₹Cr)" fill="#9FE1CB" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default RMImpact;