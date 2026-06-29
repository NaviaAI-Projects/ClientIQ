import React, { useEffect, useState } from 'react';
import api from '../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const FMT = v => {
  if (!v || v === 0) return '₹0';
  if (v >= 1000000) return '₹' + (v/100000).toFixed(0) + 'L';
  if (v >= 100000)  return '₹' + (v/100000).toFixed(1) + 'L';
  if (v >= 1000)    return '₹' + (v/1000).toFixed(0) + 'K';
  return '₹' + v;
};

const RevenueFloat = () => {
  const [streams, setStreams] = useState({ trades: [], ledger: [], mtf: [] });
  const [stats, setStats]     = useState(null);
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

  const chartData = streams.trades.map(t => {
    const ledgerRow = streams.ledger.find(l => l.month === t.month) || {};
    const mtfRow    = streams.mtf.find(m => m.month === t.month) || {};
    return {
      month:            t.month,
      options_clearing: Math.round(parseFloat(t.options_clearing) || 0),
      equity_brokerage: Math.round(parseFloat(t.equity_brokerage) || 0),
      float_income:     Math.round(parseFloat(ledgerRow.float_income) || 0),
      mtf_interest:     Math.round(parseFloat(mtfRow.mtf_interest) || 0),
    };
  });

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      <div className="ph">
        <h2>Revenue & Float</h2>
        <p>Revenue streams and client float income analysis</p>
      </div>

      <div className="cards">
        <div className="card ci">
          <div className="clbl">Total Client Float</div>
          <div className="cval">{FMT(stats?.total_float)}</div>
          <div className="csub">Aggregate ledger balance</div>
        </div>
        <div className="card cs">
          <div className="clbl">Est. Annual Float Income (6.5%)</div>
          <div className="cval">{FMT((stats?.total_float || 0) * 0.065)}</div>
          <div className="csub">Deployed in short-term FDs</div>
        </div>
        <div className="card cw">
          <div className="clbl">Today's Brokerage</div>
          <div className="cval">{FMT(stats?.today_brokerage)}</div>
          <div className="csub">Today's earnings</div>
        </div>
      </div>

      {/* ch-rev-streams — exact prototype: 4 stream stacked bar */}
      <div className="panel">
        <div className="ptitle">Revenue Streams by Month — Options Clearing (40%) · Equity (30%) · Float (20%) · MTF (10%)</div>
        {chartData.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No data — import trade and ledger files first</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={FMT} />
              <Tooltip formatter={v => [FMT(v)]} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={12} />
              <Bar dataKey="options_clearing" name="Options clearing (40%)" stackId="s" fill="#185fa5" />
              <Bar dataKey="equity_brokerage" name="Equity brokerage (30%)" stackId="s" fill="#9FE1CB" />
              <Bar dataKey="float_income"     name="Float income (20%)"     stackId="s" fill="#AFA9EC" />
              <Bar dataKey="mtf_interest"     name="MTF interest (10%)"     stackId="s" fill="#FAC775" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default RevenueFloat;