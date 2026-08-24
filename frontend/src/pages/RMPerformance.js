import React, { useEffect, useState } from 'react';
import api from '../api';
import { InfoBtn, DateRange, rangeParams } from '../components/ui';

const rupee = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + 'L';
  return '₹' + Math.round(v).toLocaleString('en-IN');
};
const pctFmt = (v) => (v == null ? '—' : Math.round(v) + '%');
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));

const RMPerformance = () => {
  // ── Table 1: per-RM revenue breakdown (own date range, defaults to the last trading day) ──
  const [range1, setRange1] = useState({ key: 'lastday' });
  const [t1, setT1] = useState(null);
  const [t1Loading, setT1Loading] = useState(true);
  const [t1Err, setT1Err] = useState('');

  // ── Table 2: RM monthly performance (RM dropdown, defaults to All RMs) ──
  const [rms, setRms] = useState([]);
  const [rmId, setRmId] = useState('all');
  const [t2, setT2] = useState(null);
  const [t2Loading, setT2Loading] = useState(true);
  const [t2Err, setT2Err] = useState('');

  // ── Table 3: detailed comparison (own date range) ──
  const [range3, setRange3] = useState({ key: 'month' });
  const [t3, setT3] = useState(null);
  const [t3Loading, setT3Loading] = useState(true);
  const [t3Err, setT3Err] = useState('');

  useEffect(() => {
    if (range1.key === 'custom' && !(range1.from && range1.to)) return;
    setT1Loading(true); setT1Err('');
    api.get('/analytics/rm-revenue-breakdown', { params: rangeParams(range1) })
      .then(res => {
        setT1(res.data);
        // Reflect the resolved single day in the date pickers (once), so the filter shows it.
        const rg = res.data?.meta?.range;
        if (rg && rg.from_iso && rg.to_iso) {
          setRange1(prev => prev.key === 'lastday' ? { key: 'custom', from: rg.from_iso, to: rg.to_iso } : prev);
        }
      })
      .catch(() => setT1Err('Could not load revenue breakdown.'))
      .finally(() => setT1Loading(false));
  }, [range1]);

  useEffect(() => {
    setT2Loading(true); setT2Err('');
    api.get('/analytics/rm-monthly', { params: { rm_id: rmId } })
      .then(res => {
        setT2(res.data);
        if (res.data.rms) setRms(res.data.rms);
      })
      .catch(() => setT2Err('Could not load RM monthly performance.'))
      .finally(() => setT2Loading(false));
  }, [rmId]);

  useEffect(() => {
    if (range3.key === 'custom' && !(range3.from && range3.to)) return;
    setT3Loading(true); setT3Err('');
    api.get('/analytics/rm-performance', { params: rangeParams(range3) })
      .then(res => setT3(res.data))
      .catch(() => setT3Err('Could not load detailed comparison.'))
      .finally(() => setT3Loading(false));
  }, [range3]);

  const t1Rows = t1?.rows || [];
  const tot = t1?.totals;
  const t2Rows = t2?.rows || [];
  const t3Rows = t3?.rows || [];

  return (
    <div>
      <div className="ph">
        <h2>RM performance</h2>
        <p>Per-RM revenue by source, month-by-month trends, and cross-RM comparison</p>
      </div>

      {/* ══ Table 1 — RM revenue breakdown ══ */}
      <div className="panel">
        <div className="ptitle">💰 RM revenue breakdown
          <InfoBtn text="Revenue each RM earned from their mapped clients over the selected range, split by source. Total Revenue = Brokerage + MTF interest + Float income + Clearing commission. Mapped = clients assigned to the RM; Traded = distinct clients who traded in the range. This table has its own date filter." />
        </div>
        <DateRange value={range1} onChange={setRange1}
          bounds={t1?.meta?.range ? { min: t1.meta.range.data_min, max: t1.meta.range.data_max } : undefined}
          active={t1?.meta?.range} />
        {t1Loading && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>Updating…</div>}
        {t1Err ? <p style={{ color: 'var(--dc)' }}>{t1Err}</p> : (
          <div className="tw"><table>
            <thead><tr>
              <th>RM</th><th>Brokerage</th><th>MTF</th><th>Float</th><th>Clearing</th>
              <th>Total Revenue</th><th>Mapped Clients</th><th>Traded Clients</th>
            </tr></thead>
            <tbody>
              {t1Rows.map(r => (
                <tr key={r.rm_id}>
                  <td style={{ fontWeight: 500 }}>{r.rm_name}</td>
                  <td>{r.brokerage > 0 ? rupee(r.brokerage) : '—'}</td>
                  <td>{r.mtf > 0 ? rupee(r.mtf) : '—'}</td>
                  <td>{r.float > 0 ? rupee(r.float) : '—'}</td>
                  <td>{r.clearing > 0 ? rupee(r.clearing) : '—'}</td>
                  <td style={{ fontWeight: 600 }}>{r.total > 0 ? rupee(r.total) : '—'}</td>
                  <td>{num(r.mapped_clients)}</td>
                  <td>{num(r.traded_clients)}</td>
                </tr>
              ))}
              {t1Rows.length === 0 && !t1Loading && <tr><td colSpan={8} style={{ color: 'var(--tx3)' }}>No RMs.</td></tr>}
            </tbody>
            {tot && t1Rows.length > 0 && (
              <tfoot><tr style={{ fontWeight: 700, borderTop: '2px solid var(--br)' }}>
                <td>Total</td>
                <td>{rupee(tot.brokerage)}</td>
                <td>{rupee(tot.mtf)}</td>
                <td>{rupee(tot.float)}</td>
                <td>{rupee(tot.clearing)}</td>
                <td>{rupee(tot.total)}</td>
                <td>{num(tot.mapped_clients)}</td>
                <td>{num(tot.traded_clients)}</td>
              </tr></tfoot>
            )}
          </table></div>
        )}
      </div>

      {/* ══ Table 2 — single-RM monthly performance ══ */}
      <div className="panel">
        <div className="ptitle">📅 RM monthly performance
          <InfoBtn text="One RM's month-by-month performance. Revenue = Brokerage + MTF + Float + Clearing. % Achieved = Revenue ÷ that month's target. Mapped = clients mapped as of month-end; % Traded = Traded ÷ Mapped. Unmapped = leads assigned to this RM still not converted. Summary rows: MTD (current month), For day (latest trading day), FY the year (fiscal-year-to-date)." />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--tx3)' }}>RM</label>
          <select value={rmId} onChange={e => setRmId(e.target.value === 'all' ? 'all' : Number(e.target.value))} style={{ minWidth: 180 }}>
            <option value="all">All RMs</option>
            {rms.map(r => <option key={r.rm_id} value={r.rm_id}>{r.rm_name}</option>)}
          </select>
          {t2Loading && <span style={{ fontSize: 11, color: 'var(--tx3)' }}>Updating…</span>}
        </div>
        {t2Err ? <p style={{ color: 'var(--dc)' }}>{t2Err}</p> : (
          <div className="tw"><table>
            <thead><tr>
              <th>Month</th><th>Revenue</th><th>Target</th><th>% Achieved</th><th>Mapped</th>
              <th>Traded Clients</th><th>% Traded</th><th>Leads Conv%</th><th>Interactions</th><th>Unmapped Clients</th>
            </tr></thead>
            <tbody>
              {t2Rows.map((r, i) => {
                const summary = r.kind !== 'month';
                return (
                  <tr key={r.label + i} style={summary ? { background: 'var(--bg2)', fontWeight: 600 } : undefined}>
                    <td style={{ fontWeight: summary ? 700 : 500 }}>{r.label}</td>
                    <td>{r.revenue > 0 ? rupee(r.revenue) : '—'}</td>
                    <td>{r.target > 0 ? rupee(r.target) : '—'}</td>
                    <td>{r.pct_achieved != null
                      ? <span style={{ color: r.pct_achieved >= 100 ? 'var(--sc)' : r.pct_achieved >= 60 ? 'var(--wc)' : 'var(--dc)' }}>{pctFmt(r.pct_achieved)}</span>
                      : '—'}</td>
                    <td>{num(r.mapped)}</td>
                    <td>{num(r.traded)}</td>
                    <td>{pctFmt(r.pct_traded)}</td>
                    <td>{pctFmt(r.conv_pct)}</td>
                    <td>{num(r.interactions)}</td>
                    <td>{num(r.unmapped)}</td>
                  </tr>
                );
              })}
              {t2Rows.length === 0 && !t2Loading && <tr><td colSpan={10} style={{ color: 'var(--tx3)' }}>No data for this RM.</td></tr>}
            </tbody>
          </table></div>
        )}
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>MTF is a monthly book, so it is omitted from the single-day “For day” revenue. Leads Conv% and Unmapped are RM totals (all-time), repeated on each row for context.</p>
      </div>

      {/* ══ Table 3 — detailed comparison ══ */}
      <div className="panel">
        <div className="ptitle">📋 Detailed comparison
          <InfoBtn text="Per-RM breakdown over its own date range. Rev (range) = Brokerage + MTF + Float + Clearing over the selected range; YTD Rev = the same, fiscal-year-to-date. Conv% = converted ÷ leads. Target% = Rev (range) ÷ the RM's target for the range. Churn alerts = mapped clients with an AI churn-risk score ≥ 6 (out of 10)." />
        </div>
        <DateRange value={range3} onChange={setRange3}
          bounds={t3?.meta?.range ? { min: t3.meta.range.data_min, max: t3.meta.range.data_max } : undefined}
          active={t3?.meta?.range} />
        {t3Loading && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>Updating…</div>}
        {t3Err ? <p style={{ color: 'var(--dc)' }}>{t3Err}</p> : (
          <div className="tw"><table>
            <thead><tr>
              <th>RM</th><th>Clients</th><th>Rev (range)</th><th>Target%</th><th>YTD Rev</th>
              <th>Leads</th><th>Converted</th><th>Conv%</th><th>Interactions</th><th>Churn alerts</th>
            </tr></thead>
            <tbody>
              {t3Rows.map(r => (
                <tr key={r.rm_name}>
                  <td>{r.rm_name}</td>
                  <td>{r.clients}</td>
                  <td>{r.mtd_rev > 0 ? rupee(r.mtd_rev) : '—'}</td>
                  <td>{r.target_pct != null
                    ? <span style={{ color: r.target_pct >= 100 ? 'var(--sc)' : r.target_pct >= 60 ? 'var(--wc)' : 'var(--dc)', fontWeight: 500 }}>{Math.round(r.target_pct)}%</span>
                    : '—'}</td>
                  <td>{r.ytd_rev > 0 ? rupee(r.ytd_rev) : '—'}</td>
                  <td>{r.leads}</td>
                  <td>{r.converted}</td>
                  <td>{Math.round(r.conv_pct)}%</td>
                  <td>{r.interactions}</td>
                  <td>{r.churn_alerts}</td>
                </tr>
              ))}
              {t3Rows.length === 0 && !t3Loading && <tr><td colSpan={10} style={{ color: 'var(--tx3)' }}>No RMs.</td></tr>}
            </tbody>
          </table></div>
        )}
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Target% = Rev (range) ÷ each RM's monthly target(s) for the range — set them in Admin → RM &amp; Pipeline → “RM monthly revenue targets”. Revenue = Brokerage + MTF + Float + Clearing (same as the tables above).</p>
      </div>
    </div>
  );
};

export default RMPerformance;