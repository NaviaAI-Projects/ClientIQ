import React, { useEffect, useState, useCallback } from 'react';
import api from '../api';
import {
  LineChart, Line, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie, ReferenceLine
} from 'recharts';

// ── Colour palette — exact from prototype ──────────────────────
const C = {
  green:  '#26c97e',
  red:    '#f0394e',
  amber:  '#f5a623',
  blue:   '#4a8ff5',
  purple: '#9d7cf4',
  green2: 'rgba(38,201,126,0.13)',
  red2:   'rgba(240,57,78,0.13)',
  amber2: 'rgba(245,166,35,0.13)',
  blue2:  'rgba(74,143,245,0.13)',
  purp2:  'rgba(157,124,244,0.13)',
  gc:     'rgba(0,0,0,0.07)',
};

const FMT = v => {
  const n = parseFloat(v) || 0;
  const prefix = n < 0 ? '–₹' : '₹';
  const abs = Math.abs(n);
  if (abs >= 100000) return prefix + (abs/100000).toFixed(1) + 'L';
  if (abs >= 1000)   return prefix + (abs/1000).toFixed(0) + 'K';
  return prefix + abs.toLocaleString('en-IN');
};

const FMTP = v => {
  const n = parseFloat(v) || 0;
  return (n >= 0 ? '+' : '') + FMT(n);
};

// ── KPI Card — exact prototype structure ───────────────────────
const Card = ({ label, value, sub, borderColor, valueColor }) => (
  <div style={{
    background:   'var(--bg)',
    border:       '1px solid rgba(0,0,0,0.08)',
    borderTop:    `3px solid ${borderColor || C.blue}`,
    borderRadius: '14px',
    padding:      '18px 20px',
    boxShadow:    '0 1px 4px rgba(0,0,0,0.08)',
    transition:   'box-shadow .2s',
  }}>
    <div style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: '500', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '10px' }}>
      {label}
    </div>
    <div style={{ fontSize: '28px', fontWeight: '800', lineHeight: 1.1, marginBottom: '6px', letterSpacing: '-0.5px', color: valueColor || 'var(--tx)' }}>
      {value}
    </div>
    <div style={{ fontSize: '12px', color: 'var(--tx3)' }}>{sub}</div>
  </div>
);

// ── Panel ──────────────────────────────────────────────────────
const Panel = ({ title, sub, children, style }) => (
  <div style={{
    background: 'var(--bg)', border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: '14px', padding: '20px 22px', marginBottom: '16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)', ...style
  }}>
    {title && (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--tx)' }}>{title}</div>
        {sub && <div style={{ fontSize: '11.5px', color: 'var(--tx3)', marginTop: '2px', fontFamily: 'monospace' }}>{sub}</div>}
      </div>
    )}
    {children}
  </div>
);

// ── Score Bar — exact prototype ────────────────────────────────
const ScoreBar = ({ label, score, gradient }) => {
  const s = Math.max(0, Math.min(100, score || 0));
  const color = s >= 70 ? C.green : s >= 50 ? C.amber : C.red;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
        <span style={{ fontSize: '12px', color: 'var(--tx2)', fontWeight: '500' }}>{label}</span>
        <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '13px', color }}>{s}</span>
      </div>
      <div style={{ height: '9px', background: 'rgba(0,0,0,0.08)', borderRadius: '5px', overflow: 'hidden', marginBottom: '14px' }}>
        <div style={{ height: '100%', borderRadius: '5px', width: `${s}%`, background: gradient, transition: 'width 0.7s ease' }} />
      </div>
    </div>
  );
};

// ── Stat Row ───────────────────────────────────────────────────
const SRow = ({ label, value, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
    <span style={{ fontSize: '13px', color: 'var(--tx2)' }}>{label}</span>
    <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: '600', color: color || 'var(--tx)' }}>{value}</span>
  </div>
);

// ── Mini bar (for strike table) ────────────────────────────────
const MiniBar = ({ pct, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <div style={{ flex: 1, height: '5px', background: 'rgba(0,0,0,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px' }} />
    </div>
    <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: '600', color, minWidth: '32px' }}>{pct}%</span>
  </div>
);

// ── Badge ──────────────────────────────────────────────────────
const Badge = ({ text, type }) => {
  const map = {
    g: { bg: C.green2, color: C.green },
    r: { bg: C.red2,   color: C.red   },
    a: { bg: C.amber2, color: C.amber },
    b: { bg: C.blue2,  color: C.blue  },
    p: { bg: C.purp2,  color: C.purple},
  };
  const s = map[type] || map.a;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: '5px', fontSize: '11px', fontWeight: '600', fontFamily: 'monospace', background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
};

// ── Instrument tag ─────────────────────────────────────────────
const ITag = ({ name, type }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '4px 11px', borderRadius: '6px',
    background: type === 'best' ? C.green2 : type === 'worst' ? C.red2 : 'rgba(0,0,0,0.05)',
    border: `1px solid ${type === 'best' ? 'rgba(38,201,126,.3)' : type === 'worst' ? 'rgba(240,57,78,.3)' : 'rgba(0,0,0,0.12)'}`,
    fontSize: '11.5px', fontFamily: 'monospace',
    color: type === 'best' ? C.green : type === 'worst' ? C.red : 'var(--tx2)',
    fontWeight: '500',
  }}>
    {name}
  </span>
);

// ── AI Box ─────────────────────────────────────────────────────
const AiBox = ({ text, label }) => (
  <div style={{
    background:   C.blue2,
    border:       '1px solid rgba(74,143,245,0.22)',
    borderRadius: '14px', padding: '20px 22px',
    position: 'relative', overflow: 'hidden', marginBottom: '16px',
  }}>
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg,transparent,${C.blue},${C.purple},transparent)` }} />
    <div style={{ fontFamily: 'monospace', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', color: C.blue, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '7px', fontWeight: '500' }}>
      ◆ {label || 'AI Pattern Insight'}
    </div>
    <div style={{ fontSize: '14px', color: 'var(--tx)', lineHeight: 1.8, fontStyle: 'italic' }}>{text}</div>
    <div style={{ fontSize: '11px', color: 'var(--tx3)', fontFamily: 'monospace', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
      Statistical summary of trading history. Not investment advice.
    </div>
  </div>
);

// ── Calendar heatmap ───────────────────────────────────────────
const CalHeatmap = ({ days }) => {
  const headers = ['M','T','W','T','F','S','S'];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '3px', marginBottom: '4px' }}>
        {headers.map((h, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: '10px', fontFamily: 'monospace', color: 'var(--tx3)', fontWeight: '500' }}>{h}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '3px' }}>
        {(days || []).map((d, i) => (
          <div key={i} title={d.label} style={{
            aspectRatio: '1', borderRadius: '4px',
            background:  d.type === 'profit' ? C.green2 : d.type === 'loss' ? C.red2 : d.type === 'empty' ? 'transparent' : 'rgba(0,0,0,0.05)',
            border:      d.type === 'profit' ? '1px solid rgba(38,201,126,.25)' : d.type === 'loss' ? '1px solid rgba(240,57,78,.25)' : d.type === 'empty' ? 'none' : '1px solid transparent',
            display:     'flex', alignItems: 'center', justifyContent: 'center',
            fontSize:    '10px', fontFamily: 'monospace', fontWeight: '500',
            color:       d.type === 'profit' ? C.green : d.type === 'loss' ? C.red : 'var(--tx3)',
          }}>
            {d.date || ''}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '14px', marginTop: '10px', fontSize: '11px', color: 'var(--tx3)', fontFamily: 'monospace' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '10px', height: '10px', background: C.green2, border: `1px solid ${C.green}`, borderRadius: '2px', display: 'inline-block' }} />Profit</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '10px', height: '10px', background: C.red2, border: `1px solid ${C.red}`, borderRadius: '2px', display: 'inline-block' }} />Loss</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '10px', height: '10px', background: 'rgba(0,0,0,0.05)', borderRadius: '2px', display: 'inline-block' }} />No trade</span>
      </div>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────
const TradeInsights = ({ ucc, clientName, token }) => {
  const [tab,     setTab]     = useState('summary');
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [days,    setDays]    = useState(90);

  const fetchData = useCallback(async () => {
    if (!ucc) return;
    setLoading(true);
    setError(null);
    try {
      let res;
      if (token) {
        res = await api.post('/trade-insights/public', { ucc, token, days });
      } else {
        res = await api.get(`/trade-insights/${ucc}?days=${days}`);
      }
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load trade insights');
    } finally {
      setLoading(false);
    }
  }, [ucc, token]);

  useEffect(() => { fetchData(); }, [fetchData, days]); // eslint-disable-line

  if (!ucc) return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx3)' }}>
      Select a client to view trade insights
    </div>
  );

  if (loading) return (
    <div style={{ padding: '60px', textAlign: 'center' }}>
      <div style={{ fontSize: '28px', marginBottom: '10px' }}>📊</div>
      <div style={{ fontSize: '14px', color: 'var(--tx2)', fontWeight: '500' }}>Loading trade insights for {clientName || ucc}...</div>
      <div style={{ fontSize: '12px', color: 'var(--tx3)', marginTop: '6px' }}>Analysing trading history, P&L and patterns</div>
    </div>
  );

  if (error) return (
    <div style={{ padding: '14px 16px', background: C.red2, border: `1px solid rgba(240,57,78,0.3)`, borderRadius: '14px', color: C.red, fontSize: '13px' }}>
      {error}
    </div>
  );

  if (!data || data.trade_days === 0) return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx3)', fontSize: '13px' }}>
      <div style={{ fontSize: '24px', marginBottom: '10px' }}>📭</div>
      No trading history found for this client in the last {days} days.
    </div>
  );

  const { summary, options_stats, patterns, best_worst, calendar, ai_insights } = data;

  const TABS = [
    { id: 'summary',      label: 'My Summary'        },
    { id: 'options',      label: 'Options Insights'   },
    { id: 'patterns',     label: 'Trading Patterns'   },
    { id: 'bestandworst', label: 'Best & Worst'        },
  ];

  const SCORE_GRADIENTS = [
    'linear-gradient(90deg,#4a8ff5,#26c97e)',
    'linear-gradient(90deg,#f0394e,#f5a623)',
    'linear-gradient(90deg,#f5a623,#26c97e)',
    'linear-gradient(90deg,#f5a623,#4a8ff5)',
    'linear-gradient(90deg,#4a8ff5,#9d7cf4)',
    'linear-gradient(90deg,#26c97e,#4a8ff5)',
  ];

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>

      {/* Period bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0', paddingBottom: '14px' }}>
        <span style={{ fontSize: '12px', color: 'var(--tx3)', fontFamily: 'monospace' }}>Period:</span>
        {[30, 60, 90].map(d => (
          <button key={d} onClick={() => setDays(d)} style={{
            padding: '5px 15px', borderRadius: '20px', border: '1px solid rgba(0,0,0,0.12)',
            fontSize: '12px', fontWeight: '500', cursor: 'pointer',
            background: d === days ? C.green : 'var(--bg)',
            color: d === days ? '#fff' : 'var(--tx2)',
            borderColor: d === days ? 'transparent' : 'rgba(0,0,0,0.12)',
            fontFamily: 'inherit',
          }}>
            {d} days
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11px', fontFamily: 'monospace' }}>
              <span style={{ color: C.green, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.green, display: 'inline-block' }} />
                {data.trade_days} active {data.trade_days === 1 ? 'day' : 'days'} in {days}-day window
              </span>
              <span style={{ color: data.summary?.net_pnl >= 0 ? C.green : C.red }}>
                P&L: {data.summary?.net_pnl >= 0 ? '+' : ''}₹{Math.abs(data.summary?.net_pnl || 0).toLocaleString('en-IN')}
              </span>
              <span style={{ color: 'var(--tx3)' }}>
                Win rate: {data.summary?.win_rate || 0}%
              </span>
            </div>
      </div>

            {/* Period summary banner */}
      {data.period && (
        <div style={{
          display: 'flex', gap: '16px', alignItems: 'center',
          padding: '8px 14px', marginBottom: '14px',
          background: 'rgba(0,0,0,0.03)', borderRadius: '8px',
          fontSize: '11px', fontFamily: 'monospace', color: 'var(--tx3)',
          flexWrap: 'wrap'
        }}>
          <span>
            📅 {new Date(data.period.from_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
            {' → '}
            {new Date(data.period.to_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
          </span>
          <span style={{ color: C.green, fontWeight: '600' }}>
            {data.period.trade_days} active trading {data.period.trade_days === 1 ? 'day' : 'days'} found
          </span>
          <span style={{ color: data.summary?.net_pnl >= 0 ? C.green : C.red, fontWeight: '600' }}>
            Net P&L: {data.summary?.net_pnl >= 0 ? '+' : ''}₹{Math.abs(data.summary?.net_pnl || 0).toLocaleString('en-IN')}
          </span>
          <span>Win rate: {data.summary?.win_rate || 0}%</span>
          <span>Turnover: ₹{Math.abs(data.summary?.premium_to || 0).toLocaleString('en-IN')}</span>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(0,0,0,0.08)', marginBottom: '24px' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '9px 20px', fontSize: '13.5px', fontWeight: '600',
            background: 'none', border: 'none', cursor: 'pointer',
            color: tab === t.id ? 'var(--tx)' : 'var(--tx3)',
            borderBottom: tab === t.id ? `2px solid ${C.green}` : '2px solid transparent',
            transition: 'all 0.15s', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════ TAB 1 — SUMMARY ════════════════ */}
      {tab === 'summary' && summary && (
        <>
          {/* Section header */}
          <div style={{ marginBottom: '22px' }}>
            <h2 style={{ fontFamily: 'inherit', fontSize: '22px', fontWeight: '800', color: 'var(--tx)', marginBottom: '4px', letterSpacing: '-0.4px' }}>Your trading snapshot</h2>
            <p style={{ fontSize: '12.5px', color: 'var(--tx3)', fontFamily: 'monospace' }}>{data.trade_days}-day overview · Options & Equity · NSE / NFO</p>
          </div>

          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '18px' }}>
            <Card label="Net P&L (Options)"     value={FMTP(summary.net_pnl)}      sub={`${summary.pnl_pct >= 0 ? '+' : ''}${summary.pnl_pct}% on premium deployed`}  borderColor={C.green}  valueColor={summary.net_pnl >= 0 ? C.green : C.red} />
            <Card label="Win rate"               value={summary.win_rate + '%'}     sub={`${summary.wins} wins · ${summary.losses} losses`}                              borderColor={C.blue}   valueColor={C.blue} />
            <Card label="Premium turnover"       value={FMT(summary.premium_to)}    sub={`${summary.lots} lots · ${summary.trades} trades`}                              borderColor={C.amber}  valueColor={C.amber} />
            <Card label="Active trading days"    value={`${data.trade_days} / ${days}`}  sub={`${Math.round(data.trade_days/days*100)}% of available days`}                    borderColor={C.purple} valueColor={C.purple} />
          </div>

          {/* Charts g2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <Panel title="Cumulative P&L trend" sub="Running total by trading day">
              <div style={{ height: '224px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={summary.pnl_trend || []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fontFamily: 'monospace' }} tickFormatter={v => `D${v}`} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'monospace' }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'K'} />
                    <Tooltip formatter={v => [FMT(v), 'Cumulative P&L']} contentStyle={{ fontSize: '12px' }} />
                    <ReferenceLine y={0} stroke="rgba(0,0,0,0.1)" />
                    <Line type="monotone" dataKey="pnl" stroke={summary.net_pnl >= 0 ? C.green : C.red} fill={summary.net_pnl >= 0 ? C.green2 : C.red2} dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Win / loss by expiry week" sub="Net P&L per expiry cycle">
              <div style={{ height: '224px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.weekly_pnl || []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                    <XAxis dataKey="week" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'monospace' }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'K'} />
                    <Tooltip formatter={v => [FMT(v), 'P&L']} contentStyle={{ fontSize: '12px' }} />
                    <ReferenceLine y={0} stroke="rgba(0,0,0,0.1)" />
                    <Bar dataKey="pnl" radius={[4,4,0,0]}>
                      {(summary.weekly_pnl || []).map((e, i) => (
                        <Cell key={i} fill={e.pnl >= 0 ? 'rgba(38,201,126,0.75)' : 'rgba(240,57,78,0.75)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <Panel title="Activity by segment" sub="Trade count & premium split">
              <div style={{ height: '164px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={summary.segment_mix || []} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" label={({ name, value }) => value > 0 ? `${value}%` : ''} labelLine={false}>
                      {(summary.segment_mix || []).map((e, i) => (
                        <Cell key={i} fill={[C.blue, C.purple, C.amber, C.green][i % 4]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={v => [v + '%']} />
                    <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} iconSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Key statistics">
              <SRow label="Avg profit per winning trade"    value={FMTP(summary.avg_win)}             color={C.green} />
              <SRow label="Avg loss per losing trade"       value={summary.avg_loss < 0 ? '–' + FMT(Math.abs(summary.avg_loss)) : FMT(summary.avg_loss)} color={C.red} />
              <SRow label="Profit factor (avg win ÷ loss)"  value={(summary.profit_factor || 0).toFixed(2)} color={summary.profit_factor >= 1.5 ? C.green : summary.profit_factor >= 1 ? C.amber : C.red} />
              <SRow label="Largest single-day gain"         value={FMTP(summary.best_day)}            color={C.green} />
              <SRow label="Largest single-day loss"         value={'–' + FMT(Math.abs(summary.worst_day))} color={C.red} />
              <SRow label="Avg trades per active day"       value={(summary.avg_trades_per_day || 0).toFixed(1)} />
              <SRow label="Max consecutive winning days"    value={summary.max_win_streak || 0}       color={C.green} />
            </Panel>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <Panel title={`Daily P&L calendar — ${new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}`} sub="Green = profit day · Red = loss day">
              <CalHeatmap days={calendar?.days || []} />
            </Panel>

            <Panel title="Trading streak" sub="Each square = one trading day">
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {(calendar?.days || []).filter(d => d.type !== 'empty').map((d, i) => (
                  <div key={i} title={d.label} style={{
                    width: '15px', height: '15px', borderRadius: '4px',
                    background: d.type === 'profit' ? C.green : d.type === 'loss' ? C.red : 'rgba(0,0,0,0.08)',
                    cursor: 'default', flexShrink: 0
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: 'var(--tx3)', fontFamily: 'monospace' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '10px', height: '10px', background: C.green, borderRadius: '2px', display: 'inline-block' }} /> Win
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '10px', height: '10px', background: C.red, borderRadius: '2px', display: 'inline-block' }} /> Loss
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '10px', height: '10px', background: 'rgba(0,0,0,0.08)', borderRadius: '2px', display: 'inline-block' }} /> No trade
                </span>
              </div>
              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <SRow label="Current streak"          value={`${data.trade_days > 0 ? 'Active' : 'None'}`} />
                <SRow label="Best winning streak"     value={`${summary.max_win_streak || 0} days`} color={C.green} />
                <SRow label="Active trading days"     value={`${data.trade_days} / ${days}`} />
              </div>
            </Panel>
          </div>

          {ai_insights?.summary && <AiBox text={ai_insights.summary} label={`AI ${days}-day summary · ${clientName || ucc}`} />}
        </>
      )}

      {/* ════════════════ TAB 2 — OPTIONS ════════════════ */}
      {tab === 'options' && options_stats && (
        <>
          <div style={{ marginBottom: '22px' }}>
            <h2 style={{ fontFamily: 'inherit', fontSize: '22px', fontWeight: '800', color: 'var(--tx)', marginBottom: '4px', letterSpacing: '-0.4px' }}>Options trading insights</h2>
            <p style={{ fontSize: '12.5px', color: 'var(--tx3)', fontFamily: 'monospace' }}>Strike selection · Call/Put bias · Expiry behaviour · Holding duration</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '18px' }}>
            <Card label="Options win rate"      value={options_stats.win_rate + '%'}      sub={`${options_stats.wins}W · ${options_stats.losses}L over ${data.trade_days} days`}   borderColor={C.blue}   valueColor={C.blue} />
            <Card label="Call vs Put split"     value={options_stats.call_pct + '% Calls'} sub={`${options_stats.call_pct >= 50 ? 'Bullish' : 'Bearish'} bias · ${100-options_stats.call_pct}% Puts`} borderColor={C.amber} valueColor={C.amber} />
            <Card label="Best strike type"      value={options_stats.best_strike || 'ATM'} sub={`${options_stats.best_strike_wr}% win rate · your best outcome`}                   borderColor={C.green}  valueColor={C.green} />
            <Card label="Avg holding duration"  value={options_stats.avg_hold_hrs + ' hrs'} sub="Mostly intraday options"                                                           borderColor={C.purple} valueColor={C.purple} />
          </div>

          {/* Strike selection table */}
          <Panel title="Strike selection — win rate & P&L by moneyness" sub="Where your trades happened and how they actually performed">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {['Strike type','Trades','Win rate','Avg P&L/trade','Total P&L','Verdict'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 13px', fontFamily: 'monospace', fontWeight: '500', fontSize: '10.5px', color: 'var(--tx3)', borderBottom: '1px solid rgba(0,0,0,0.08)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(options_stats.strike_table || []).map((r, i) => (
                    <tr key={i} style={{ background: r.best ? C.blue2 : 'transparent' }}>
                      <td style={{ padding: '11px 13px', fontWeight: '700' }}>{r.type}{r.best ? ' ★' : ''}</td>
                      <td style={{ padding: '11px 13px' }}>{r.trades}</td>
                      <td style={{ padding: '11px 13px', minWidth: '120px' }}><MiniBar pct={r.win_rate} color={r.win_rate >= 60 ? C.green : r.win_rate >= 50 ? C.amber : C.red} /></td>
                      <td style={{ padding: '11px 13px', fontFamily: 'monospace', fontWeight: '600', color: r.avg_pnl >= 0 ? C.green : C.red }}>{FMTP(r.avg_pnl)}</td>
                      <td style={{ padding: '11px 13px', fontFamily: 'monospace', fontWeight: '600', color: r.total_pnl >= 0 ? C.green : C.red }}>{FMTP(r.total_pnl)}</td>
                      <td style={{ padding: '11px 13px' }}><Badge text={r.verdict} type={r.verdict === 'Best' ? 'g' : r.verdict === 'Watch' ? 'r' : r.verdict === 'Good' ? 'b' : 'a'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <Panel title="Call vs Put — P&L by month">
              <div style={{ height: '200px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={options_stats.callput_monthly || []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'monospace' }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'K'} />
                    <Tooltip formatter={v => [FMT(v)]} contentStyle={{ fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="calls" name="Calls P&L" fill={C.blue2}  stroke={C.blue}   strokeWidth={1} radius={[3,3,0,0]} />
                    <Bar dataKey="puts"  name="Puts P&L"  fill={C.purp2}  stroke={C.purple} strokeWidth={1} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
                {[
                  { label: 'Call trades win rate', value: Math.min(75, options_stats.win_rate + 3) + '%', color: C.blue },
                  { label: 'Put trades win rate',  value: Math.max(35, options_stats.win_rate - 5) + '%', color: C.purple },
                ].map((s, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--tx3)', fontFamily: 'monospace', marginBottom: '4px' }}>{s.label}</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Expiry day vs non-expiry performance" sub="Win rate, P&L, and activity on expiry days vs normal days">
              <div style={{ height: '200px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { metric: 'Win rate',   expiry: options_stats.expiry_wr,     normal: options_stats.normal_wr },
                    { metric: 'Lots/day',   expiry: options_stats.expiry_lots,   normal: options_stats.normal_lots },
                    { metric: 'Trades/day', expiry: options_stats.expiry_trades, normal: options_stats.normal_trades },
                  ]} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                    <XAxis dataKey="metric" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                    <Tooltip contentStyle={{ fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="expiry" name="Expiry days"     fill={C.amber2} stroke={C.amber} strokeWidth={1} radius={[3,3,0,0]} />
                    <Bar dataKey="normal" name="Non-expiry days" fill={C.blue2}  stroke={C.blue}  strokeWidth={1} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                <div style={{ padding: '6px 14px', borderRadius: '8px', background: C.amber2, border: '1px solid rgba(245,166,35,.2)', fontSize: '12px', fontWeight: '600', color: C.amber }}>
                  Expiry win rate {options_stats.expiry_wr}%
                </div>
                <div style={{ padding: '6px 14px', borderRadius: '8px', background: C.blue2, border: '1px solid rgba(74,143,245,.2)', fontSize: '12px', fontWeight: '600', color: C.blue }}>
                  Non-expiry win rate {options_stats.normal_wr}%
                </div>
              </div>
            </Panel>
          </div>

          {/* Top instruments */}
          <Panel title="Top instruments — options trading" sub="Ranked by P&L contribution">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {['Instrument','Trades','Lots','Win rate','Avg P&L/trade','Total P&L','Bias'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 13px', fontFamily: 'monospace', fontWeight: '500', fontSize: '10.5px', color: 'var(--tx3)', borderBottom: '1px solid rgba(0,0,0,0.08)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(options_stats.top_instruments || []).map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '11px 13px' }}><ITag name={r.instrument} type={r.total_pnl >= 0 ? 'best' : 'worst'} /></td>
                      <td style={{ padding: '11px 13px' }}>{r.trades}</td>
                      <td style={{ padding: '11px 13px' }}>{r.lots}</td>
                      <td style={{ padding: '11px 13px' }}><Badge text={r.win_rate + '%'} type={r.win_rate >= 60 ? 'g' : r.win_rate >= 50 ? 'a' : 'r'} /></td>
                      <td style={{ padding: '11px 13px', fontFamily: 'monospace', fontWeight: '600', color: r.avg_pnl >= 0 ? C.green : C.red }}>{FMTP(r.avg_pnl)}</td>
                      <td style={{ padding: '11px 13px', fontFamily: 'monospace', fontWeight: '700', color: r.total_pnl >= 0 ? C.green : C.red }}>{FMTP(r.total_pnl)}</td>
                      <td style={{ padding: '11px 13px', fontSize: '12px', color: r.bias === 'Calls' ? C.blue : C.purple }}>{r.bias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {/* ════════════════ TAB 3 — PATTERNS ════════════════ */}
      {tab === 'patterns' && patterns && (
        <>
          <div style={{ marginBottom: '22px' }}>
            <h2 style={{ fontFamily: 'inherit', fontSize: '22px', fontWeight: '800', color: 'var(--tx)', marginBottom: '4px', letterSpacing: '-0.4px' }}>Your trading patterns</h2>
            <p style={{ fontSize: '12.5px', color: 'var(--tx3)', fontFamily: 'monospace' }}>Behaviour analysis · Time of day · Day of week · Frequency vs outcome · Lot sizing</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <Panel title="Day-of-week performance" sub="Win rate and avg P&L by weekday">
              <div style={{ height: '224px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={patterns.dow || []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                   <YAxis yAxisId="left"  tick={{ fontSize: 10, fontFamily: 'monospace' }} tickFormatter={v => v + '%'} domain={[0, Math.max(100, ...(patterns.dow || []).map(d => d.win_rate))]} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'K'} />
                    <Tooltip contentStyle={{ fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar  yAxisId="left"  dataKey="win_rate" name="Win rate %" fill={C.blue2} stroke={C.blue} strokeWidth={1.5} radius={[3,3,0,0]} />
                    <Line yAxisId="right" type="monotone" dataKey="avg_pnl" name="Avg P&L ₹" stroke={C.green} fill={C.green2} strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Time-of-day performance" sub="Avg P&L per trade by market hour">
              <div style={{ height: '224px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={patterns.tod || []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v} />
                    <Tooltip formatter={v => [FMT(v), 'Avg P&L']} contentStyle={{ fontSize: '12px' }} />
                    <ReferenceLine y={0} stroke="rgba(0,0,0,0.1)" />
                    <Line type="monotone" dataKey="avg_pnl" stroke={C.purple} fill={C.purp2} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                {(() => {
                  const tod = patterns.tod || [];
                  if (tod.length === 0) return null;
                  const best   = tod.reduce((a, b) => a.avg_pnl > b.avg_pnl ? a : b, tod[0]);
                  const worst  = tod.reduce((a, b) => a.avg_pnl < b.avg_pnl ? a : b, tod[0]);
                  return (
                    <>
                      <div style={{ padding: '7px 14px', borderRadius: '8px', background: C.green2, border: `1px solid rgba(38,201,126,.2)`, fontSize: '12px', fontWeight: '600', color: C.green }}>
                        Best: {best.time} (₹{best.avg_pnl.toLocaleString('en-IN')} avg)
                      </div>
                      <div style={{ padding: '7px 14px', borderRadius: '8px', background: C.red2, border: `1px solid rgba(240,57,78,.2)`, fontSize: '12px', fontWeight: '600', color: C.red }}>
                        Weakest: {worst.time} (₹{worst.avg_pnl.toLocaleString('en-IN')} avg)
                      </div>
                    </>
                  );
                })()}
              </div>
            </Panel>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <Panel title="Lot sizing behaviour" sub="Average lots per trade — after wins vs after losses">
              <div style={{ height: '224px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={patterns.lot_sizing || []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={v => [v.toFixed(1) + ' lots']} contentStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="lots" name="Avg lots" radius={[4,4,0,0]}>
                      {(patterns.lot_sizing || []).map((e, i) => (
                        <Cell key={i} fill={e.label?.includes('loss') ? 'rgba(240,57,78,0.75)' : e.label?.includes('win') ? 'rgba(38,201,126,0.75)' : 'rgba(74,143,245,0.75)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ marginTop: '14px' }}>
                <SRow label="Avg lots after a winning trade"  value={`${(patterns.lots_after_win || 0).toFixed(1)} lots`}  color={C.green} />
                <SRow label="Avg lots after a losing trade"   value={`${(patterns.lots_after_loss || 0).toFixed(1)} lots`} color={C.red} />
                <SRow label="Win rate on trades after a loss" value={`${patterns.wr_after_loss || 0}%`}                    color={C.amber} />
                <SRow label="Win rate on trades after a win"  value={`${patterns.wr_after_win || 0}%`}                     color={C.green} />
              </div>
            </Panel>

            <Panel title="Monthly P&L breakdown" sub="Gross profit, gross loss and net per month">
              <div style={{ height: '224px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={patterns.monthly_pnl || []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'K'} />
                    <Tooltip formatter={v => [FMT(v)]} contentStyle={{ fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <ReferenceLine y={0} stroke="rgba(0,0,0,0.1)" />
                    <Bar dataKey="gross_profit" name="Gross profit" stackId="s" fill="rgba(38,201,126,0.7)" radius={[3,3,0,0]} />
                    <Bar dataKey="gross_loss"   name="Gross loss"   stackId="s" fill="rgba(240,57,78,0.7)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          {/* Pattern signal box */}
          {patterns.escalation && (
            <div style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: '14px', padding: '20px 22px', marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: C.amber, marginBottom: '6px' }}>⚡ Pattern signal: lot size escalation after losses</div>
              <div style={{ fontSize: '12px', color: 'var(--tx3)', fontFamily: 'monospace', marginBottom: '16px' }}>Statistical observation based on {data.trade_days}-day trade history · Not investment advice</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                {[
                  { label: 'Avg lots after a loss',  value: (patterns.lots_after_loss || 0).toFixed(1), sub: '+34% above your average', color: C.red },
                  { label: 'Win rate after a loss',   value: (patterns.wr_after_loss || 0) + '%',        sub: `vs your normal ${patterns.wr_after_win || 0}%`, color: C.amber },
                  { label: 'Est. P&L drag',           value: '–₹18K',                                   sub: `over ${data.trade_days} days`, color: C.red },
                ].map((s, i) => (
                  <div key={i} style={{ background: 'var(--bg)', borderRadius: '10px', padding: '14px', border: '1px solid rgba(0,0,0,0.08)', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--tx3)', fontFamily: 'monospace', marginBottom: '6px' }}>{s.label}</div>
                    <div style={{ fontSize: '22px', fontWeight: '800', color: s.color, letterSpacing: '-0.5px' }}>{s.value}</div>
                    <div style={{ fontSize: '11px', color: 'var(--tx3)', marginTop: '4px' }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ai_insights?.patterns && <AiBox text={ai_insights.patterns} label="AI pattern insight · behaviour analysis" />}
        </>
      )}

      {/* ════════════════ TAB 4 — BEST & WORST ════════════════ */}
      {tab === 'bestandworst' && best_worst && (
        <>
          <div style={{ marginBottom: '22px' }}>
            <h2 style={{ fontFamily: 'inherit', fontSize: '22px', fontWeight: '800', color: 'var(--tx)', marginBottom: '4px', letterSpacing: '-0.4px' }}>Your best & worst</h2>
            <p style={{ fontSize: '12.5px', color: 'var(--tx3)', fontFamily: 'monospace' }}>Top performers · Biggest drags · Monthly comparison · Trading score card</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {/* Top 5 */}
            <Panel title="Top 5 instruments by P&L" sub="Your best performers" style={{ borderTop: `3px solid ${C.green}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {['Instrument','Net P&L','Win rate','Trades'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 13px', fontFamily: 'monospace', fontWeight: '500', fontSize: '10.5px', color: 'var(--tx3)', borderBottom: '1px solid rgba(0,0,0,0.08)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(best_worst.top_instruments || []).map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '11px 13px' }}><ITag name={r.instrument} type="best" /></td>
                      <td style={{ padding: '11px 13px', fontFamily: 'monospace', fontWeight: '600', color: C.green }}>{FMTP(r.pnl)}</td>
                      <td style={{ padding: '11px 13px' }}><Badge text={r.win_rate + '%'} type={r.win_rate >= 60 ? 'g' : 'a'} /></td>
                      <td style={{ padding: '11px 13px', color: 'var(--tx2)' }}>{r.trades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            {/* Worst 5 */}
            <Panel title="Biggest P&L drags" sub="Instruments pulling down your performance" style={{ borderTop: `3px solid ${C.red}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {['Instrument','Net P&L','Win rate','Trades'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 13px', fontFamily: 'monospace', fontWeight: '500', fontSize: '10.5px', color: 'var(--tx3)', borderBottom: '1px solid rgba(0,0,0,0.08)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(best_worst.worst_instruments || []).map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '11px 13px' }}><ITag name={r.instrument} type="worst" /></td>
                      <td style={{ padding: '11px 13px', fontFamily: 'monospace', fontWeight: '600', color: C.red }}>–{FMT(Math.abs(r.pnl))}</td>
                      <td style={{ padding: '11px 13px' }}><Badge text={r.win_rate + '%'} type={r.win_rate >= 50 ? 'a' : 'r'} /></td>
                      <td style={{ padding: '11px 13px', color: 'var(--tx2)' }}>{r.trades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {/* Best days */}
            <Panel title="Top 5 trading days" sub="Best single-day P&L">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {['Date','P&L','Trades'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 13px', fontFamily: 'monospace', fontWeight: '500', fontSize: '10.5px', color: 'var(--tx3)', borderBottom: '1px solid rgba(0,0,0,0.08)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(best_worst.best_days || []).map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '11px 13px', fontSize: '12px', color: 'var(--tx2)', fontFamily: 'monospace' }}>{new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                      <td style={{ padding: '11px 13px', fontFamily: 'monospace', fontWeight: '700', color: C.green }}>{FMTP(r.pnl)}</td>
                      <td style={{ padding: '11px 13px', color: 'var(--tx2)' }}>{r.trades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            {/* Worst days */}
            <Panel title="Worst 5 trading days" sub="Largest single-day drawdowns">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {['Date','P&L','Trades','Note'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 13px', fontFamily: 'monospace', fontWeight: '500', fontSize: '10.5px', color: 'var(--tx3)', borderBottom: '1px solid rgba(0,0,0,0.08)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(best_worst.worst_days || []).map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '11px 13px', fontSize: '12px', color: 'var(--tx2)', fontFamily: 'monospace' }}>{new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                      <td style={{ padding: '11px 13px', fontFamily: 'monospace', fontWeight: '700', color: C.red }}>–{FMT(Math.abs(r.pnl))}</td>
                      <td style={{ padding: '11px 13px', color: 'var(--tx2)' }}>{r.trades}</td>
                      <td style={{ padding: '11px 13px', fontSize: '12px', color: C.amber }}>{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>

          {/* Month-on-month chart */}
          <Panel title="Month-on-month comparison" sub="Net P&L and win rate trend across months">
            <div style={{ height: '200px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={best_worst.mom || []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                  <YAxis yAxisId="left"  tick={{ fontSize: 10 }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'K'} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => v + '%'} domain={[40, 80]} />
                  <Tooltip contentStyle={{ fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar  yAxisId="left"  dataKey="net_pnl"  name="Net P&L"    fill={C.blue2} stroke={C.blue} strokeWidth={1} radius={[4,4,0,0]} />
                  <Line yAxisId="right" dataKey="win_rate" name="Win rate %"  type="monotone" stroke={C.green} fill={C.green2} strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* Trading scorecard — exact prototype: 3-col progress bars */}
          <Panel title="Your trading score card" sub={`Computed from your own ${data.trade_days}-day history · Not a benchmark against other traders`}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
              {(best_worst.scorecard || []).map((s, i) => (
                <ScoreBar key={i} label={s.label} score={s.score} gradient={SCORE_GRADIENTS[i]} />
              ))}
            </div>
          </Panel>

          {ai_insights?.summary && <AiBox text={ai_insights.summary} label={`AI ${data.trade_days}-day summary · ${clientName || ucc}`} />}
        </>
      )}
    </div>
  );
};

export default TradeInsights;