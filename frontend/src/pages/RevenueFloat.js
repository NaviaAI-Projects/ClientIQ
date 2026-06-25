import React, { useEffect, useState } from 'react';
import api from '../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const fmt = n => {
  if (!n) return '₹0';
  if (n >= 10000000) return `₹${(n/10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n/100000).toFixed(1)}L`;
  return `₹${Number(n).toLocaleString('en-IN')}`;
};

const RevenueFloat = () => {
  const [streams, setStreams] = useState({ trades: [], ledger: [], mtf: [] });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/reports/revenue-streams'),
      api.get('/dashboard/company')
    ]).then(([streamsRes, statsRes]) => {
      setStreams(streamsRes.data);
      setStats(statsRes.data);
    }).catch(console.error)
    .finally(() => setLoading(false));
  }, []);

  // Merge streams into unified chart data
  const chartData = streams.trades.map(t => {
    const ledgerRow = streams.ledger.find(l => l.month === t.month) || {};
    const mtfRow = streams.mtf.find(m => m.month === t.month) || {};
    return {
      month: t.month,
      options_clearing: Math.round(parseFloat(t.options_clearing) || 0),
      equity_brokerage: Math.round(parseFloat(t.equity_brokerage) || 0),
      float_income: Math.round(parseFloat(ledgerRow.float_income) || 0),
      mtf_interest: Math.round(parseFloat(mtfRow.mtf_interest) || 0),
    };
  });

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#223872' }}>Revenue & Float</h1>
        <p style={{ fontSize: '13px', color: '#62708A', marginTop: '4px' }}>Revenue streams and client float income analysis</p>
      </div>

      {/* Float Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #223872' }}>
          <div style={{ fontSize: '11px', color: '#62708A', textTransform: 'uppercase' }}>Total Client Float</div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#223872', marginTop: '6px' }}>{fmt(stats?.total_float)}</div>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #0BA86D' }}>
          <div style={{ fontSize: '11px', color: '#62708A', textTransform: 'uppercase' }}>Est. Annual Float Income (6.5%)</div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#0BA86D', marginTop: '6px' }}>{fmt((stats?.total_float || 0) * 0.065)}</div>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #F5A524' }}>
          <div style={{ fontSize: '11px', color: '#62708A', textTransform: 'uppercase' }}>Today's Brokerage</div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#F5A524', marginTop: '6px' }}>{fmt(stats?.today_brokerage)}</div>
        </div>
      </div>

      {/* Stacked Revenue Streams Chart */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#223872', marginBottom: '16px' }}>Revenue Streams by Month</h3>
        {chartData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '13px' }}>No data — import trade and ledger files first</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E6EBF2" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <Tooltip formatter={v => fmt(v)} />
              <Legend />
              <Bar dataKey="options_clearing" name="Options Clearing (40%)" stackId="s" fill="#223872" />
              <Bar dataKey="equity_brokerage" name="Equity Brokerage (30%)" stackId="s" fill="#34508C" />
              <Bar dataKey="float_income" name="Float Income (20%)" stackId="s" fill="#0BA86D" />
              <Bar dataKey="mtf_interest" name="MTF Interest (10%)" stackId="s" fill="#F5A524" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default RevenueFloat;