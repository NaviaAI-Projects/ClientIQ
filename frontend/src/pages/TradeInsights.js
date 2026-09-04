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
  navy:   '#1B3F7A',   // Navia brand — used for UI chrome (tabs, period pills) so P&L green/red stay semantic
};

// Shared, high-contrast tooltip styling so hover values are always legible.
// (Series colours are faint 13%-opacity pastels, which recharts otherwise
//  reuses for the tooltip text — making the numbers nearly invisible.)
const TT_CONTENT = { fontSize: '12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 6px 22px rgba(0,0,0,0.16)', color: '#1e293b' };
// No `color` here on purpose: each value keeps its own series colour (calls=blue, puts=purple,
// etc.) so the tooltip shows the colour difference — just bold, on a solid card, so it's legible.
const TT_ITEM    = { fontWeight: 700 };
const TT_LABEL   = { color: '#1e293b', fontWeight: 700 };

const FMT = v => {
  const n = parseFloat(v) || 0;
  const prefix = n < 0 ? '–₹' : '₹';
  // Exact value — full digits with thousands separators, paise kept when present (no K/L/Cr abbreviation, no whole-rupee rounding).
  return prefix + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const FMTP = v => {
  const n = parseFloat(v) || 0;
  return (n >= 0 ? '+' : '') + FMT(n);
};

// Rounded variants (whole rupees, no paise) — used on the Best & Worst tab.
const FMTR = v => {
  const n = parseFloat(v) || 0;
  const prefix = n < 0 ? '–₹' : '₹';
  return prefix + Math.round(Math.abs(n)).toLocaleString('en-IN');
};
const FMTPR = v => {
  const n = parseFloat(v) || 0;
  return (n >= 0 ? '+' : '') + FMTR(n);
};

// ── KPI Card — exact prototype structure ───────────────────────
const Card = ({ label, value, sub, borderColor, valueColor }) => {
  const accent = borderColor || C.blue;
  return (
  <div style={{
    background:   'var(--bg)',
    border:       '1px solid var(--br)',
    borderRadius: '15px',
    padding:      '16px 18px',
    boxShadow:    '0 2px 10px rgba(16,24,40,0.05)',
    position:     'relative', overflow: 'hidden',
  }} className="ti-card">
    {/* gradient top accent — brand-coloured per card */}
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${accent}, ${accent}44)` }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: accent, flexShrink: 0 }} />
      <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
        {label}
      </div>
    </div>
    <div style={{ fontFamily: "'Sora', sans-serif", fontSize: '28px', fontWeight: '800', lineHeight: 1.05, marginBottom: '5px', letterSpacing: '-0.6px', color: valueColor || 'var(--tx)' }}>
      {value}
    </div>
    <div style={{ fontSize: '12px', color: 'var(--tx3)' }}>{sub}</div>
  </div>
  );
};

// ── Info dot — small "i" with a hover tooltip (self-contained) ──
const InfoDot = ({ text }) => {
  const [show, setShow] = useState(false);
  if (!text) return null;
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '15px', height: '15px', borderRadius: '50%',
        border: '1px solid rgba(0,0,0,0.28)', color: 'var(--tx3)',
        fontSize: '10px', fontStyle: 'italic', fontFamily: 'Georgia, serif',
        cursor: 'help', lineHeight: 1, userSelect: 'none',
      }}>i</span>
      {show && (
        <span style={{
          position: 'absolute', top: '20px', left: '0', zIndex: 60,
          width: '240px', background: '#1e293b', color: '#fff',
          fontSize: '11px', lineHeight: 1.5, fontWeight: 400,
          padding: '8px 10px', borderRadius: '8px',
          boxShadow: '0 6px 22px rgba(0,0,0,0.28)',
          fontFamily: "system-ui, sans-serif", whiteSpace: 'normal',
        }}>{text}</span>
      )}
    </span>
  );
};

// ── Panel ──────────────────────────────────────────────────────
const Panel = ({ title, sub, info, children, style }) => (
  <div className="ti-panel" style={{
    background: 'var(--bg)', border: '1px solid var(--br)',
    borderRadius: '15px', padding: '16px 18px', marginBottom: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', ...style
  }}>
    {title && (
      <div style={{ marginBottom: '13px' }}>
        <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--tx)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '3px', height: '15px', borderRadius: '2px', background: C.navy, flexShrink: 0 }} />
          {title}<InfoDot text={info} />
        </div>
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
const CalHeatmap = ({ days, tradeMode }) => {
  const headers = ['M','T','W','T','F','S','S'];
  // In tradeMode (CNC-only clients) the calendar maps traded days in blue instead of P&L colours.
  const bg = (d) => tradeMode
    ? (d.type === 'empty' ? 'transparent' : d.traded ? C.blue2 : 'rgba(0,0,0,0.05)')
    : (d.type === 'profit' ? C.green2 : d.type === 'loss' ? C.red2 : d.type === 'empty' ? 'transparent' : 'rgba(0,0,0,0.05)');
  const brd = (d) => tradeMode
    ? (d.traded ? `1px solid rgba(74,143,245,.35)` : d.type === 'empty' ? 'none' : '1px solid transparent')
    : (d.type === 'profit' ? '1px solid rgba(38,201,126,.25)' : d.type === 'loss' ? '1px solid rgba(240,57,78,.25)' : d.type === 'empty' ? 'none' : '1px solid transparent');
  const clr = (d) => tradeMode ? (d.traded ? C.blue : 'var(--tx3)') : (d.type === 'profit' ? C.green : d.type === 'loss' ? C.red : 'var(--tx3)');
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '3px', marginBottom: '4px' }}>
        {headers.map((h, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: '10px', fontFamily: 'monospace', color: 'var(--tx3)', fontWeight: '500' }}>{h}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '3px' }}>
        {(days || []).map((d, i) => (
          <div key={i} title={tradeMode ? (d.traded ? `${d.trades} trades` : (d.type === 'empty' ? '' : 'No trade')) : d.label} style={{
            aspectRatio: '1', borderRadius: '4px',
            background:  bg(d), border: brd(d),
            display:     'flex', alignItems: 'center', justifyContent: 'center',
            fontSize:    '10px', fontFamily: 'monospace', fontWeight: '500',
            color:       clr(d),
          }}>
            {d.date || ''}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '14px', marginTop: '10px', fontSize: '11px', color: 'var(--tx3)', fontFamily: 'monospace' }}>
        {tradeMode ? (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '10px', height: '10px', background: C.blue2, border: `1px solid ${C.blue}`, borderRadius: '2px', display: 'inline-block' }} />Traded</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '10px', height: '10px', background: 'rgba(0,0,0,0.05)', borderRadius: '2px', display: 'inline-block' }} />No trade</span>
          </>
        ) : (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '10px', height: '10px', background: C.green2, border: `1px solid ${C.green}`, borderRadius: '2px', display: 'inline-block' }} />Profit</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '10px', height: '10px', background: C.red2, border: `1px solid ${C.red}`, borderRadius: '2px', display: 'inline-block' }} />Loss</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '10px', height: '10px', background: 'rgba(0,0,0,0.05)', borderRadius: '2px', display: 'inline-block' }} />No trade</span>
          </>
        )}
      </div>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────
const TradeInsights = ({ ucc, clientName, token, jsucc }) => {
  const [tab,     setTab]     = useState('summary');
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [days,    setDays]    = useState(90);

  const fetchData = useCallback(async () => {
    if (!ucc && !jsucc) return;
    setLoading(true);
    setError(null);
    try {
      let res;
      if (jsucc) {
        // Encrypted SSO link — the UCC is inside the jsucc token, decrypted server-side.
        res = await api.post('/trade-insights/sso', { jsucc, days });
      } else if (token) {
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
  }, [ucc, token, jsucc, days]);

  useEffect(() => { fetchData(); }, [fetchData, days]); // eslint-disable-line

  if (!ucc && !jsucc) return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx3)' }}>
      Select a client to view trade insights
    </div>
  );

  if (loading) return (
    <div style={{ padding: '60px', textAlign: 'center' }}>
      <div style={{ fontSize: '28px', marginBottom: '10px' }}>📊</div>
      <div style={{ fontSize: '14px', color: 'var(--tx2)', fontWeight: '500' }}>Loading trade insights for {clientName || ucc || 'your account'}...</div>
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

  // P&L is only meaningful for intraday (MIS) trading. A CNC-only (delivery) client has no
  // real intraday P&L, so those panels render "Not applicable" and only trade-activity
  // views (trade calendar, time-of-day) are shown.
  const pnlNA = data.pnl_applicable === false;
  const NA = ({ h = 200 }) => (
    <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--tx3)', fontSize: '13px', fontFamily: 'monospace', padding: '0 24px', lineHeight: 1.6 }}>
      Not applicable — this account trades delivery (CNC) only, with no intraday (MIS) trades, so realized trading P&L isn’t computed. See the trade calendar and time-of-day activity.
    </div>
  );

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
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Responsive + polish styles — scoped by ti- prefix so they only affect this page.
          Grids collapse on smaller screens; cards lift on hover; the tab bar scrolls on mobile. */}
      <style>{`
        .ti-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
        .ti-2col{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        .ti-3col{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
        .ti-scorecard{display:grid;grid-template-columns:repeat(3,1fr);gap:16px 20px;}
        .ti-card{transition:transform .18s ease, box-shadow .18s ease;}
        .ti-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.10);}
        .ti-panel{transition:box-shadow .18s ease;}
        .ti-panel:hover{box-shadow:0 4px 16px rgba(0,0,0,.08);}
        .ti-tabs{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
        .ti-tabs::-webkit-scrollbar{display:none;}
        @media (max-width:900px){.ti-kpi{grid-template-columns:repeat(2,1fr);}}
        @media (max-width:820px){.ti-2col{grid-template-columns:1fr;}}
        @media (max-width:700px){.ti-3col{grid-template-columns:1fr;}.ti-scorecard{grid-template-columns:1fr;gap:4px;}}
        @media (max-width:560px){.ti-kpi{grid-template-columns:1fr;}}
      `}</style>

      {/* Period bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0', paddingBottom: '14px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: 'var(--tx3)', fontFamily: 'monospace' }}>Period:</span>
        {[30, 60, 90].map(d => (
          <button key={d} onClick={() => setDays(d)} style={{
            padding: '5px 15px', borderRadius: '20px', border: '1px solid rgba(0,0,0,0.12)',
            fontSize: '12px', fontWeight: '500', cursor: 'pointer',
            background: d === days ? C.navy : 'var(--bg)',
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
              <span style={{ color: pnlNA ? 'var(--tx3)' : (data.summary?.net_pnl >= 0 ? C.green : C.red) }}>
                P&L: {pnlNA ? 'N/A' : `${data.summary?.net_pnl >= 0 ? '+' : ''}₹${Math.abs(data.summary?.net_pnl || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
              </span>
              <span style={{ color: 'var(--tx3)' }}>
                Win rate: {pnlNA ? 'N/A' : (data.summary?.win_rate || 0) + '%'}
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
          <span style={{ color: pnlNA ? 'var(--tx3)' : (data.summary?.net_pnl >= 0 ? C.green : C.red), fontWeight: '600' }}>
            Net P&L: {pnlNA ? 'N/A (delivery-only)' : `${data.summary?.net_pnl >= 0 ? '+' : ''}₹${Math.abs(data.summary?.net_pnl || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
          </span>
          <span>Win rate: {pnlNA ? 'N/A' : (data.summary?.win_rate || 0) + '%'}</span>
          <span>Turnover: ₹{Math.abs(data.summary?.premium_to || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
        </div>
      )}

      {/* Tab bar — segmented pill control */}
      <div className="ti-tabs" style={{ display: 'flex', gap: '6px', marginBottom: '24px', padding: '5px', background: 'rgba(27,63,122,0.05)', borderRadius: '12px', width: 'fit-content', maxWidth: '100%' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '9px 18px', fontSize: '13px', fontWeight: '600',
            border: 'none', cursor: 'pointer', borderRadius: '8px',
            background: tab === t.id ? C.navy : 'transparent',
            color: tab === t.id ? '#fff' : 'var(--tx2)',
            boxShadow: tab === t.id ? '0 2px 8px rgba(27,63,122,0.28)' : 'none',
            transition: 'all 0.18s', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════ TAB 1 — SUMMARY ════════════════ */}
      {tab === 'summary' && summary && (
        <>
          {/* Section header */}
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: '21px', fontWeight: '800', color: 'var(--tx)', marginBottom: '4px', letterSpacing: '-0.5px' }}>Your trading snapshot</h2>
            <p style={{ fontSize: '12.5px', color: 'var(--tx3)', fontFamily: 'monospace' }}>{data.trade_days}-day overview · {(data.segments && data.segments.length ? data.segments.join(' · ') : 'Equity & derivatives')}</p>
          </div>

          {/* KPI cards */}
          <div className="ti-kpi" style={{ marginBottom: '18px' }}>
            <Card label="Net P&L"               value={pnlNA ? 'N/A' : FMTP(summary.net_pnl)}      sub={pnlNA ? 'Delivery-only account' : `${summary.pnl_pct >= 0 ? '+' : ''}${summary.pnl_pct}% on turnover`}  borderColor={C.green}  valueColor={pnlNA ? 'var(--tx3)' : (summary.net_pnl >= 0 ? C.green : C.red)} />
            <Card label="Win rate"               value={pnlNA ? 'N/A' : summary.win_rate + '%'}     sub={pnlNA ? 'Intraday P&L only' : `${summary.wins} wins · ${summary.losses} losses`}                              borderColor={C.blue}   valueColor={pnlNA ? 'var(--tx3)' : C.blue} />
            <Card label={data.has_options ? "Premium turnover" : "Turnover"}       value={FMT(summary.premium_to)}    sub={`${(summary.lots || 0).toLocaleString('en-IN')} ${data.has_options ? 'lots' : 'qty'} · ${summary.trades} trades`}                              borderColor={C.amber}  valueColor={C.amber} />
            <Card label="Active trading days"    value={`${data.trade_days} / ${days}`}  sub={`${Math.round(data.trade_days/days*100)}% of available days`}                    borderColor={C.purple} valueColor={C.purple} />
          </div>

          {/* CNC vs MIS split — sourced from the RMS trade file's Product Type (#28) */}
          {data.cnc_mis && (data.cnc_mis.cnc + data.cnc_mis.mis + data.cnc_mis.other) > 0 && (
            <div style={{ marginBottom: '18px' }}>
              <Panel title="CNC vs MIS" info="Delivery (CNC) vs intraday (MIS) turnover, split from the trade file's product type." sub="Delivery vs intraday turnover — from RMS trade file Product Type">
                <div className="ti-3col" style={{ padding: '6px 0' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--tx3)' }}>CNC · Delivery</div>
                    <div style={{ fontSize: '19px', fontWeight: '800', color: C.blue }}>{FMT(data.cnc_mis.cnc)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--tx3)' }}>{data.cnc_mis.cnc_trades.toLocaleString('en-IN')} trades</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--tx3)' }}>MIS · Intraday</div>
                    <div style={{ fontSize: '19px', fontWeight: '800', color: C.amber }}>{FMT(data.cnc_mis.mis)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--tx3)' }}>{data.cnc_mis.mis_trades.toLocaleString('en-IN')} trades</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--tx3)' }}>Other (NRML/CO/BO)</div>
                    <div style={{ fontSize: '19px', fontWeight: '800', color: C.purple }}>{FMT(data.cnc_mis.other)}</div>
                  </div>
                </div>
              </Panel>
            </div>
          )}

          {/* Charts g2 */}
          <div className="ti-2col">
            <Panel title="Cumulative P&L trend" info="Running total of your realized intraday P&L, accumulated day by day over the period." sub="Running total by trading day">
              {pnlNA ? <NA h={224} /> : (
              <div style={{ height: '224px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={summary.pnl_trend || []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fontFamily: 'monospace' }} tickFormatter={v => `D${v}`} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'monospace' }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'K'} />
                    <Tooltip formatter={v => [FMT(v), 'Cumulative P&L']} contentStyle={TT_CONTENT} itemStyle={TT_ITEM} labelStyle={TT_LABEL} />
                    <ReferenceLine y={0} stroke="rgba(0,0,0,0.1)" />
                    <Line type="monotone" dataKey="pnl" stroke={summary.net_pnl >= 0 ? C.green : C.red} fill={summary.net_pnl >= 0 ? C.green2 : C.red2} dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              )}
            </Panel>

            <Panel title="Win / loss by expiry week" info="Net realized P&L grouped by weekly expiry cycle — which expiry weeks made or lost money." sub="Net P&L per expiry cycle">
              {pnlNA ? <NA h={224} /> : (
              <div style={{ height: '224px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.weekly_pnl || []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                    <XAxis dataKey="week" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'monospace' }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'K'} />
                    <Tooltip formatter={v => [FMT(v), 'P&L']} contentStyle={TT_CONTENT} itemStyle={TT_ITEM} labelStyle={TT_LABEL} />
                    <ReferenceLine y={0} stroke="rgba(0,0,0,0.1)" />
                    <Bar dataKey="pnl" radius={[4,4,0,0]}>
                      {(summary.weekly_pnl || []).map((e, i) => (
                        <Cell key={i} fill={e.pnl >= 0 ? 'rgba(38,201,126,0.75)' : 'rgba(240,57,78,0.75)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              )}
            </Panel>
          </div>

          <div className="ti-2col">
            <Panel title="Activity by segment" info="Share of your activity across segments (options, futures, cash) by trade count and premium." sub="Trade count & premium split">
              <div style={{ height: '164px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={summary.segment_mix || []} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" label={({ name, value }) => value > 0 ? `${value}%` : ''} labelLine={false}>
                      {(summary.segment_mix || []).map((e, i) => (
                        <Cell key={i} fill={[C.blue, C.purple, C.amber, C.green][i % 4]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={v => [v + '%']} contentStyle={TT_CONTENT} itemStyle={TT_ITEM} labelStyle={TT_LABEL} />
                    <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} iconSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Key statistics" info="Averages and extremes of your realized intraday trades for the selected period.">
              {pnlNA ? <NA h={200} /> : <>
              <SRow label="Avg profit per winning trade"    value={FMTP(summary.avg_win)}             color={C.green} />
              <SRow label="Avg loss per losing trade"       value={summary.avg_loss < 0 ? '–' + FMT(Math.abs(summary.avg_loss)) : FMT(summary.avg_loss)} color={C.red} />
              <SRow label="Profit factor (avg win ÷ loss)"  value={(summary.profit_factor || 0).toFixed(2)} color={summary.profit_factor >= 1.5 ? C.green : summary.profit_factor >= 1 ? C.amber : C.red} />
              <SRow label="Largest single-day gain"         value={FMTP(summary.best_day)}            color={C.green} />
              <SRow label="Largest single-day loss"         value={'–' + FMT(Math.abs(summary.worst_day))} color={C.red} />
              <SRow label="Avg trades per active day"       value={(summary.avg_trades_per_day || 0).toFixed(1)} />
              <SRow label="Max consecutive winning days"    value={summary.max_win_streak || 0}       color={C.green} />
              </>}
            </Panel>
          </div>

          <div className="ti-2col">
            <Panel title={`${pnlNA ? 'Trade calendar' : 'Daily P&L calendar'} — ${calendar?.month_label || new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}`} info="Each calendar day coloured by that day's realized P&L (green = profit, red = loss, grey = no trade)." sub={pnlNA ? 'Blue = traded day · Grey = no trade' : 'Green = profit day · Red = loss day'}>
              <CalHeatmap days={calendar?.days || []} tradeMode={pnlNA} />
            </Panel>

            <Panel title="Trading streak" info="Every trading day as a square — colour marks profit, loss or no trade, showing streaks." sub="Each square = one trading day">
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {(calendar?.days || []).filter(d => d.type !== 'empty').map((d, i) => (
                  <div key={i} title={pnlNA ? (d.traded ? `${d.trades} trades` : 'No trade') : d.label} style={{
                    width: '15px', height: '15px', borderRadius: '4px',
                    background: pnlNA
                      ? (d.traded ? C.blue : 'rgba(0,0,0,0.08)')
                      : (d.type === 'profit' ? C.green : d.type === 'loss' ? C.red : 'rgba(0,0,0,0.08)'),
                    cursor: 'default', flexShrink: 0
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: 'var(--tx3)', fontFamily: 'monospace' }}>
                {pnlNA ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '10px', height: '10px', background: C.blue, borderRadius: '2px', display: 'inline-block' }} /> Traded
                  </span>
                ) : <>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '10px', height: '10px', background: C.green, borderRadius: '2px', display: 'inline-block' }} /> Win
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '10px', height: '10px', background: C.red, borderRadius: '2px', display: 'inline-block' }} /> Loss
                </span>
                </>}
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
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: '21px', fontWeight: '800', color: 'var(--tx)', marginBottom: '4px', letterSpacing: '-0.5px' }}>Options trading insights</h2>
            <p style={{ fontSize: '12.5px', color: 'var(--tx3)', fontFamily: 'monospace' }}>Strike selection · Call/Put bias · Expiry behaviour · Holding duration</p>
          </div>

          {!data.has_options ? (
            <Panel title="Options trading insights" info="Call/Put, strike, expiry and holding-duration analytics — shown only when the client traded options." sub="Call/Put, strike, expiry and holding-duration analytics apply only to options trades">
              <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--tx3)', fontSize: '13px', lineHeight: 1.6 }}>
                No options activity in the selected period. This client traded {(data.segments && data.segments.length ? data.segments.join(', ') : 'equity cash')} only — options-specific insights don't apply here.
              </div>
            </Panel>
          ) : (
          <>
          <div className="ti-kpi" style={{ marginBottom: '18px' }}>
            <Card label="Options win rate"      value={options_stats.win_rate + '%'}      sub={`${options_stats.wins}W · ${options_stats.losses}L over ${data.trade_days} days`}   borderColor={C.blue}   valueColor={C.blue} />
            <Card label="Call vs Put split"     value={options_stats.call_pct >= 50 ? options_stats.call_pct + '% Calls' : (100 - options_stats.call_pct) + '% Puts'} sub={`${options_stats.call_pct >= 50 ? 'Bullish' : 'Bearish'} bias · ${options_stats.call_pct >= 50 ? (100 - options_stats.call_pct) + '% Puts' : options_stats.call_pct + '% Calls'}`} borderColor={C.amber} valueColor={C.amber} />
            <Card label="Most-traded instrument" value={options_stats.best_strike || '—'} sub="By turnover"                                                                          borderColor={C.green}  valueColor={C.green} />
            <Card label="Avg holding duration"  value={options_stats.avg_hold_hrs != null ? options_stats.avg_hold_hrs + ' hrs' : '—'} sub={options_stats.avg_hold_hrs != null ? 'Mostly intraday options' : 'Not available from feed'} borderColor={C.purple} valueColor={C.purple} />
          </div>

          {/* Strike selection table */}
          <Panel title="Strike selection — win rate & P&L by moneyness" info="Win rate and P&L grouped by option moneyness (ITM / ATM / OTM). Needs each trade's underlying spot price to classify." sub="Where your trades happened and how they actually performed">
            {(!options_stats.strike_table || options_stats.strike_table.length === 0) ? (
              <div style={{ padding: '18px 12px', color: 'var(--tx3)', fontSize: '12.5px', lineHeight: 1.6 }}>
                Not available — moneyness (ITM / ATM / OTM) needs each option's underlying spot price at the time of the trade, which isn't included in the trade feed.
              </div>
            ) : (
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
                      <td style={{ padding: '11px 13px', minWidth: '120px' }}>{r.win_rate != null ? <MiniBar pct={r.win_rate} color={r.win_rate >= 60 ? C.green : r.win_rate >= 50 ? C.amber : C.red} /> : '—'}</td>
                      <td style={{ padding: '11px 13px', fontFamily: 'monospace', fontWeight: '600', color: r.avg_pnl >= 0 ? C.green : C.red }}>{FMTP(r.avg_pnl)}</td>
                      <td style={{ padding: '11px 13px', fontFamily: 'monospace', fontWeight: '600', color: r.total_pnl >= 0 ? C.green : C.red }}>{FMTP(r.total_pnl)}</td>
                      <td style={{ padding: '11px 13px' }}><Badge text={r.verdict} type={r.verdict === 'Best' ? 'g' : r.verdict === 'Watch' ? 'r' : r.verdict === 'Good' ? 'b' : 'a'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </Panel>

          <div className="ti-2col">
            <Panel title="Call vs Put — P&L by month" info="Monthly realized P&L split between your call trades and put trades.">
              <div style={{ height: '200px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={options_stats.callput_monthly || []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'monospace' }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'K'} />
                    <Tooltip formatter={v => [FMT(v)]} contentStyle={TT_CONTENT} itemStyle={TT_ITEM} labelStyle={TT_LABEL} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="calls" name="Calls P&L" fill={C.blue} fillOpacity={0.15}  stroke={C.blue}   strokeWidth={1} radius={[3,3,0,0]} />
                    <Bar dataKey="puts"  name="Puts P&L"  fill={C.purple} fillOpacity={0.15}  stroke={C.purple} strokeWidth={1} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
                {[
                  { label: 'Call turnover share', value: (options_stats.call_pct ?? 0) + '%', color: C.blue },
                  { label: 'Put turnover share',  value: (100 - (options_stats.call_pct ?? 0)) + '%', color: C.purple },
                ].map((s, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--tx3)', fontFamily: 'monospace', marginBottom: '4px' }}>{s.label}</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Expiry day vs non-expiry performance" info="Compares your win rate, lots and trades on expiry days against normal trading days." sub="Win rate, P&L, and activity on expiry days vs normal days">
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
                    <Tooltip contentStyle={TT_CONTENT} itemStyle={TT_ITEM} labelStyle={TT_LABEL} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="expiry" name="Expiry days"     fill={C.amber} fillOpacity={0.15} stroke={C.amber} strokeWidth={1} radius={[3,3,0,0]} />
                    <Bar dataKey="normal" name="Non-expiry days" fill={C.blue} fillOpacity={0.15}  stroke={C.blue}  strokeWidth={1} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                <div style={{ padding: '6px 14px', borderRadius: '8px', background: C.amber2, border: '1px solid rgba(245,166,35,.2)', fontSize: '12px', fontWeight: '600', color: C.amber }}>
                  Expiry win rate {options_stats.expiry_wr != null ? options_stats.expiry_wr + '%' : '—'}
                </div>
                <div style={{ padding: '6px 14px', borderRadius: '8px', background: C.blue2, border: '1px solid rgba(74,143,245,.2)', fontSize: '12px', fontWeight: '600', color: C.blue }}>
                  Non-expiry win rate {options_stats.normal_wr != null ? options_stats.normal_wr + '%' : '—'}
                </div>
              </div>
            </Panel>
          </div>

          {/* Top instruments */}
          <Panel title="Top instruments — options trading" info="Your options contracts ranked by total P&L contribution over the period." sub="Ranked by P&L contribution">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {['Instrument','Trades','Quantity','Win rate','Avg P&L/trade','Total P&L','Bias'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 13px', fontFamily: 'monospace', fontWeight: '500', fontSize: '10.5px', color: 'var(--tx3)', borderBottom: '1px solid rgba(0,0,0,0.08)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(options_stats.top_instruments || []).map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '11px 13px' }}><ITag name={r.instrument} type={r.total_pnl >= 0 ? 'best' : 'worst'} /></td>
                      <td style={{ padding: '11px 13px' }}>{r.trades}</td>
                      <td style={{ padding: '11px 13px' }}>{r.lots > 0 ? r.lots.toLocaleString('en-IN') : '—'}</td>
                      <td style={{ padding: '11px 13px' }}><Badge text={r.win_rate != null ? r.win_rate + '%' : '—'} type={r.win_rate >= 60 ? 'g' : r.win_rate >= 50 ? 'a' : 'r'} /></td>
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
        </>
      )}

      {/* ════════════════ TAB 3 — PATTERNS ════════════════ */}
      {tab === 'patterns' && patterns && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: '21px', fontWeight: '800', color: 'var(--tx)', marginBottom: '4px', letterSpacing: '-0.5px' }}>Your trading patterns</h2>
            <p style={{ fontSize: '12.5px', color: 'var(--tx3)', fontFamily: 'monospace' }}>Behaviour analysis · Time of day · Day of week · Frequency vs outcome · Lot sizing</p>
          </div>

          <div className="ti-2col">
            <Panel title="Day-of-week performance" info="Win rate = share of that weekday's closed round-trips (matched buy/sell legs) that were profitable — a day with one winning and one losing trade reads 50%. Avg P&L is the average realized P&L per trading day." sub="Win rate and avg P&L by weekday">
              {pnlNA ? <NA h={224} /> : (
              <div style={{ height: '224px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={patterns.dow || []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                   <YAxis yAxisId="left"  tick={{ fontSize: 10, fontFamily: 'monospace' }} tickFormatter={v => v + '%'} domain={[0, Math.max(100, ...(patterns.dow || []).map(d => d.win_rate))]} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'K'} />
                    <Tooltip contentStyle={TT_CONTENT} itemStyle={TT_ITEM} labelStyle={TT_LABEL} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar  yAxisId="left"  dataKey="win_rate" name="Win rate %" fill={C.blue} fillOpacity={0.15} stroke={C.blue} strokeWidth={1.5} radius={[3,3,0,0]} />
                    <Line yAxisId="right" type="monotone" dataKey="avg_pnl" name="Avg P&L ₹" stroke={C.green} fill={C.green2} strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              )}
            </Panel>

            <Panel title="Time-of-day performance" info="Number of trades by market hour. Fills in as trade files carrying execution time are uploaded." sub="Trade activity by market hour">
              {(!patterns.tod || patterns.tod.length === 0) ? (
                <div style={{ height: '224px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--tx3)', fontSize: '13px', lineHeight: 1.6, padding: '0 24px' }}>
                  Execution times aren't recorded for these trades yet.<br />
                  This fills in as newer trade files (which carry the trade time) are uploaded.
                </div>
              ) : (
              <>
              <div style={{ height: '224px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={patterns.tod} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip formatter={(v, n) => [n === 'turnover' ? FMT(v) : v, n === 'turnover' ? 'Turnover' : 'Trades']} contentStyle={TT_CONTENT} itemStyle={TT_ITEM} labelStyle={TT_LABEL} />
                    <Bar dataKey="trades" name="Trades" fill={C.purple} fillOpacity={0.15} stroke={C.purple} strokeWidth={1} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                {(() => {
                  const tod = patterns.tod;
                  const busiest = tod.reduce((a, b) => b.trades > a.trades ? b : a, tod[0]);
                  return (
                    <div style={{ padding: '7px 14px', borderRadius: '8px', background: C.green2, border: `1px solid rgba(38,201,126,.2)`, fontSize: '12px', fontWeight: '600', color: C.green }}>
                      Most active: {busiest.time} ({busiest.trades} trades)
                    </div>
                  );
                })()}
              </div>
              </>
              )}
            </Panel>
          </div>

          <div className="ti-2col">
            <Panel title="Lot sizing behaviour" info="Average lots you trade the day after a winning day vs the day after a losing day — shows revenge/over-sizing." sub="Average lots — after a winning day vs a losing day">
              {pnlNA ? <NA h={224} /> : (<>
              <div style={{ height: '224px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={patterns.lot_sizing || []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={v => [v.toFixed(1) + ' lots']} contentStyle={TT_CONTENT} itemStyle={TT_ITEM} labelStyle={TT_LABEL} />
                    <Bar dataKey="lots" name="Avg lots" radius={[4,4,0,0]}>
                      {(patterns.lot_sizing || []).map((e, i) => (
                        <Cell key={i} fill={e.label?.includes('loss') ? 'rgba(240,57,78,0.75)' : e.label?.includes('win') ? 'rgba(38,201,126,0.75)' : 'rgba(74,143,245,0.75)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ marginTop: '14px' }}>
                <SRow label="Avg lots after a winning day"  value={patterns.lots_after_win  != null ? `${patterns.lots_after_win.toFixed(1)} lots`  : '—'} color={C.green} />
                <SRow label="Avg lots after a losing day"   value={patterns.lots_after_loss != null ? `${patterns.lots_after_loss.toFixed(1)} lots` : '—'} color={C.red} />
                <SRow label="Win rate after a loss day"     value={patterns.wr_after_loss   != null ? `${patterns.wr_after_loss}%` : '—'}               color={C.amber} />
                <SRow label="Win rate after a win day"      value={patterns.wr_after_win    != null ? `${patterns.wr_after_win}%`  : '—'}               color={C.green} />
              </div>
              </>)}
            </Panel>

            <Panel title="Monthly P&L breakdown" info="Gross profit, gross loss and net realized P&L for each month in the period." sub="Gross profit, gross loss and net per month">
              {pnlNA ? <NA h={224} /> : (
              <div style={{ height: '224px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={patterns.monthly_pnl || []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'K'} />
                    <Tooltip formatter={v => [FMT(v)]} contentStyle={TT_CONTENT} itemStyle={TT_ITEM} labelStyle={TT_LABEL} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <ReferenceLine y={0} stroke="rgba(0,0,0,0.1)" />
                    <Bar dataKey="gross_profit" name="Gross profit" stackId="s" fill="rgba(38,201,126,0.7)" radius={[3,3,0,0]} />
                    <Bar dataKey="gross_loss"   name="Gross loss"   stackId="s" fill="rgba(240,57,78,0.7)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              )}
            </Panel>
          </div>

          {/* Pattern signal box */}
          {patterns.escalation && (
            <div style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: '14px', padding: '20px 22px', marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: C.amber, marginBottom: '6px' }}>⚡ Pattern signal: lot size escalation after losses</div>
              <div style={{ fontSize: '12px', color: 'var(--tx3)', fontFamily: 'monospace', marginBottom: '16px' }}>Statistical observation based on {data.trade_days}-day trade history · Not investment advice</div>
              <div className="ti-3col">
                {[
                  { label: 'Avg lots after a loss',  value: patterns.lots_after_loss != null ? Number(patterns.lots_after_loss).toFixed(1) : '—', sub: 'Not available from feed', color: C.red },
                  { label: 'Win rate after a loss',   value: patterns.wr_after_loss != null ? patterns.wr_after_loss + '%' : '—',              sub: 'Needs trade sequencing', color: C.amber },
                  { label: 'Est. P&L drag',           value: '—',                                                                              sub: 'Not available from feed', color: C.red },
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
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: '21px', fontWeight: '800', color: 'var(--tx)', marginBottom: '4px', letterSpacing: '-0.5px' }}>Your best & worst</h2>
            <p style={{ fontSize: '12.5px', color: 'var(--tx3)', fontFamily: 'monospace' }}>Top performers · Biggest drags · Monthly comparison · Trading score card</p>
          </div>

          <div className="ti-2col">
            {/* Top 5 */}
            <Panel title="Top 5 instruments by P&L" info="The five instruments that contributed the most realized profit over the period." sub="Your best performers" style={{ borderTop: `3px solid ${C.green}` }}>
              {pnlNA ? <NA h={180} /> : (
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
                      <td style={{ padding: '11px 13px', fontFamily: 'monospace', fontWeight: '600', color: C.green }}>{FMTPR(r.pnl)}</td>
                      <td style={{ padding: '11px 13px' }}><Badge text={r.win_rate != null ? r.win_rate + '%' : '—'} type={r.win_rate >= 60 ? 'g' : 'a'} /></td>
                      <td style={{ padding: '11px 13px', color: 'var(--tx2)' }}>{r.trades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </Panel>

            {/* Worst 5 */}
            <Panel title="Biggest P&L drags" info="The five instruments that lost you the most over the period." sub="Instruments pulling down your performance" style={{ borderTop: `3px solid ${C.red}` }}>
              {pnlNA ? <NA h={180} /> : (
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
                      <td style={{ padding: '11px 13px', fontFamily: 'monospace', fontWeight: '600', color: C.red }}>–{FMTR(Math.abs(r.pnl))}</td>
                      <td style={{ padding: '11px 13px' }}><Badge text={r.win_rate != null ? r.win_rate + '%' : '—'} type={r.win_rate >= 50 ? 'a' : 'r'} /></td>
                      <td style={{ padding: '11px 13px', color: 'var(--tx2)' }}>{r.trades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </Panel>
          </div>

          <div className="ti-2col">
            {/* Best days */}
            <Panel title="Top 5 trading days" info="Your five best single-day realized P&L days in the period." sub="Best single-day P&L">
              {pnlNA ? <NA h={180} /> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {['Date','P&L','Trades'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 13px', fontFamily: 'monospace', fontWeight: '500', fontSize: '10.5px', color: 'var(--tx3)', borderBottom: '1px solid rgba(0,0,0,0.08)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(best_worst.best_days || []).length ? (best_worst.best_days).map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '11px 13px', fontSize: '12px', color: 'var(--tx2)', fontFamily: 'monospace' }}>{new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                      <td style={{ padding: '11px 13px', fontFamily: 'monospace', fontWeight: '700', color: C.green }}>{FMTPR(r.pnl)}</td>
                      <td style={{ padding: '11px 13px', color: 'var(--tx2)' }}>{r.trades}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={3} style={{ padding: '16px 13px', fontSize: '12px', color: 'var(--tx3)', textAlign: 'center' }}>No profitable trading days in this period</td></tr>
                  )}
                </tbody>
              </table>
              )}
            </Panel>

            {/* Worst days */}
            <Panel title="Worst 5 trading days" info="Your five largest single-day losses in the period." sub="Largest single-day drawdowns">
              {pnlNA ? <NA h={180} /> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {['Date','P&L','Trades','Note'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 13px', fontFamily: 'monospace', fontWeight: '500', fontSize: '10.5px', color: 'var(--tx3)', borderBottom: '1px solid rgba(0,0,0,0.08)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(best_worst.worst_days || []).length ? (best_worst.worst_days).map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '11px 13px', fontSize: '12px', color: 'var(--tx2)', fontFamily: 'monospace' }}>{new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                      <td style={{ padding: '11px 13px', fontFamily: 'monospace', fontWeight: '700', color: C.red }}>–{FMTR(Math.abs(r.pnl))}</td>
                      <td style={{ padding: '11px 13px', color: 'var(--tx2)' }}>{r.trades}</td>
                      <td style={{ padding: '11px 13px', fontSize: '12px', color: C.amber }}>{r.note}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} style={{ padding: '16px 13px', fontSize: '12px', color: 'var(--tx3)', textAlign: 'center' }}>No losing trading days in this period</td></tr>
                  )}
                </tbody>
              </table>
              )}
            </Panel>
          </div>

          {/* Month-on-month chart */}
          <Panel title="Month-on-month comparison" info="Net realized P&L and win-rate trend across the months in the period." sub="Net P&L and win rate trend across months">
            {pnlNA ? <NA h={200} /> : (
            <div style={{ height: '200px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={best_worst.mom || []} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.gc} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                  <YAxis yAxisId="left"  tick={{ fontSize: 10 }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'K'} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => v + '%'} domain={[40, 80]} />
                  <Tooltip contentStyle={TT_CONTENT} itemStyle={TT_ITEM} labelStyle={TT_LABEL} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar  yAxisId="left"  dataKey="net_pnl"  name="Net P&L"    fill={C.blue} fillOpacity={0.15} stroke={C.blue} strokeWidth={1} radius={[4,4,0,0]} />
                  <Line yAxisId="right" dataKey="win_rate" name="Win rate %"  type="monotone" stroke={C.green} fill={C.green2} strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            )}
          </Panel>

          {/* Trading scorecard — exact prototype: 3-col progress bars */}
          <Panel title="Your trading score card" info="Scores computed only from your own trading history — not a benchmark against other traders." sub={`Computed from your own ${data.trade_days}-day history · Not a benchmark against other traders`}>
            {pnlNA ? <NA h={140} /> : (
            <div className="ti-scorecard">
              {(best_worst.scorecard || []).map((s, i) => (
                <ScoreBar key={i} label={s.label} score={s.score} gradient={SCORE_GRADIENTS[i]} />
              ))}
            </div>
            )}
          </Panel>

          {ai_insights?.summary && <AiBox text={ai_insights.summary} label={`AI ${data.trade_days}-day summary · ${clientName || ucc}`} />}
        </>
      )}
    </div>
  );
};

export default TradeInsights;