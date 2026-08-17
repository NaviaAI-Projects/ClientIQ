import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api';
import { InfoBtn, ViewToggle, DateRange, rangeParams, ClientLink } from '../components/ui';

const rupee = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr';
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + 'L';
  return '₹' + Math.round(v).toLocaleString('en-IN');
};
const scoreClass = (s) => (s == null ? 'ais l' : s >= 75 ? 'ais h' : s >= 60 ? 'ais m' : 'ais l');

const SupervisorDashboard = () => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [range, setRange]     = useState({ key: 'month' });
  const navigate = useNavigate();

  useEffect(() => {
    if (range.key === 'custom' && !(range.from && range.to)) return; // wait for both custom dates
    setLoading(true);
    api.get('/analytics/company-dashboard', { params: rangeParams(range) })
      .then(res => setData(res.data))
      .catch(() => setError('Could not load company dashboard.'))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading && !data) return <div className="ph"><h2>Company dashboard</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Company dashboard</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { meta, totals, revenue, pipeline, churn, rm_table, pending_top, trend, company_turnover } = data;
  const commissionTracked = !(meta && meta.commission_loaded === false);
  // Daily trend (one point per calendar day in the selected range), amounts in ₹.
  const chartData = trend.map(t => ({
    month: t.month,          // day label, e.g. "7 Aug"
    Brokerage: Math.round(Number(t.Brokerage) || 0),
    Commission: t.Commission == null ? 0 : Math.round(Number(t.Commission) || 0),
    MTF: Math.round(Number(t.MTF) || 0),
    Float: Math.round(Number(t.Other) || 0),   // float income (carry-forward on weekends/holidays)
  }));

  return (
    <div>
      <div className="ph">
        <h2>Company dashboard</h2>
        <p>All {totals.total_clients.toLocaleString('en-IN')} clients · All RMs{meta.data_as_of ? ` · Trade date: ${meta.data_as_of}` : ''}</p>
      </div>

      <DateRange value={range} onChange={setRange} bounds={meta && meta.range ? { min: meta.range.data_min, max: meta.range.data_max } : undefined} active={meta && meta.range} />
      {loading && <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 8 }}>Updating…</div>}

      <div className="cards">
        <div className="card ci"><div className="clbl">Total clients</div><div className="cval">{totals.total_clients.toLocaleString('en-IN')}</div><div className="csub">Mapped {totals.mapped.toLocaleString('en-IN')} · Unmapped {totals.unmapped.toLocaleString('en-IN')}</div></div>
        <div className="card cs"><div className="clbl">Company revenue · avg/day<InfoBtn text="Average TOTAL company revenue per trading day over the selected date range (total ÷ trading days). Total revenue = brokerage + commission/clearing (daily_trades) + MTF interest (mtf_interest) + estimated float income (ledger balance × FD rate ÷ 365). Change the range with the filter above." /></div><div className="cval">{rupee(revenue.avg_rev_per_day)}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--tx3)' }}>/day</span></div><div className="csub">{meta.range ? `${meta.range.from} – ${meta.range.to} · ` : ''}Total {rupee(revenue.total_rev)} over {meta.range?.trading_days ?? 0} trading days</div></div>
        <div className="card cw"><div className="clbl">Active leads in pipeline</div><div className="cval">{pipeline.active_leads.toLocaleString('en-IN')}</div><div className="csub">Pending approvals: {pipeline.pending_approvals}</div></div>
        <div className="card cd"><div className="clbl">Churn risk (mapped)</div><div className="cval">{churn.churn_high.toLocaleString('en-IN')}</div><div className="csub">High risk across {churn.rms_affected} RMs</div></div>
      </div>

      <div className="panel">
        <div className="ptitle">📊 Company revenue trend — daily<InfoBtn text="Daily company revenue by stream for the selected date range: Brokerage and Commission/clearing (from daily_trades), MTF interest spread to each day, and estimated Float income (ledger balance × FD rate ÷ 365, carried forward on weekends/holidays). One bar per calendar day in the range — no all-time total." /></div>
        <ViewToggle
          chart={
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={rupee} width={64} />
                <Tooltip formatter={v => rupee(v)} /><Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                <Bar dataKey="Brokerage"  stackId="s" fill="#185fa5" />
                <Bar dataKey="Commission" stackId="s" fill="#9FE1CB" />
                <Bar dataKey="MTF"        stackId="s" fill="#FAC775" />
                <Bar dataKey="Float"      stackId="s" fill="#AFA9EC" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          }
          table={
            <table>
              <thead><tr><th>Date</th><th>Brokerage</th><th>Commission</th><th>MTF</th><th>Float</th></tr></thead>
              <tbody>
                {chartData.map(r => (
                  <tr key={r.month}><td>{r.month}</td><td>{rupee(r.Brokerage)}</td><td>{commissionTracked ? rupee(r.Commission) : '—'}</td><td>{rupee(r.MTF)}</td><td>{rupee(r.Float)}</td></tr>
                ))}
                {chartData.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--tx3)' }}>No data in range.</td></tr>}
              </tbody>
            </table>
          }
        />
      </div>

      <div className="tc2">
        <div className="panel">
          <div className="ptitle">🏆 RM revenue MTD<InfoBtn text="Brokerage each RM's mapped clients generated this month (sum of brokerage_earned in daily_trades for the current month). Pace = clients ÷ RM capacity. Fills in once the brokerage file is imported." /></div>
          <table>
            <thead><tr><th>RM</th><th>Clients</th><th>Revenue</th><th>Turnover %<InfoBtn text="This RM's client turnover as a share of total company turnover over the selected range (RM turnover ÷ company turnover). Mapped RMs won't add up to 100% — unmapped clients hold the remainder." /></th><th>Pace</th><th>Leads</th></tr></thead>
            <tbody>
              {rm_table.map(r => (
                <tr key={r.rm_name}>
                  <td>{r.rm_name}</td>
                  <td>{r.clients}</td>
                  <td>{rupee(r.revenue)}</td>
                  <td>{company_turnover > 0 ? ((r.turnover / company_turnover) * 100).toFixed(1) + '%' : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="prog" style={{ width: 60, background: 'var(--br2)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div className="pf" style={{ width: Math.min(100, r.utilization) + '%', height: '100%', background: 'var(--sc)' }} />
                      </div>
                      <span style={{ fontSize: 11 }}>{Math.round(r.utilization)}%</span>
                    </div>
                  </td>
                  <td>{r.leads}</td>
                </tr>
              ))}
              {rm_table.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--tx3)' }}>No RMs.</td></tr>}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>Pace = book utilisation (clients ÷ capacity). Revenue is brokerage-based and fills in as the brokerage file is imported.</p>
        </div>
        <div className="panel">
          <div className="ptitle">📋 Pending approvals (top 3)<InfoBtn text="Top 3 unmapped clients in the lead pool awaiting mapping approval, ranked by AI lead score (0–100). Opt-in = whether the client clicked the outreach link." /></div>
          <table>
            <thead><tr><th>Client</th><th>RM</th><th>Score</th><th>Opt-in</th><th>Actions</th></tr></thead>
            <tbody>
              {pending_top.map(r => (
                <tr key={r.ucc}>
                  <td><ClientLink ucc={r.ucc} name={r.name} /></td>
                  <td>{r.rm_name}</td>
                  <td><span className={scoreClass(r.lead_score)}>{r.lead_score == null ? '—' : r.lead_score}</span></td>
                  <td><span className={`badge ${r.opt_in === 'Clicked' ? 'b-act' : 'b-pend'}`}>{r.opt_in}</span></td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button className="btn sm bs" onClick={() => navigate('/mapping-approvals')}>Approve</button>
                    <button className="btn sm bd" onClick={() => navigate('/mapping-approvals')}>Reject</button>
                  </td>
                </tr>
              ))}
              {pending_top.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--tx3)' }}>No pending approvals.</td></tr>}
            </tbody>
          </table>
          <div style={{ marginTop: 8 }}><button className="btn bp" onClick={() => navigate('/mapping-approvals')}>➡️ View all approvals</button></div>
        </div>
      </div>
    </div>
  );
};

export default SupervisorDashboard;