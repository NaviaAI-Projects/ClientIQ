import React, { useEffect, useState } from 'react';
import api from '../api';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const FMT = v => {
  if (!v || v === 0) return '₹0';
  if (v >= 1000000) return '₹' + (v/100000).toFixed(0) + 'L';
  if (v >= 100000)  return '₹' + (v/100000).toFixed(1) + 'L';
  if (v >= 1000)    return '₹' + (v/1000).toFixed(0) + 'K';
  return '₹' + v;
};

const DailyMIS = () => {
  const [stats, setStats]           = useState(null);
  const [dailyIncome, setDailyIncome] = useState([]);
  const [dailyVol, setDailyVol]     = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/company'),
      api.get('/reports/daily-mis')
    ]).then(([statsRes, misRes]) => {
      setStats(statsRes.data);
      setDailyIncome(misRes.data.income || []);
      setDailyVol(misRes.data.volume || []);
    }).catch(console.error)
    .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  const CustomDot = (props) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy) return null;
    return <circle cx={cx} cy={cy} r={payload.is_expiry ? 5 : 3}
      fill={payload.is_expiry ? '#a32d2d' : '#185fa5'} stroke="none" />;
  };

  return (
    <div>
      <div className="ph">
        <h2>Corporate Daily MIS</h2>
        <p>{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* KPI Cards */}
      <div className="cards">
        <div className="card ci">
          <div className="clbl">Total Clients</div>
          <div className="cval">{stats?.total_clients?.toLocaleString()}</div>
        </div>
        <div className="card cs">
          <div className="clbl">Active Clients</div>
          <div className="cval">{stats?.active_clients?.toLocaleString()}</div>
        </div>
        <div className="card cd">
          <div className="clbl">Today's Brokerage</div>
          <div className="cval">{FMT(stats?.today_brokerage)}</div>
        </div>
        <div className="card cw">
          <div className="clbl">Today's Turnover</div>
          <div className="cval">{FMT(stats?.today_turnover)}</div>
        </div>
        <div className="card cp">
          <div className="clbl">Total Float</div>
          <div className="cval">{FMT(stats?.total_float)}</div>
        </div>
      </div>

      {/* ch-mis-income: Daily stacked income — 4 streams */}
      <div className="panel">
        <div className="ptitle">Daily Revenue Streams — Options Clearing + Equity Brokerage + MTF + Float</div>
        {dailyIncome.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No daily data — import trade files first</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyIncome} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={FMT} />
              <Tooltip formatter={v => [FMT(v)]} />
              <Legend wrapperStyle={{ fontSize: 10 }} iconSize={10} />
              <Bar dataKey="options_clearing" name="Options clearing"   stackId="s" fill="#185fa5" />
              <Bar dataKey="equity_brokerage" name="Equity brokerage"   stackId="s" fill="#9FE1CB" />
              <Bar dataKey="mtf_interest"     name="MTF interest"       stackId="s" fill="#FAC775" />
              <Bar dataKey="float_income"     name="Float income (est.)" stackId="s" fill="#AFA9EC" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="tc2">
        {/* ch-mis-vol: Dual line — Eq Options + Comm Options with expiry highlights */}
        <div className="panel">
          <div className="ptitle">Daily Options Volume (₹Cr) — Eq + Comm</div>
          {dailyVol.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={dailyVol} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={v => [v + ' ₹Cr']} labelFormatter={l => {
                  const r = dailyVol.find(d => d.date === l);
                  return l + (r?.is_expiry ? ' ⚡ Expiry' : '');
                }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="eq_options_cr"   name="Eq Options (₹Cr)"   stroke="#185fa5" fill="rgba(24,95,165,0.08)" strokeWidth={2} dot={<CustomDot />} />
                <Line type="monotone" dataKey="comm_options_cr" name="Comm Options (₹Cr)" stroke="#9FE1CB" strokeWidth={1.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ch-mis-clients: Grouped bar — F&O + Equity + MTF clients */}
        <div className="panel">
          <div className="ptitle">Daily Active Clients — F&O, Equity, MTF</div>
          {dailyVol.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyVol} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} iconSize={10} />
                <Bar dataKey="fo_clients"     name="F&O clients"    fill="#b5d4f4" />
                <Bar dataKey="equity_clients" name="Equity clients"  fill="#9FE1CB" />
                <Bar dataKey="mtf_clients"    name="MTF clients"     fill="#FAC775" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default DailyMIS;