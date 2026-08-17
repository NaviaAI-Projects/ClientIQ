import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Info (ⓘ) button ─────────────────────────────────────────────
// Click to reveal a small popover explaining a metric's formula / purpose.
// Used in panel titles and KPI cards. Points #11 / #25.
export const InfoBtn = ({ text }) => {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: 6 }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Info"
        title="What is this?"
        style={{
          cursor: 'pointer', border: '1px solid var(--br2, #cbd5e1)',
          background: 'var(--card, #fff)', color: 'var(--tx2, #475569)',
          borderRadius: '50%', width: 16, height: 16, lineHeight: '13px',
          fontSize: 11, fontWeight: 700, padding: 0, verticalAlign: 'middle',
          fontStyle: 'italic', fontFamily: 'Georgia, serif',
        }}
      >i</button>
      {open && (
        <span
          style={{
            position: 'absolute', top: 22, left: 0, zIndex: 60, width: 270,
            background: '#fff', border: '1px solid var(--br2, #cbd5e1)', borderRadius: 8,
            boxShadow: '0 6px 22px rgba(0,0,0,0.14)', padding: '10px 12px',
            fontSize: 11.5, lineHeight: 1.55, color: 'var(--tx2, #334155)',
            fontWeight: 400, whiteSpace: 'normal', textAlign: 'left',
          }}
        >{text}</span>
      )}
    </span>
  );
};

// ── Notes (methodology / caveats) button ────────────────────────
// Distinct from InfoBtn: Info gives the short formula/definition; Notes
// gives the longer "how to read this / assumptions / data caveats" write-up.
// Point #25.
export const NotesBtn = ({ text, title = 'Methodology & notes' }) => {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: 6 }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Notes"
        title={title}
        style={{
          cursor: 'pointer', border: '1px solid var(--br2, #cbd5e1)',
          background: 'var(--card, #fff)', color: 'var(--tx2, #475569)',
          borderRadius: 4, height: 16, lineHeight: '14px', padding: '0 5px',
          fontSize: 10, fontWeight: 700, verticalAlign: 'middle',
        }}
      >📝 Notes</button>
      {open && (
        <span
          style={{
            position: 'absolute', top: 22, left: 0, zIndex: 60, width: 300,
            background: '#fff', border: '1px solid var(--br2, #cbd5e1)', borderRadius: 8,
            boxShadow: '0 6px 22px rgba(0,0,0,0.14)', padding: '10px 12px',
            fontSize: 11.5, lineHeight: 1.55, color: 'var(--tx2, #334155)',
            fontWeight: 400, whiteSpace: 'pre-line', textAlign: 'left',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--tx1, #1e293b)' }}>{title}</div>
          {text}
        </span>
      )}
    </span>
  );
};

// ── Date range filter ───────────────────────────────────────────
// Presets (relative to the data's latest date) + custom from/to.
// Emits a value object: { key: 'month'|'30d'|'3m'|'all'|'custom', from, to }.
// Point #13 / #35. Helper `rangeParams(value)` turns it into query params.
export const rangeParams = (v) => {
  if (!v) return { range: 'month' };
  if (v.key === 'custom') return (v.from && v.to) ? { from: v.from, to: v.to } : { range: 'month' };
  return { range: v.key };
};

// ── Client link ─────────────────────────────────────────────────
// Renders a client's name as a link that opens their Client 360 page
// (which reads the UCC from navigation state). Point #38.
export const ClientLink = ({ ucc, name }) => {
  const navigate = useNavigate();
  const label = name || ucc || '—';
  if (!ucc) return <>{label}</>;
  const go = () => navigate('/client-360', { state: { ucc } });
  return (
    <span
      role="button" tabIndex={0} onClick={go}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}
      title="Open Client 360"
      style={{ color: 'var(--pc, #185fa5)', cursor: 'pointer', fontWeight: 500, textDecoration: 'underline', textDecorationStyle: 'dotted' }}
    >{label}</span>
  );
};

export const DateRange = ({ value, onChange, bounds, active }) => {
  const v = value || { key: 'month' };
  // Local pending dates — the query only fires when the user clicks Apply (no live re-query
  // on every keystroke). Kept in sync when the parent value changes (e.g. a Quick preset).
  const [from, setFrom] = useState(v.from || '');
  const [to, setTo] = useState(v.to || '');
  useEffect(() => { setFrom(v.from || ''); setTo(v.to || ''); }, [v.from, v.to, v.key]);

  const presets = [['month', 'This month'], ['30d', 'Last 30 days'], ['3m', 'Last 3 months'], ['fy', 'This FY'], ['all', 'All']];
  const bMin = bounds && bounds.min, bMax = bounds && bounds.max;
  const inp = { border: '1px solid var(--br2, #cbd5e1)', borderRadius: 6, fontSize: 12, padding: '6px 8px', color: 'var(--tx2, #334155)' };
  const chip = (isActive) => ({
    cursor: 'pointer', border: '1px solid var(--br2, #cbd5e1)',
    background: isActive ? 'var(--pc, #185fa5)' : 'transparent',
    color: isActive ? '#fff' : 'var(--tx3, #64748b)',
    borderRadius: 999, fontSize: 11, fontWeight: 600, padding: '3px 10px',
  });
  const lbl = { fontSize: 11, color: 'var(--tx3)', marginBottom: 4 };
  const apply = () => { if (from && to && from <= to) onChange({ key: 'custom', from, to }); };
  const clear = () => { setFrom(''); setTo(''); onChange({ key: 'month' }); };

  return (
    <div className="panel" style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12, padding: '12px 14px' }}>
      <div>
        <div style={lbl}>From</div>
        <input type="date" style={inp} value={from} min={bMin || undefined} max={to || bMax || undefined}
          onChange={e => setFrom(e.target.value)} />
      </div>
      <div>
        <div style={lbl}>To</div>
        <input type="date" style={inp} value={to} min={from || bMin || undefined} max={bMax || undefined}
          onChange={e => setTo(e.target.value)} />
      </div>
      <button className="btn bp" disabled={!from || !to || from > to} onClick={apply}>Apply</button>
      {(v.key === 'custom' || from || to) && <button className="btn" onClick={clear}>Clear</button>}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>Quick:</span>
        {presets.map(([k, label]) => (
          <button key={k} type="button" style={chip(v.key === k)} onClick={() => onChange({ key: k })}>{label}</button>
        ))}
      </div>
      {active && active.from && (
        <span style={{ fontSize: 11, color: 'var(--tx2, #475569)', fontWeight: 600, marginLeft: 'auto' }}>
          Showing {active.from} – {active.to}{active.trading_days != null ? ` · ${active.trading_days} trading days` : ''}
        </span>
      )}
    </div>
  );
};

// ── Chart / Table view toggle ───────────────────────────────────
// Wraps a chart and an equivalent data table; a small toggle switches
// between them. Points #21 / #42.
//   <ViewToggle chart={<...Recharts.../>} table={<table>...</table>} />
export const ViewToggle = ({ chart, table, initial = 'chart', tableControls = null }) => {
  const [view, setView] = useState(initial);
  const btn = (active) => ({
    cursor: 'pointer', border: '1px solid var(--br2, #cbd5e1)',
    background: active ? 'var(--pc, #185fa5)' : 'var(--card, #fff)',
    color: active ? '#fff' : 'var(--tx2, #475569)',
    borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '3px 10px',
  });
  const showControls = view === 'table' && tableControls;
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, justifyContent: showControls ? 'space-between' : 'flex-end', alignItems: 'center', marginBottom: 8 }}>
        {showControls ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{tableControls}</div> : null}
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={btn(view === 'chart')} onClick={() => setView('chart')}>📊 Chart</button>
          <button type="button" style={btn(view === 'table')} onClick={() => setView('table')}>▦ Table</button>
        </div>
      </div>
      {view === 'chart' ? chart : <div className="tw">{table}</div>}
    </div>
  );
};