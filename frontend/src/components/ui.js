import React, { useState } from 'react';
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
  const presets = [['month', 'This month'], ['30d', 'Last 30 days'], ['3m', 'Last 3 months'], ['fy', 'This FY'], ['all', 'All']];
  const btn = (isActive) => ({
    cursor: 'pointer', border: '1px solid var(--br2, #cbd5e1)',
    background: isActive ? 'var(--pc, #185fa5)' : 'var(--card, #fff)',
    color: isActive ? '#fff' : 'var(--tx2, #475569)',
    borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '4px 10px',
  });
  const inp = { border: '1px solid var(--br2, #cbd5e1)', borderRadius: 6, fontSize: 11, padding: '3px 6px', color: 'var(--tx2, #334155)' };
  const bMin = bounds && bounds.min, bMax = bounds && bounds.max;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      <span style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 600 }}>📅 Range:</span>
      {presets.map(([k, label]) => (
        <button key={k} type="button" style={btn(v.key === k)} onClick={() => onChange({ key: k })}>{label}</button>
      ))}
      <span style={{ fontSize: 11, color: 'var(--tx3)' }}>or custom</span>
      <input type="date" style={inp} value={v.from || ''} min={bMin || undefined} max={v.to || bMax || undefined}
        onChange={e => onChange({ key: 'custom', from: e.target.value, to: v.to || '' })} />
      <span style={{ fontSize: 11, color: 'var(--tx3)' }}>→</span>
      <input type="date" style={inp} value={v.to || ''} min={v.from || bMin || undefined} max={bMax || undefined}
        onChange={e => onChange({ key: 'custom', from: v.from || '', to: e.target.value })} />
      {active && active.from && (
        <span style={{ fontSize: 11, color: 'var(--tx2, #475569)', fontWeight: 600, marginLeft: 4 }}>
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
export const ViewToggle = ({ chart, table, initial = 'chart' }) => {
  const [view, setView] = useState(initial);
  const btn = (active) => ({
    cursor: 'pointer', border: '1px solid var(--br2, #cbd5e1)',
    background: active ? 'var(--pc, #185fa5)' : 'var(--card, #fff)',
    color: active ? '#fff' : 'var(--tx2, #475569)',
    borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '3px 10px',
  });
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: 8 }}>
        <button type="button" style={btn(view === 'chart')} onClick={() => setView('chart')}>📊 Chart</button>
        <button type="button" style={btn(view === 'table')} onClick={() => setView('table')}>▦ Table</button>
      </div>
      {view === 'chart' ? chart : <div className="tw">{table}</div>}
    </div>
  );
};