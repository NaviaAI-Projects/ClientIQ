import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

const fmt = (v) => {
  const n = parseFloat(v) || 0;
  if (n >= 10000000) return '₹' + (n/10000000).toFixed(2) + 'Cr';
  if (n >= 100000)   return '₹' + (n/100000).toFixed(1) + 'L';
  if (n >= 1000)     return '₹' + (n/1000).toFixed(1) + 'K';
  return '₹' + n.toFixed(0);
};

const RevenueTracker = () => {
  const [data, setData]       = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/rm/revenue');
      setData(res.data.monthly || []);
      setSummary(res.data.summary || null);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const panel = { background: 'white', borderRadius: '12px', border: '1px solid #eee', padding: '20px', marginBottom: '16px' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: '1px solid #ddd', borderRadius: '7px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', color: '#555' }}>← Back</button>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#111', margin: 0 }}>Revenue Tracker</h2>
          <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Monthly revenue breakdown from your mapped clients</p>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
          {[
            { label: 'Total Turnover',       value: fmt(summary.total_turnover),   color: '#223872' },
            { label: 'Options Turnover',      value: fmt(summary.options_turnover), color: '#185fa5' },
            { label: 'Eq Cash Turnover',      value: fmt(summary.eq_cash),          color: '#3b6d11' },
            { label: 'Brokerage Earned',      value: fmt(summary.brokerage),        color: '#854f0b' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'white', borderRadius: '10px', padding: '16px', border: '1px solid #eee', borderLeft: `4px solid ${s.color}` }}>
              <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', fontWeight: '600', marginBottom: '6px' }}>{s.label}</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Monthly Turnover Chart */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '16px' }}>📊 Monthly Turnover by Segment</div>
        {data.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No data — import trade files first</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} />
              <Tooltip formatter={(v) => [fmt(v)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
              <Bar dataKey="eq_cash"    name="Eq Cash"    stackId="s" fill="#b5d4f4" />
              <Bar dataKey="eq_fo"      name="Eq F&O"     stackId="s" fill="#378add" />
              <Bar dataKey="options"    name="Options"    stackId="s" fill="#185fa5" />
              <Bar dataKey="commodity"  name="Commodity"  stackId="s" fill="#1D9E75" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Brokerage Trend */}
      <div style={panel}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '16px' }}>💰 Brokerage Earned (Monthly)</div>
        {data.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No data</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} />
              <Tooltip formatter={(v) => [fmt(v), 'Brokerage']} />
              <Line type="monotone" dataKey="brokerage" name="Brokerage" stroke="#854f0b" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Client-wise Breakdown */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', fontSize: '13px', fontWeight: '600' }}>
          👥 Client-wise Revenue Breakdown
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['Client', 'Total Turnover', 'Options', 'Eq Cash', 'Brokerage'].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', borderBottom: '1px solid #eee', textAlign: 'left', background: '#fafafa' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(summary?.clients || []).length === 0 ? (
              <tr><td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: '#888' }}>No client data</td></tr>
            ) : (
              (summary?.clients || []).map((c, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '12px 14px', fontWeight: '600' }}>{c.name}</td>
                  <td style={{ padding: '12px 14px' }}>{fmt(c.total_turnover)}</td>
                  <td style={{ padding: '12px 14px' }}>{fmt(c.options)}</td>
                  <td style={{ padding: '12px 14px' }}>{fmt(c.eq_cash)}</td>
                  <td style={{ padding: '12px 14px', color: '#854f0b', fontWeight: '600' }}>{fmt(c.brokerage)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RevenueTracker;