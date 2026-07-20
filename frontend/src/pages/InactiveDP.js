import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import api from '../api';
import { InfoBtn, ViewToggle, ClientLink } from '../components/ui';

const rupee = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + 'L';
  return '₹' + Math.round(v).toLocaleString('en-IN');
};
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const mmY = (d) => { if (!d) return 'Never'; const dt = new Date(d); return `${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`; };
const ageYrs = (d) => { if (!d) return '—'; const yrs = (Date.now() - new Date(d).getTime()) / (365.25 * 864e5); return yrs.toFixed(1) + ' yrs'; };
const PIE_COLORS = ['#185fa5', '#FAC775', '#9FE1CB', '#AFA9EC', '#e0803a'];

// Type badge coloured to match the prototype
const TypeBadge = ({ t }) => {
  const type = t || 'RI';
  if (/HV/i.test(type) && /RI/i.test(type)) return <span className="badge" style={{ background: '#fdefd0', color: '#7a4510' }}>{type}</span>;
  if (/HV/i.test(type)) return <span className="badge" style={{ background: '#c8e8f7', color: '#0a5a80' }}>{type}</span>;
  if (/^NR|FN/i.test(type)) return <span className="badge b-nri">{type}</span>;
  return <span className="badge b-ri">{type}</span>;
};

const InactiveDP = () => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [sortBy, setSortBy]   = useState('holding');
  const [durFilter, setDurFilter]   = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    api.get('/analytics/inactive')
      .then(res => setData(res.data))
      .catch(() => setError('Could not load inactive/DP data.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="ph"><h2>Inactive accounts &amp; DP holdings</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Inactive accounts &amp; DP holdings</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, summary, bands, by_type, value_dist, priority } = data;

  const bandData = bands.map(b => ({ name: b.band, 'With DP holdings': b.with_dp, 'No holdings or balance': b.no_dp }));
  const typePie  = by_type.filter(t => t.count > 0).map(t => ({ name: t.client_type, value: t.count }));
  const valData  = value_dist.map(v => ({ name: v.bucket, count: v.count }));

  const inDur = (d) => {
    if (durFilter === 'all' || d == null) return durFilter === 'all';
    if (durFilter === '30-90') return d >= 30 && d < 90;
    if (durFilter === '90-180') return d >= 90 && d < 180;
    if (durFilter === '180+') return d >= 180;
    return true;
  };
  const inType = (t) => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'nre') return /^NR/i.test(t || '');
    if (typeFilter === 'rihv') return /RI-HV/i.test(t || '');
    if (typeFilter === 'ri') return (t || 'RI') === 'RI';
    return true;
  };
  const sortedPriority = priority
    .filter(r => inDur(r.days_inactive) && inType(r.client_type))
    .sort((a, b) => {
      if (sortBy === 'holding') return b.holding_value - a.holding_value;
      if (sortBy === 'lasttrade') return new Date(b.last_trade || 0) - new Date(a.last_trade || 0);
      if (sortBy === 'age') return new Date(a.account_open_date || 0) - new Date(b.account_open_date || 0);
      return 0;
    });

  return (
    <div>
      <div className="ph">
        <h2>Inactive accounts &amp; DP holdings</h2>
        <p>Accounts with no trades — segmented by inactivity duration and whether they hold securities in DP. Highest-priority reactivation opportunity.{meta && meta.as_of ? ` · As of ${meta.as_of}` : ''}</p>
      </div>

      <div className="alert a-w">
        ⚠️ Clients with DP holdings are significantly more valuable to reactivate — they have assets already custodied with you. An options or equity trade from these clients is one conversation away.
      </div>

      <div className="cards">
        <div className="card cd"><div className="clbl">Total inactive accounts</div><div className="cval">{summary.inactive_total.toLocaleString('en-IN')}</div><div className="csub">No trade in last 30 days</div></div>
        <div className="card cw"><div className="clbl">Inactive with DP holdings</div><div className="cval">{summary.inactive_with_dp.toLocaleString('en-IN')}</div><div className="csub">Hold securities — highest priority</div></div>
        <div className="card cp"><div className="clbl">Holding value (inactive DP)</div><div className="cval">{rupee(summary.inactive_dp_value)}</div><div className="csub">Avg {rupee(summary.inactive_dp_avg)} per inactive DP client</div></div>
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📊 Inactive accounts by duration band<InfoBtn text="Count of inactive accounts by inactivity-duration band, stacked by whether they hold securities in DP versus having no holdings or balance." /></div>
          <ViewToggle
            chart={
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bandData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
              <Bar dataKey="With DP holdings" stackId="a" fill="#185fa5" />
              <Bar dataKey="No holdings or balance" stackId="a" fill="#c7cfdb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
            }
            table={
              <table>
                <thead><tr><th>Duration band</th><th>With DP holdings</th><th>No holdings or balance</th></tr></thead>
                <tbody>
                  {bandData.map((d, i) => (
                    <tr key={i}><td>{d.name}</td><td>{(d['With DP holdings'] || 0).toLocaleString('en-IN')}</td><td>{(d['No holdings or balance'] || 0).toLocaleString('en-IN')}</td></tr>
                  ))}
                  {(!bandData || bandData.length === 0) && <tr><td colSpan={3} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                </tbody>
              </table>
            }
          />
        </div>
        <div className="panel">
          <div className="ptitle">🥧 Inactive with DP holdings — by client type<InfoBtn text="Inactive clients holding DP securities broken down by client type (RI, RI-HV, NRE/NRO). All import as RI until client types are loaded." /></div>
          {typePie.length === 0 ? <div style={{ color: 'var(--tx3)', fontSize: 13, padding: '20px 0' }}>No data.</div> : (
            <ViewToggle
              chart={
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={typePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={48}
                     label={(e) => `${e.name}: ${(e.percent * 100).toFixed(0)}%`} labelLine={false}>
                  {typePie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => v.toLocaleString('en-IN')} /><Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
              }
              table={
                <table>
                  <thead><tr><th>Client type</th><th>Clients</th></tr></thead>
                  <tbody>
                    {typePie.map((d, i) => (
                      <tr key={i}><td>{d.name}</td><td>{d.value.toLocaleString('en-IN')}</td></tr>
                    ))}
                    {typePie.length === 0 && <tr><td colSpan={2} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
                  </tbody>
                </table>
              }
            />
          )}
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Client-type segmentation reflects the current master (all clients import as RI until types are loaded).</p>
        </div>
      </div>

      <div className="panel">
        <div className="ptitle">💼 Inactive accounts WITH DP holdings — priority reactivation list<InfoBtn text="Inactive clients holding securities in DP, ranked as top reactivation targets; filter by inactivity duration and client type, sort by holding value, last trade or account age." /></div>
        <p style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 10 }}>These clients have securities custodied with Navia but are not trading. They are the highest-value reactivation targets — they already trust you with their assets.</p>
        <div className="brow" style={{ marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ width: 160 }} value={durFilter} onChange={e => setDurFilter(e.target.value)}>
            <option value="all">All durations</option>
            <option value="30-90">30–90 days inactive</option>
            <option value="90-180">90–180 days</option>
            <option value="180+">180+ days</option>
          </select>
          <select style={{ width: 120 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            <option value="nre">NRE/NRO</option>
            <option value="rihv">RI-HV</option>
            <option value="ri">RI</option>
          </select>
          <select style={{ width: 160 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="holding">Sort: holding value</option>
            <option value="lasttrade">Sort: last trade date</option>
            <option value="age">Sort: account age</option>
          </select>
          <button className="btn bp">🤖 Auto-assign as leads</button>
          <button className="btn">⬇️ Export list</button>
        </div>
        <div className="tw"><table>
          <thead><tr><th>UCC</th><th>Name</th><th>Type</th><th>Last trade</th><th>Inactive (days)</th><th>Holding value</th><th>No. of stocks</th><th>Account age</th><th>RM</th><th>Action</th></tr></thead>
          <tbody>
            {sortedPriority.map(r => (
              <tr key={r.ucc}>
                <td>{r.ucc}</td><td><ClientLink ucc={r.ucc} name={r.name} /></td>
                <td><TypeBadge t={r.client_type} /></td>
                <td>{mmY(r.last_trade)}</td>
                <td>{r.days_inactive == null ? 'Never' : r.days_inactive.toLocaleString('en-IN')}</td>
                <td style={{ fontWeight: 500, color: 'var(--sc)' }}>{rupee(r.holding_value)}</td>
                <td>—</td>
                <td>{ageYrs(r.account_open_date)}</td>
                <td>{r.rm_name}</td>
                <td>{r.rm_name === '—'
                  ? <button className="btn sm bp">Assign lead</button>
                  : <button className="btn sm">Contact</button>}</td>
              </tr>
            ))}
            {sortedPriority.length === 0 && <tr><td colSpan={10} style={{ color: 'var(--tx3)' }}>No inactive clients with DP holdings.</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="panel">
        <div className="ptitle">📊 DP holding value distribution — inactive clients with holdings<InfoBtn text="Number of inactive DP-holding clients in each holding-value bucket; clients above ₹2L are the most actionable reactivation targets." /></div>
        <ViewToggle
          chart={
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={valData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={v => v.toLocaleString('en-IN') + ' clients'} />
            <Bar dataKey="count" fill="#185fa5" radius={[4, 4, 0, 0]} name="Inactive clients with DP holdings" />
          </BarChart>
        </ResponsiveContainer>
          }
          table={
            <table>
              <thead><tr><th>Holding value bucket</th><th>Inactive clients with DP holdings</th></tr></thead>
              <tbody>
                {valData.map((d, i) => (
                  <tr key={i}><td>{d.name}</td><td>{d.count.toLocaleString('en-IN')}</td></tr>
                ))}
                {(!valData || valData.length === 0) && <tr><td colSpan={2} style={{ color: 'var(--tx3)' }}>No data.</td></tr>}
              </tbody>
            </table>
          }
        />
        <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Clients with holdings &gt;₹2L are the most actionable reactivation targets — they have meaningful equity exposure and are likely still monitoring markets.</p>
      </div>

      <div className="panel">
        <div className="ptitle">📅 Never-traded accounts — opened but no trade recorded<InfoBtn text="Accounts opened but with zero trades ever: total count, those holding DP securities, and those opened within the last 90 days still in the activation window." /></div>
        <div className="tc2" style={{ marginBottom: 0 }}>
          <div>
            <div className="slbl">Summary</div>
            <div className="cards" style={{ marginBottom: 0 }}>
              <div className="card cd"><div className="clbl">Never traded</div><div className="cval">{summary.never_traded.toLocaleString('en-IN')}</div><div className="csub">Account opened, zero trades ever</div></div>
              <div className="card cw"><div className="clbl">With DP holdings</div><div className="cval">{summary.never_with_dp.toLocaleString('en-IN')}</div><div className="csub">Transferred in stocks, never traded</div></div>
              <div className="card cp"><div className="clbl">Opened &lt;90 days ago</div><div className="cval">{summary.never_recent.toLocaleString('en-IN')}</div><div className="csub">Still in activation window</div></div>
            </div>
          </div>
          <div>
            <div className="slbl">Action</div>
            <div className="alert a-i">💡 Never-traded clients who funded their account are the highest-conversion reactivation target — they had intent. A single onboarding call explaining options basics converts ~18% (industry benchmark). The {summary.never_with_dp.toLocaleString('en-IN')} who transferred DP holdings are the highest-priority — they moved assets to you and then stopped.</div>
            <div className="brow" style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button className="btn bp">🤖 Generate outreach list (never-traded with DP holdings)</button>
              <button className="btn">⬇️ Export</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InactiveDP;