import React, { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../api';
import { InfoBtn, ViewToggle } from '../components/ui';

const inr = (n) => (n == null ? '—' : '₹' + Math.round(Number(n)).toLocaleString('en-IN'));
const vsColor = (n) => (n == null ? 'var(--tx2)' : n >= 0 ? 'var(--sc)' : 'var(--dc)');
const vsFmt = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + n + '%');
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));
const MIX_COLORS = ['#185fa5', '#9FE1CB', '#AFA9EC', '#FAC775', '#e0803a'];

const DailyMIS = () => {
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/analytics/daily-mis').then(r => setData(r.data)).catch(() => setError('Could not load daily MIS.')).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="ph"><h2>Corporate daily MIS</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Corporate daily MIS</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, income, volume, activity, mtf, revenue_mix, trend } = data;

  return (
    <div>
      <div className="ph">
        <h2>Corporate daily MIS</h2>
        <p>As of {meta.today} · All income lines · Today vs MTD avg vs Prior 3-month avg · Expiry days highlighted in red</p>
      </div>

      {meta.is_expiry
        ? <div className="alert a-w"><strong>Today is a weekly expiry day</strong> — volume and client count typically 25–30% above normal. Figures shown in trend context.</div>
        : null}
      {!meta.brokerage_loaded && <div className="alert a-i" style={{ marginTop: 8 }}>ℹ️ Options-clearing and brokerage revenue lines are not yet imported (show "—"/₹0). Volume and client activity are live.</div>}

      <div className="panel">
        <div className="ptitle">💵 Daily income summary — all revenue lines<InfoBtn text="Every revenue line for today vs yesterday and day-before, MTD average and prior 3-month average, plus each line's share of total. Float income = client ledger balance × FD rate ÷ 365." /></div>
        <div className="tw"><table>
          <thead><tr><th style={{ width: 180 }}>Revenue line</th><th>Today</th><th>Yesterday</th><th>Day before</th><th>MTD avg</th><th>Prior 3M avg</th><th>vs Prior 3M avg</th><th>Revenue share</th></tr></thead>
          <tbody>
            {income.map(r => (
              <tr key={r.line} style={{ fontWeight: r.total ? 600 : 'normal', borderTop: r.total ? '.5px solid var(--br)' : undefined }}>
                <td><strong>{r.line}</strong>{r.note ? <span style={{ fontSize: 10, color: 'var(--tx3)' }}> ({r.note})</span> : ''}</td>
                <td>{inr(r.today)}</td><td>{inr(r.yesterday)}</td><td>{inr(r.day_before)}</td>
                <td>{inr(r.mtd_avg)}</td><td>{inr(r.prior3m_avg)}</td>
                <td style={{ color: vsColor(r.vs) }}>{vsFmt(r.vs)}</td>
                <td>{r.total ? '100%' : (r.share == null ? '—' : r.share + '%')}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 8 }}>Float income estimated: total client ledger balance × configured FD rate ÷ 365. Configure rate in Admin → MIS Settings.</p>
      </div>

      <div className="panel">
        <div className="ptitle">📊 Daily volume — all segments (₹ Cr)<InfoBtn text="Turnover by segment (₹ crore) for today vs yesterday, MTD and prior 3-month averages, plus the volume premium on expiry days versus normal days." /></div>
        <div className="tw"><table>
          <thead><tr><th style={{ width: 180 }}>Segment</th><th>Today</th><th>Yesterday</th><th>MTD avg</th><th>Prior 3M avg</th><th>vs Prior 3M avg</th><th>Expiry premium</th></tr></thead>
          <tbody>
            {volume.map(r => (
              <tr key={r.segment} style={{ fontWeight: r.total ? 600 : 'normal', borderTop: r.total ? '.5px solid var(--br)' : undefined }}>
                <td><strong>{r.segment}</strong></td>
                <td>₹{r.today}Cr</td><td>₹{r.yesterday}Cr</td><td>₹{r.mtd_avg}Cr</td><td>₹{r.prior3m_avg}Cr</td>
                <td style={{ color: vsColor(r.vs) }}>{vsFmt(r.vs)}</td>
                <td>{r.expiry_premium == null ? '—' : <span className="badge b-act">{vsFmt(r.expiry_premium)} vs normal</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <div className="panel">
        <div className="ptitle">👥 Daily client activity<InfoBtn text="Client activity counts by category for today vs yesterday, MTD average and prior 3-month average." /></div>
        <div className="tw"><table>
          <thead><tr><th>Category</th><th>Today</th><th>Yesterday</th><th>MTD avg</th><th>Prior 3M avg</th><th>vs Prior 3M avg</th></tr></thead>
          <tbody>
            {activity.map(r => (
              <tr key={r.category}>
                <td>{r.category}{r.note ? <span style={{ fontSize: 10, color: 'var(--tx3)' }}> ({r.note})</span> : ''}</td>
                <td><strong>{num(r.today)}</strong></td><td>{num(r.yesterday)}</td><td>{num(r.mtd_avg)}</td><td>{num(r.prior3m_avg)}</td>
                <td style={{ color: vsColor(r.vs) }}>{vsFmt(r.vs)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">💰 MTF book summary<InfoBtn text="Margin Trading Facility book: net funding (₹Cr), daily interest earned, number of MTF clients and average book size per client." /></div>
          <div className="tw"><table>
            <thead><tr><th>Metric</th><th>Today</th><th>MTD avg</th><th>Prior 3M avg</th></tr></thead>
            <tbody>
              <tr><td>Net MTF funding (₹Cr)</td><td>{(mtf.funding / 1e7).toFixed(2)}</td><td>{(mtf.funding / 1e7).toFixed(2)}</td><td>—</td></tr>
              <tr><td>MTF interest earned (₹)</td><td>{inr(mtf.daily_interest)}</td><td>{inr(mtf.daily_interest)}</td><td>—</td></tr>
              <tr><td>MTF clients</td><td>{mtf.clients.toLocaleString('en-IN')}</td><td>{mtf.clients.toLocaleString('en-IN')}</td><td>—</td></tr>
              <tr><td>Avg book per client (₹L)</td><td>{(mtf.avg_per_client / 1e5).toFixed(2)}</td><td>{(mtf.avg_per_client / 1e5).toFixed(2)}</td><td>—</td></tr>
            </tbody>
          </table></div>
        </div>
        <div className="panel">
          <div className="ptitle">🥧 Revenue mix — today<InfoBtn text="Today's revenue split across streams as a percentage of total; clearing and brokerage read near zero until those feeds are imported." /></div>
          {revenue_mix.map((r, i) => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 130, fontSize: 12 }}>{r.label}</span>
              <div style={{ flex: 1, height: 8, background: 'var(--br2)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: r.pct + '%', height: '100%', background: MIX_COLORS[i % MIX_COLORS.length] }} />
              </div>
              <span style={{ width: 38, textAlign: 'right', fontSize: 12, fontWeight: 500 }}>{r.pct}%</span>
            </div>
          ))}
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Mix reflects the live revenue streams (clearing/brokerage read ~0 until imported).</p>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📊 Revenue trend (last 17 trading days) — red dots = expiry days<InfoBtn text="Total daily revenue (₹ lakh) over the last 17 trading days; expiry days highlighted in red." /></div>
        <ViewToggle
          chart={
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v + 'L'} />
            <Tooltip formatter={v => '₹' + v + 'L'} />
            <Bar dataKey="revenue_l" name="Revenue (₹L)" radius={[3, 3, 0, 0]}>
              {trend.map((d, i) => <Cell key={i} fill={d.is_expiry ? '#e24b4a' : '#185fa5'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
          }
          table={
            <table>
              <thead><tr><th>Date</th><th>Revenue (₹L)</th><th>Expiry day</th></tr></thead>
              <tbody>
                {trend.map((d, i) => (
                  <tr key={i}><td>{d.date}</td><td>{'₹' + d.revenue_l + 'L'}</td><td>{d.is_expiry ? 'Yes' : '—'}</td></tr>
                ))}
                {(!trend || trend.length === 0) && <tr><td colSpan={3} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
              </tbody>
            </table>
          }
        />
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📈 Options volume trend (₹Cr) — red dots = expiry<InfoBtn text="Daily options premium turnover (₹ crore) over recent trading days; expiry days marked in red." /></div>
          <ViewToggle
            chart={
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v + 'Cr'} />
              <Tooltip formatter={v => '₹' + v + 'Cr'} />
              <Line dataKey="options_cr" stroke="#185fa5" strokeWidth={2} name="Options premium TO (₹Cr)"
                dot={(p) => p.cx == null ? null : <circle key={p.key} cx={p.cx} cy={p.cy} r={p.payload.is_expiry ? 4 : 2.5} fill={p.payload.is_expiry ? '#e24b4a' : '#185fa5'} />} />
            </LineChart>
          </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>Date</th><th>Options premium TO (₹Cr)</th><th>Expiry day</th></tr></thead>
                <tbody>
                  {trend.map((d, i) => (
                    <tr key={i}><td>{d.date}</td><td>{'₹' + d.options_cr + 'Cr'}</td><td>{d.is_expiry ? 'Yes' : '—'}</td></tr>
                  ))}
                  {(!trend || trend.length === 0) && <tr><td colSpan={3} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                </tbody>
              </table>
            }
          />
        </div>
        <div className="panel">
          <div className="ptitle">👥 Daily client count trend<InfoBtn text="Number of clients who traded each day over recent trading days; expiry days highlighted in red." /></div>
          <ViewToggle
            chart={
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="clients" name="Clients traded" radius={[3, 3, 0, 0]}>
                {trend.map((d, i) => <Cell key={i} fill={d.is_expiry ? '#e24b4a' : '#185fa5'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>Date</th><th>Clients traded</th><th>Expiry day</th></tr></thead>
                <tbody>
                  {trend.map((d, i) => (
                    <tr key={i}><td>{d.date}</td><td>{num(d.clients)}</td><td>{d.is_expiry ? 'Yes' : '—'}</td></tr>
                  ))}
                  {(!trend || trend.length === 0) && <tr><td colSpan={3} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                </tbody>
              </table>
            }
          />
        </div>
      </div>

      <div className="brow" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn bp">📄 Export MIS (PDF)</button>
        <button className="btn">✉️ Email to management</button>
        <button className="btn">⬇️ Download as Excel</button>
      </div>
    </div>
  );
};

export default DailyMIS;