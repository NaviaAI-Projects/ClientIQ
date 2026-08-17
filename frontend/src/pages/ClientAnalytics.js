import React, { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api';
import { InfoBtn, ViewToggle, DateRange, rangeParams, ClientLink } from '../components/ui';

const rupee = (n) => {
  const v = Number(n) || 0;
  if (v === 0) return '—';
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + 'L';
  return '₹' + Math.round(v).toLocaleString('en-IN');
};
const pctDelta = (cur, prev) => (prev ? ((cur - prev) / prev) * 100 : null);
const spct = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%');
const TypeBadge = ({ t }) => {
  const type = t || 'RI';
  if (/HV/i.test(type) && /RI/i.test(type)) return <span className="badge" style={{ background: '#fdefd0', color: '#7a4510' }}>{type}</span>;
  if (/HV/i.test(type)) return <span className="badge" style={{ background: '#c8e8f7', color: '#0a5a80' }}>{type}</span>;
  if (/^NR|FN/i.test(type)) return <span className="badge b-nri">{type}</span>;
  return <span className="badge b-ri">{type}</span>;
};

const ClientAnalytics = () => {
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ucc, setUcc]     = useState('');
  const [range, setRange]     = useState({ key: 'month' });
  const [hvType, setHvType]   = useState('All');   // High-value watch client-type filter

  useEffect(() => {
    if (range.key === 'custom' && !(range.from && range.to)) return;
    setLoading(true);
    api.get('/analytics/client-analytics', { params: rangeParams(range) })
      .then(res => setData(res.data))
      .catch(() => setError('Could not load client analytics.'))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading && !data) return <div className="ph"><h2>Client analytics</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Client analytics</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, cards, daily_fo, daily_pnl = [], pnl_available, breakdown, hv_watch = [], hv_ri = [], hv_nri = [] } = data;
  const tradedDelta = pctDelta(cards.total_traded, cards.total_traded_prev);
  // RI vs NRI split of clients traded (each as a % of total clients traded in the period).
  const riPct  = cards.total_traded ? ((cards.ri  || 0) / cards.total_traded * 100).toFixed(1) : '0.0';
  const nriPct = cards.total_traded ? ((cards.nri || 0) / cards.total_traded * 100).toFixed(1) : '0.0';
  const hvRows = hvType === 'RI' ? hv_ri : hvType === 'NRI' ? hv_nri : hv_watch;   // client-type filter
  // Client-type breakdown total (RI + NRI): distinct counts are disjoint, so they sum to the whole.
  const bSum = (k) => (breakdown || []).reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const bTotOptTo = bSum('opt_to'), bTotBrok = bSum('brokerage'), bTotEqOpt = bSum('eq_options'), bTotActive = bSum('active');

  return (
    <div>
      <div className="ph">
        <h2>Client analytics</h2>
        <p>Active client profile, trading behaviour, P&amp;L outcomes, NRI vs Resident split, high-value client watch{meta && meta.as_of ? ` · As of ${meta.as_of}` : ''}</p>
      </div>

      <DateRange value={range} onChange={setRange} bounds={meta && meta.range ? { min: meta.range.data_min, max: meta.range.data_max } : undefined} active={meta && meta.range} />
      {loading && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>Updating…</div>}

      <div className="alert a-i">
        ℹ️ Enter any UCC to view their full trade profile: options premium TO, lot count, strike preference (OTM/ATM/ITM), expiry-week activity, win/loss ratio, float utilisation, and AI pattern analysis. For mapped clients, also shows RM interactions.
      </div>

      <div className="cards">
        <div className="card ci"><div className="clbl">Total clients traded (in period)</div><div className="cval">{cards.total_traded.toLocaleString('en-IN')}</div><div className="csub">vs prior {cards.total_traded_prev.toLocaleString('en-IN')} · {spct(tradedDelta)}</div></div>
        <div className="card cs"><div className="clbl">Profitable clients (in period)</div><div className="cval">{pnl_available ? cards.profitable.toLocaleString('en-IN') : '—'}</div><div className="csub">{pnl_available ? 'Realized P&L > 0 · matched buy/sell' : 'No matched round-trips in range'}</div></div>
        <div className="card cd"><div className="clbl">Loss clients (in period)</div><div className="cval">{pnl_available ? cards.loss.toLocaleString('en-IN') : '—'}</div><div className="csub">{pnl_available ? 'Realized P&L < 0 · matched buy/sell' : 'No matched round-trips in range'}</div></div>
        <div className="card cp">
          <div className="clbl">RI vs NRI clients traded (in period)</div>
          <div className="cval" style={{ fontSize: 20, lineHeight: 1.35 }}>
            RI {(cards.ri || 0).toLocaleString('en-IN')} <span style={{ fontSize: 12, color: 'var(--tx3)', fontWeight: 600 }}>({riPct}%)</span><br />
            NRI {cards.nri.toLocaleString('en-IN')} <span style={{ fontSize: 12, color: 'var(--tx3)', fontWeight: 600 }}>({nriPct}%)</span>
          </div>
          <div className="csub">of {cards.total_traded.toLocaleString('en-IN')} traded · {(cards.nri_total || 0).toLocaleString('en-IN')} NRI in book (UCC starts with 'N')</div>
        </div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📊 Profitable vs loss clients — daily F&amp;O trend<InfoBtn text="Daily count of clients whose same-day matched (round-trip) realized P&L ended positive vs negative. Uses same-day buy/sell matching; positions carried across days are not counted until closed." /></div>
          {pnl_available ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={daily_pnl} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                <Bar dataKey="Profit" fill="#2f9e6f" name="Profitable clients" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Loss" fill="#d85a5a" name="Loss clients" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: 'var(--tx3)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
              No same-day matched round-trips in this range yet — this counts clients whose intraday buy/sell netted a realized gain or loss.
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Same-day matched (round-trip) realized P&amp;L. Delivery/carry positions count only once closed.</p>
        </div>
        <div className="panel">
          <div className="ptitle">📈 NRI vs Resident F&amp;O clients — daily trend<InfoBtn text="Daily trend of active F&O clients split into Resident vs NRI. NRI = UCC beginning with 'N'." /></div>
          <ViewToggle
            chart={
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={daily_fo} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
              <Line dataKey="Resident" stroke="#185fa5" strokeWidth={2} name="Resident clients" />
              <Line dataKey="NRI" stroke="#e0803a" strokeWidth={2} name="NRI clients" />
            </LineChart>
          </ResponsiveContainer>
            }
            table={
          <table>
            <thead><tr><th>Date</th><th>Resident clients</th><th>NRI clients</th></tr></thead>
            <tbody>
              {(daily_fo || []).map(r => (
                <tr key={r.date}><td>{r.date}</td><td>{r.Resident}</td><td>{r.NRI}</td></tr>
              ))}
              {(!daily_fo || daily_fo.length === 0) && <tr><td colSpan={3} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
            </tbody>
          </table>
            }
          />
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>NRI vs Resident derived from the UCC — clients whose UCC begins with 'N' are counted as NRI.</p>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">📋 Client type breakdown — active traders (in period)<InfoBtn text="Distinct active traders in the selected period by client type, with distinct counts across Eq Options, Eq Cash, Commodity and MTF, plus average options turnover and brokerage per client. RI + NRI sum to the total clients-traded card." /></div>
        <div className="tw"><table>
          <thead><tr><th>Client type</th><th>Active clients</th><th>Eq Options</th><th>Eq Cash</th><th>Commodity</th><th>MTF users</th><th>Avg options TO/client</th><th>Avg brokerage/client</th></tr></thead>
          <tbody>
            {breakdown.map(r => (
              <tr key={r.client_type}>
                <td><TypeBadge t={r.client_type} /></td>
                <td>{r.active.toLocaleString('en-IN')}</td>
                <td>{r.eq_options.toLocaleString('en-IN')}</td>
                <td>{r.eq_cash.toLocaleString('en-IN')}</td>
                <td>{r.commodity.toLocaleString('en-IN')}</td>
                <td>{r.mtf_users.toLocaleString('en-IN')}</td>
                <td>{rupee(r.avg_opt_to)}</td>
                <td>{rupee(r.avg_brok)}</td>
              </tr>
            ))}
            {breakdown.length > 0 && (
              <tr style={{ fontWeight: 700, borderTop: '.5px solid var(--br)' }}>
                <td>Total</td>
                <td>{bTotActive.toLocaleString('en-IN')}</td>
                <td>{bSum('eq_options').toLocaleString('en-IN')}</td>
                <td>{bSum('eq_cash').toLocaleString('en-IN')}</td>
                <td>{bSum('commodity').toLocaleString('en-IN')}</td>
                <td>{bSum('mtf_users').toLocaleString('en-IN')}</td>
                <td>{rupee(bTotEqOpt ? bTotOptTo / bTotEqOpt : 0)}</td>
                <td>{rupee(bTotActive ? bTotBrok / bTotActive : 0)}</td>
              </tr>
            )}
          </tbody>
        </table></div>
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Breaks out by client type — NRI = UCC beginning with 'N', all others Resident (RI). Total row = RI + NRI (they tally to the Total-clients-traded card).</p>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            ⭐ High-value client watch — top by options TO<InfoBtn text="Top 10 clients ranked by options turnover, listing brokerage, ledger float (as of the selected date), MTF usage, mapped RM and active/dormant status. Use the filter to see the top All / Resident / NRI clients." />
            <select value={hvType} onChange={e => setHvType(e.target.value)}
              style={{ marginLeft: 'auto', padding: '3px 6px', border: '1px solid var(--br)', borderRadius: 6, fontSize: 11 }}>
              <option value="All">All clients</option>
              <option value="RI">Resident (RI)</option>
              <option value="NRI">NRI</option>
            </select>
          </div>
          <div className="tw"><table>
            <thead><tr><th>UCC</th><th>Name</th><th>Type</th><th>Options TO</th><th>Brokerage</th><th>Float</th><th>MTF</th><th>RM</th><th>Status</th></tr></thead>
            <tbody>
              {hvRows.map(r => (
                <tr key={r.ucc}>
                  <td>{r.ucc}</td><td><ClientLink ucc={r.ucc} name={r.name} /></td>
                  <td><TypeBadge t={r.client_type} /></td>
                  <td>{rupee(r.opt_to)}</td><td>{rupee(r.brokerage)}</td><td>{rupee(r.float)}</td><td>{r.mtf > 0 ? '✓' : '—'}</td><td>{r.rm_name}</td>
                  <td><span className={`badge ${r.status === 'Active' ? 'b-act' : 'b-dor'}`}>{r.status}</span></td>
                </tr>
              ))}
              {hvRows.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--tx3)' }}>No {hvType === 'NRI' ? 'NRI ' : hvType === 'RI' ? 'resident ' : ''}option traders in this period.</td></tr>}
            </tbody>
          </table></div>
        </div>
        <div className="panel">
          <div className="ptitle">🔎 Individual client drill-down<InfoBtn text="Enter a UCC to open that client's full trade profile and Client 360 drill-down for the selected period." /></div>
          <div className="brow" style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input style={{ width: 220 }} placeholder="Enter UCC to analyse…" value={ucc} onChange={e => setUcc(e.target.value)} />
            <select style={{ width: 130 }}><option>Last 1 month</option><option>Last 3 months</option><option>Last 6 months</option></select>
            <button className="btn bp">🔎 Load client</button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--tx2)' }}>Or click any UCC in this report to go directly to their Client 360 profile.</p>
        </div>
      </div>
    </div>
  );
};

export default ClientAnalytics;