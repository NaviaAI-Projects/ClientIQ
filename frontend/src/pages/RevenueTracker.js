import React, { useEffect, useState } from 'react';
import api from '../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const FMT = (v) => {
  if (!v) return '₹0';
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(0) + 'K';
  return '₹' + v;
};

const RevenueTracker = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/monthly-brokerage')
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      <div className="ph">
        <h2>Revenue Tracker</h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Monthly revenue breakdown by stream</p>
      </div>

      <div className="panel">
        <div className="ptitle">Monthly Revenue by Stream</div>
        {data.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
            No data — import trade files first
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={FMT} />
              <Tooltip formatter={(v) => [FMT(v)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="brokerage" name="Brokerage" stackId="s" fill="#b5d4f4" />
              <Bar dataKey="options_turnover" name="Options Clearing" stackId="s" fill="#185fa5" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default RevenueTracker;  