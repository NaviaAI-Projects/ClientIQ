import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList,
} from 'recharts';
import api from '../api';
import { InfoBtn, DateRange, rangeParams } from '../components/ui';

// canonical segment order + short labels + colours (shared by table + charts)
const SEGS = [
  { key: 'eqopt',   label: 'Equity Options (premium)', short: 'Eq Opt',   color: '#185fa5' },
  { key: 'eqfut',   label: 'Equity Futures',           short: 'Eq Fut',   color: '#26c97e' },
  { key: 'commopt', label: 'Commodity Options (premium)', short: 'Comm Opt', color: '#e0a63a' },
  { key: 'commfut', label: 'Commodity Futures',        short: 'Comm Fut', color: '#c8313b' },
  { key: 'eqcash',  label: 'Equity Cash',              short: 'Eq Cash',  color: '#7b61ff' },
];

const cr = v => (v == null ? '—' : '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + 'Cr');
const num = (v, d = 2) => (v == null ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: d }));
const pct = v => (v == null ? '—' : Number(v).toFixed(2) + '%');
const crShort = v => (!v ? '' : v >= 1000 ? '₹' + (v / 1000).toFixed(1) + 'k' : '₹' + Math.round(v));

// ▲ +x%  /  ▼ −x%  /  —
const Trend = ({ dir, delta }) => {
  if (delta == null) return <span style={{ color: 'var(--tx3)', fontSize: 11 }}>{dir === 'up' ? 'new' : '—'}</span>;
  const flat = dir === 'flat', up = dir === 'up';
  const color = flat ? 'var(--tx3)' : up ? '#1f9d57' : '#c8313b';
  const arrow = flat ? '—' : up ? '▲' : '▼';
  return <span style={{ color, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>{arrow} {delta > 0 ? '+' : ''}{Number(delta).toFixed(1)}%</span>;
};

const segOf = (mo, key) => (mo.segments || []).find(s => s.key === key) || {};
const perDay = (val, days) => (days > 0 && val != null ? val / days : null);

const DetailTable = ({ segments }) => (
  <div className="tw"><table>
    <thead><tr>
      <th>Segment</th><th>Our volume</th><th>vs prev month</th>
      <th>Exchange volume</th><th>Navia share</th><th>Trading days</th>
    </tr></thead>
    <tbody>
      {segments.map(s => (
        <tr key={s.key}>
          <td>{s.label}</td>
          <td>{cr(s.navia_cr)}</td>
          <td><Trend dir={s.navia_dir} delta={s.navia_delta_pct} /></td>
          <td>{s.exchange_cr > 0 ? cr(s.exchange_cr) : '—'}</td>
          <td style={{ fontWeight: 700, color: s.share != null ? 'var(--tx1)' : 'var(--tx3)' }}>{pct(s.share)}</td>
          <td>{s.trading_days || '—'}</td>
        </tr>
      ))}
    </tbody>
  </table></div>
);

const MarketShare = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState({ key: 'all' });

  useEffect(() => {
    if (range.key === 'custom' && !(range.from && range.to)) return;
    setLoading(true);
    api.get('/analytics/market-share', { params: rangeParams(range) })
      .then(r => setData(r.data))
      .catch(() => setError('Could not load market share.'))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading && !data) return <div className="ph"><h2>Market share analysis</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Market share analysis</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, cards, months = [], daily = [] } = data;
  const feed = meta && meta.feed_available;

  // Honest per-month label: show the actual dates selected within that month,
  // e.g. "31 Jul 2026" or "27–31 Jul 2026" instead of the whole-month name.
  const MON_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const rFrom = meta && meta.range ? meta.range.from_iso : null;
  const rTo   = meta && meta.range ? meta.range.to_iso : null;
  const spanLabel = (mkey, fallback) => {
    if (!rFrom || !rTo || !mkey) return fallback;
    const [y, m] = mkey.split('-').map(Number);
    const first = `${mkey}-01`;
    const lastNum = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const last = `${mkey}-${String(lastNum).padStart(2, '0')}`;
    const s = rFrom > first ? rFrom : first;
    const e = rTo < last ? rTo : last;
    const d1 = parseInt(s.slice(8, 10), 10), d2 = parseInt(e.slice(8, 10), 10);
    const lbl = `${MON_ABBR[m - 1]} ${y}`;
    return d1 === d2 ? `${d1} ${lbl}` : `${d1}–${d2} ${lbl}`;
  };

  // Prototype "monthly market share table" — one row per selected span, ₹Cr/day per segment + share
  const monthlyRows = months.map(mo => {
    const row = { month: spanLabel(mo.month, mo.label) };
    SEGS.forEach(s => {
      const seg = segOf(mo, s.key);
      const days = seg.trading_days || 0;
      row[s.key] = {
        naviaDay: perDay(seg.navia_matched_cr, days),
        exchDay:  perDay(seg.exchange_cr, days),
        share:    seg.share,
      };
    });
    return row;
  });

  // Prototype "market share trend by segment (%)" — share% per segment across months
  const shareTrend = months.map(mo => {
    const row = { month: spanLabel(mo.month, mo.label) };
    SEGS.forEach(s => { row[s.key] = segOf(mo, s.key).share; });
    return row;
  });

  return (
    <div>
      <div className="ph">
        <h2>Market share analysis</h2>
        <p>Navia's share of exchange volumes, segment-wise{meta && meta.as_of ? ` · Exchange data as of ${meta.as_of}` : ''}</p>
      </div>

      <DateRange value={range} onChange={setRange} bounds={meta && meta.range ? { min: meta.range.data_min, max: meta.range.data_max } : undefined} active={meta && meta.range} />
      {loading && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>Updating…</div>}

      <div className="cards">
        <div className="card ci"><div className="clbl">Overall market share</div><div className="cval">{pct(cards.overall_share)}</div><div className="csub">Navia ÷ exchange (covered segments)</div></div>
        <div className="card cs"><div className="clbl">Top segment share</div><div className="cval">{pct(cards.top_segment_share)}</div><div className="csub">{cards.top_segment || 'needs exchange data'}</div></div>
        <div className="card cw"><div className="clbl">Exchange turnover</div><div className="cval">{cr(cards.exchange_total_cr)}</div><div className="csub">covered dates · in range</div></div>
        <div className="card cd">
          <div className="clbl">Our turnover</div>
          <div className="cval">{cr(cards.navia_total_cr)}</div>
          <div className="csub"><Trend dir={cards.navia_dir} delta={cards.navia_delta_pct} /> vs previous period</div>
        </div>
      </div>

      {!feed && (
        <div className="alert a-i">
          ⚠️ No exchange turnover entered for this range yet. Add segment-wise figures to the <b>exchange_volume</b> table (options as <b>premium</b> turnover) — manual insert or exchange feed.
        </div>
      )}

      {/* Day-wise Navia vs Exchange (our chart / prototype "volume vs benchmark") */}
      <div className="panel">
        <div className="ptitle">📊 Daily turnover — Navia vs Exchange (₹Cr)<InfoBtn text="Total turnover across all segments, day by day. Navia and exchange share one axis, so our volume appears small against the exchange-wide total — the true scale of our share. Hover a bar for exact values." /></div>
        {daily.length ? (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={daily} margin={{ top: 20, right: 12, bottom: 8, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} angle={-40} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v) + 'Cr'} />
              <Tooltip formatter={(v, n) => ['₹' + Number(v).toLocaleString('en-IN') + 'Cr', n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
              <Bar dataKey="exchange_cr" fill="#cbd5e1" radius={[3, 3, 0, 0]} name="Exchange turnover">
                <LabelList dataKey="exchange_cr" position="top" fontSize={8} fill="#64748b" formatter={crShort} />
              </Bar>
              <Bar dataKey="navia_cr" fill="#185fa5" radius={[3, 3, 0, 0]} name="Navia turnover">
                <LabelList dataKey="navia_cr" position="top" fontSize={8} fill="#185fa5" formatter={crShort} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 13 }}>No turnover in this range.</div>
        )}
      </div>

      {/* Prototype panel: Monthly market share table (₹Cr/day per segment + share) */}
      <div className="panel">
        <div className="ptitle">📋 Monthly market share table (₹Cr/day)<InfoBtn text="Per-month, per-segment daily averages — Navia turnover/day and exchange turnover/day on the exchange-covered trading days, plus Navia's share. Options (Eq & Comm) are premium turnover." /></div>
        <div className="tw"><table>
          <thead>
            <tr>
              <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Month</th>
              {SEGS.map(s => <th key={s.key} colSpan={3} style={{ textAlign: 'center', borderLeft: '1px solid var(--br2,#e2e8f0)' }}>{s.short}</th>)}
            </tr>
            <tr>
              {SEGS.map(s => (
                <React.Fragment key={s.key}>
                  <th style={{ borderLeft: '1px solid var(--br2,#e2e8f0)', fontSize: 10 }}>Navia/d</th>
                  <th style={{ fontSize: 10 }}>Exch/d</th>
                  <th style={{ fontSize: 10 }}>Share</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthlyRows.map(row => (
              <tr key={row.month}>
                <td style={{ fontWeight: 600 }}>{row.month}</td>
                {SEGS.map(s => {
                  const c = row[s.key];
                  return (
                    <React.Fragment key={s.key}>
                      <td style={{ borderLeft: '1px solid var(--br2,#eef2f7)' }}>{c.naviaDay == null ? '—' : num(c.naviaDay)}</td>
                      <td>{c.exchDay == null ? '—' : num(c.exchDay, 0)}</td>
                      <td style={{ fontWeight: 700, color: c.share != null ? 'var(--tx1)' : 'var(--tx3)' }}>{pct(c.share)}</td>
                    </React.Fragment>
                  );
                })}
              </tr>
            ))}
            {monthlyRows.length === 0 && <tr><td colSpan={1 + SEGS.length * 3} style={{ color: 'var(--tx3)' }}>No data in this range.</td></tr>}
          </tbody>
        </table></div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Navia/d and Exch/d are ₹Cr per trading day (segment total ÷ exchange-covered days). Share = Navia/d ÷ Exch/d.</p>
      </div>

      {/* Prototype panel: Market share trend by segment (%) */}
      <div className="panel">
        <div className="ptitle">📈 Market share trend by segment (%)<InfoBtn text="Navia's percentage share of exchange turnover per segment, month over month. Fills in as more months of exchange data are loaded." /></div>
        {shareTrend.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={shareTrend} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v + '%'} />
              <Tooltip formatter={(v, n) => [v == null ? '—' : v + '%', n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
              {SEGS.map(s => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.short} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 13 }}>No exchange data yet.</div>
        )}
        {months.length <= 1 && <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Only one month of exchange data so far — the trend line grows as more months are loaded.</p>}
      </div>

      {/* Our detailed month-wise segment drill-down */}
      {months.map(mo => (
        <div className="panel" key={mo.month}>
          <div className="ptitle">📋 Segment-wise detail — {spanLabel(mo.month, mo.label)}<InfoBtn text="Full per-segment detail for the selected dates in this month: our total turnover, trend vs the previous month, exchange turnover, share and trading days. Options (Eq & Comm) are premium turnover." /></div>
          <DetailTable segments={mo.segments} />
        </div>
      ))}
      {months.length === 0 && (
        <div className="panel"><div className="ptitle">📋 Segment-wise detail</div>
          <div style={{ color: 'var(--tx3)', fontSize: 13, padding: '8px 0' }}>No trade data in this range.</div>
        </div>
      )}
    </div>
  );
};

export default MarketShare;