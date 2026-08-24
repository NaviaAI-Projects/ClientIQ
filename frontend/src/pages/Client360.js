import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api';
import { BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const FMT = v => {
  if (!v || v === 0) return '₹0';
  if (v >= 1000000) return '₹' + (v/100000).toFixed(0) + 'L';
  if (v >= 100000)  return '₹' + (v/100000).toFixed(1) + 'L';
  if (v >= 1000)    return '₹' + (v/1000).toFixed(0) + 'K';
  return '₹' + Number(v).toFixed(2);
};

const formatDate = date => date ? new Date(date).toLocaleDateString('en-IN') : '-';

const Info = ({ label, value, highlight }) => (
  <div>
    <div style={{ fontSize: '10px', fontWeight: '600', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>{label}</div>
    <div style={{ fontSize: '13px', color: highlight ? 'var(--ic)' : 'var(--tx)', fontWeight: highlight ? '600' : '400' }}>{value || '—'}</div>
  </div>
);

const Client360 = () => {
  const location    = useLocation();
  const navigate    = useNavigate();
  const selectedUcc = location.state?.ucc;
  const dropdownRef = useRef(null);

  const [ucc, setUcc]                   = useState('');
  const [client, setClient]             = useState(null);
  const [chartData, setChartData]       = useState([]);
  const [income, setIncome]             = useState(null);   // #20 income/revenue breakup
  const [nudges, setNudges]             = useState([]);
  const [search, setSearch]             = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching]       = useState(false);
  const [clientLoading, setClientLoading] = useState(false);
  const [chartView, setChartView]       = useState('chart'); // 'chart' | 'table'

  // ── RM-initiated "Request unmap" (goes to supervisor for approval) ──
  const [reqOpen, setReqOpen]     = useState(false);
  const [reqReason, setReqReason] = useState('');
  const [reqBusy, setReqBusy]     = useState(false);
  const [reqMsg, setReqMsg]       = useState(null);   // { ok, text }

  // On mount — load first client or navigate-passed UCC
  useEffect(() => {
    if (selectedUcc) {
      fetchClient(selectedUcc);
    } else {
      // Load first client by default
      api.get('/clients?limit=1').then(res => {
        const first = res.data.clients?.[0];
        if (first) fetchClient(first.ucc);
      }).catch(console.error);
    }
  }, []); // eslint-disable-line

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced search — hits backend
  useEffect(() => {
    if (search.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get(`/clients?search=${encodeURIComponent(search)}&limit=15`);
        setSearchResults(res.data.clients || []);
        setShowDropdown(true);
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchClient = async clientUcc => {
    setClientLoading(true);
    setClient(null);
    setChartData([]);
    setIncome(null);
    setNudges([]);
    setUcc(clientUcc);
    setReqOpen(false); setReqReason(''); setReqMsg(null);   // reset unmap form when switching clients
    try {
      const [clientRes, chartRes, incomeRes] = await Promise.all([
        api.get(`/clients/${clientUcc}`),
        api.get(`/clients/${clientUcc}/chart-data`),
        api.get(`/clients/${clientUcc}/income-breakup`).catch(() => ({ data: null }))
      ]);
      setClient(clientRes.data);
      setChartData(chartRes.data || []);
      setIncome(incomeRes.data || null);
      // fetch nudges separately — don't block main load
      api.get(`/nudge?ucc=${clientUcc}`)
        .then(r => setNudges(r.data.nudges || []))
        .catch(() => {});
    } catch (err) {
      console.error(err);
    } finally {
      setClientLoading(false);
    }
  };

  const selectClient = c => {
    setSearch('');
    setShowDropdown(false);
    setSearchResults([]);
    fetchClient(c.ucc);
  };

  const submitUnmap = async () => {
    setReqBusy(true); setReqMsg(null);
    try {
      const res = await api.post('/analytics/unmap-requests/request', { ucc, reason: reqReason });
      setReqMsg({ ok: true, text: res.data?.already
        ? 'A request for this client is already pending approval.'
        : 'Unmap request submitted — pending supervisor approval.' });
      setReqReason('');
    } catch (e) {
      setReqMsg({ ok: false, text: e?.response?.data?.message || 'Could not submit request.' });
    } finally {
      setReqBusy(false);
    }
  };

  return (
    <div>
      <div className="ph">
        <h2>Client 360</h2>
        <p>Complete client profile — trading history, balance, holdings, AI insights</p>
      </div>

      {/* Search panel */}
      <div className="panel" style={{ marginBottom: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>

          <div className="fgrp" ref={dropdownRef} style={{ position: 'relative' }}>
            <label>Search client by UCC or Name</label>
            <input
              type="text"
              placeholder="Type UCC or client name to search all clients..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => { if (search.length >= 2) setShowDropdown(true); }}
              autoComplete="off"
            />
            {search.length > 0 && search.length < 2 && (
              <div style={{ fontSize: '11px', color: 'var(--tx3)', marginTop: '4px' }}>
                Type at least 2 characters to search
              </div>
            )}

            {/* Dropdown */}
            {showDropdown && search.length >= 2 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
                background: 'var(--bg)', border: '1px solid var(--br)',
                borderRadius: 'var(--r2)', boxShadow: 'var(--shadow-md)',
                maxHeight: '280px', overflowY: 'auto', marginTop: '4px'
              }}>
                {searching ? (
                  <div style={{ padding: '14px', fontSize: '13px', color: 'var(--tx3)', textAlign: 'center' }}>
                    Searching...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div style={{ padding: '14px', fontSize: '13px', color: 'var(--tx3)', textAlign: 'center' }}>
                    No clients found for "{search}"
                  </div>
                ) : searchResults.map(c => (
                  <div
                    key={c.ucc}
                    onClick={() => selectClient(c)}
                    style={{
                      padding: '10px 14px', cursor: 'pointer',
                      fontSize: '13px', borderBottom: '1px solid var(--br)',
                      display: 'flex', alignItems: 'center', gap: '10px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ic)', fontWeight: '600', flexShrink: 0, minWidth: '80px' }}>
                      {c.ucc}
                    </span>
                    <span style={{ flex: 1, fontWeight: '500' }}>{c.name}</span>
                    <span className={`badge ${
                      ['nri','nre','nro'].some(t => c.client_type?.toLowerCase().includes(t))
                        ? 'b-nri'
                        : c.client_type?.toLowerCase().includes('hv')
                        ? 'b-hv'
                        : 'b-ri'
                    }`}>
                      {c.client_type}
                    </span>
                    <span className={`badge ${c.is_active ? 'b-act' : 'b-dor'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            className="btn sm"
            style={{ marginBottom: '1px' }}
            onClick={() => { setSearch(''); setSearchResults([]); setShowDropdown(false); }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Loading */}
      {clientLoading && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx3)' }}>
          Loading client details...
        </div>
      )}

      {/* Nudge alerts */}
      {!clientLoading && client && nudges.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          {nudges.map((n, i) => (
            <div key={i}
              className={`alert ${n.type === 'warning' ? 'a-w' : n.type === 'success' ? 'a-s' : 'a-i'}`}
              style={{ borderLeft: `4px solid ${n.type === 'warning' ? 'var(--wc)' : n.type === 'success' ? 'var(--sc)' : 'var(--ic)'}` }}
            >
              <span style={{ fontSize: '16px', flexShrink: 0 }}>
                {n.icon === 'WARN' ? '⚠️' : n.icon === 'OK' ? '✅' : '📊'}
              </span>
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>
                  {n.title}
                </div>
                <div style={{ fontSize: '13px', lineHeight: '1.5' }}>{n.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Client details */}
      {!clientLoading && client && (
        <>
          {/* KPI cards */}
          <div className="cards">
            <div className="card ci">
              <div className="clbl">Latest Balance</div>
              <div className="cval">{FMT(client.latest_balance)}</div>
              <div className="csub">Opening ledger</div>
            </div>
            <div className="card cs">
              <div className="clbl">Holdings Value</div>
              <div className="cval">{FMT(client.latest_holdings)}</div>
              <div className="csub">Total DP holdings</div>
            </div>
            <div className="card cw">
              <div className="clbl">Lead Score</div>
              <div className="cval">{client.lead_score || '—'}</div>
              <div className="csub">AI opportunity score</div>
            </div>
            <div className="card cd">
              <div className="clbl">Churn Risk</div>
              <div className="cval">{client.churn_risk_score || '—'}</div>
              <div className="csub">AI churn probability</div>
            </div>
          </div>

          {/* Client info */}
          <div className="panel">
            <div className="ptitle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{client.name}</span>
              {client.is_mapped && client.rm_name && (
                <button className="btn bd sm" onClick={() => { setReqOpen(o => !o); setReqMsg(null); }}>
                  ➖ Request unmap
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              <Info label="UCC"               value={client.ucc}                                          highlight />
              <Info label="Client Type"       value={client.client_type} />
              <Info label="Plan"              value={client.plan} />
              <Info label="Mapped RM"         value={client.rm_name || 'Unmapped'} />
              <Info label="Account Open Date" value={formatDate(client.account_open_date)} />
              <Info label="Last Trade Date"   value={formatDate(client.last_trade_date)} />
              <Info label="Status"            value={client.is_active ? 'Active' : 'Inactive'} />
              <Info label="Mapped"            value={client.is_mapped ? 'Yes' : 'No'} />
            </div>

            {reqOpen && client.is_mapped && client.rm_name && (
              <div style={{ marginTop: '14px', padding: '12px', background: 'var(--bg2)', border: '1px solid var(--br)', borderRadius: 'var(--r2)' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Request to unmap <strong>{client.name}</strong> from <strong>{client.rm_name}</strong>
                </div>
                <textarea
                  value={reqReason}
                  onChange={e => setReqReason(e.target.value)}
                  placeholder="Reason for unmapping (e.g. client relocated, inactive, requested a different RM)…"
                  rows={2}
                  style={{ width: '100%', fontSize: '13px', fontFamily: 'var(--font)', padding: '8px 10px', border: '1px solid var(--br)', borderRadius: 'var(--r2)', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn bp sm" disabled={reqBusy} onClick={submitUnmap}>
                    {reqBusy ? 'Submitting…' : 'Submit request'}
                  </button>
                  <button className="btn sm" disabled={reqBusy} onClick={() => setReqOpen(false)}>Cancel</button>
                  {reqMsg && (
                    <span style={{ fontSize: '12px', color: reqMsg.ok ? 'var(--sc)' : 'var(--dc)' }}>{reqMsg.text}</span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--tx3)', marginTop: '6px' }}>
                  This goes to your supervisor for approval. The client stays mapped until the request is approved.
                </div>
              </div>
            )}
          </div>

          {/* #20 Income / revenue breakup — Clearing charges, Turnover, Float, MTF */}
          {income && (
            <div className="panel">
              <div className="ptitle">Income &amp; revenue breakup</div>
              <div style={{ fontSize: '11px', color: 'var(--tx3)', marginBottom: '12px' }}>
                Over trade detail held for this client{income.window && income.window.trade_days ? ` · ${income.window.trade_days} trading days` : ''}
                {income.window && income.window.from && income.window.to ? ` (${formatDate(income.window.from)} – ${formatDate(income.window.to)})` : ''}
                . Total revenue = Clearing + Float + MTF (turnover is trading volume, shown for context).
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div className="card cs">
                  <div className="clbl">Clearing charges</div>
                  <div className="cval">{FMT(income.clearing)}</div>
                  <div className="csub">Clearing commission earned</div>
                </div>
                <div className="card ci">
                  <div className="clbl">Turnover</div>
                  <div className="cval">{FMT(income.turnover)}</div>
                  <div className="csub">Total traded value (volume)</div>
                </div>
                <div className="card cw">
                  <div className="clbl">Float</div>
                  <div className="cval">{FMT(income.float_income)}</div>
                  <div className="csub">Est. / month · {income.fd_rate}% on {FMT(income.ledger_balance)} credit</div>
                </div>
                <div className="card cp">
                  <div className="clbl">MTF</div>
                  <div className="cval">{FMT(income.mtf_interest)}</div>
                  <div className="csub">MTF interest earned</div>
                </div>
              </div>
              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--tx2)' }}>
                Total revenue (Clearing + Float + MTF): <strong>{FMT(income.total_income)}</strong>
              </div>
            </div>
          )}

          {/* Charts */}
          {chartData.length === 0 ? (
            <div className="panel" style={{ textAlign: 'center', padding: '30px', color: 'var(--tx3)', fontSize: '13px' }}>
              No trading history available for this client yet
            </div>
          ) : (
            <>
              <div className="slbl" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Daily trading activity — last 30 days</span>
                <span style={{ display: 'inline-flex', gap: '4px' }}>
                  <button className="btn sm" style={{ opacity: chartView === 'chart' ? 1 : 0.5 }} onClick={() => setChartView('chart')}>Chart</button>
                  <button className="btn sm" style={{ opacity: chartView === 'table' ? 1 : 0.5 }} onClick={() => setChartView('table')}>Table</button>
                </span>
              </div>

              {chartView === 'chart' ? (
              <>
              {/* Turnover by segment */}
              <div className="panel">
                <div className="ptitle">Turnover by Segment (₹/day)</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={20} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => {
                      if (v >= 100000) return '₹' + (v/100000).toFixed(1) + 'L';
                      if (v >= 1000)   return '₹' + (v/1000).toFixed(0) + 'K';
                      return '₹' + v;
                    }} />
                    <Tooltip formatter={v => {
                      if (v >= 100000) return '₹' + (v/100000).toFixed(1) + 'L';
                      if (v >= 1000)   return '₹' + (v/1000).toFixed(1) + 'K';
                      return '₹' + v.toFixed(2);
                    }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} iconSize={10} />
                    <Bar dataKey="eq_cash"    name="Eq Cash"    stackId="s" fill="#b5d4f4" />
                    <Bar dataKey="eq_futures" name="Eq Futures" stackId="s" fill="#378add" />
                    <Bar dataKey="eq_options" name="Eq Options" stackId="s" fill="#185fa5" />
                    <Bar dataKey="comm_fut"   name="Comm Fut"   stackId="s" fill="#9FE1CB" />
                    <Bar dataKey="comm_opt"   name="Comm Opt"   stackId="s" fill="#1D9E75" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="tc2">
                {/* Opening balance */}
                <div className="panel">
                  <div className="ptitle">Opening Balance (₹/day)</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={20} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => {
                        if (v >= 100000) return '₹' + (v/100000).toFixed(1) + 'L';
                        if (v >= 1000)   return '₹' + (v/1000).toFixed(0) + 'K';
                        return '₹' + v;
                      }} />
                      <Tooltip formatter={v => ['₹' + v.toLocaleString('en-IN')]} />
                      <Line type="monotone" dataKey="avg_balance" name="Opening balance"
                        stroke="#185fa5" fill="rgba(24,95,165,0.08)" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* MTF interest & holding value */}
                <div className="panel">
                  <div className="ptitle">MTF Interest & Holding Value</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={20} />
                      <YAxis yAxisId="left"  tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v.toLocaleString('en-IN')} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => {
                        if (v >= 100000) return '₹' + (v/100000).toFixed(1) + 'L';
                        if (v >= 1000)   return '₹' + (v/1000).toFixed(0) + 'K';
                        return '₹' + v;
                      }} />
                      <Tooltip formatter={(v, n) => n === 'MTF interest' ? ['₹' + Number(v).toFixed(2)] : [FMT(v), n]} />
                      <Legend wrapperStyle={{ fontSize: 10 }} iconSize={10} />
                      <Bar  yAxisId="left"  dataKey="mtf_interest"  name="MTF interest"  fill="#9FE1CB" />
                      <Line yAxisId="right" dataKey="holding_value" name="Holding value"
                        type="monotone" stroke="#854f0b" strokeWidth={1.5} dot={{ r: 3 }}
                        connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              </>
              ) : (
              <>
                {/* Turnover by segment — TABLE */}
                <div className="panel">
                  <div className="ptitle">Turnover by Segment (₹/day)</div>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: 'var(--tx3)', textAlign: 'right' }}>
                        <th style={{ textAlign: 'left' }}>Date</th>
                        <th>Eq Cash</th><th>Eq Futures</th><th>Eq Options</th><th>Comm Fut</th><th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((r, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--br)', textAlign: 'right' }}>
                          <td style={{ textAlign: 'left', padding: '6px 0' }}>{r.month}</td>
                          <td>{FMT(r.eq_cash)}</td>
                          <td>{FMT(r.eq_futures)}</td>
                          <td>{FMT(r.eq_options)}</td>
                          <td>{FMT(r.comm_fut)}</td>
                          <td style={{ fontWeight: 600 }}>{FMT((r.eq_cash || 0) + (r.eq_futures || 0) + (r.eq_options || 0) + (r.comm_fut || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="tc2">
                  {/* Opening balance — TABLE */}
                  <div className="panel">
                    <div className="ptitle">Month-End Balance (₹)</div>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ color: 'var(--tx3)' }}>
                          <th style={{ textAlign: 'left' }}>Date</th>
                          <th style={{ textAlign: 'right' }}>Month-End Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chartData.map((r, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--br)' }}>
                            <td style={{ padding: '6px 0' }}>{r.month}</td>
                            <td style={{ textAlign: 'right' }}>{FMT(r.avg_balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* MTF & holding — TABLE */}
                  <div className="panel">
                    <div className="ptitle">MTF Interest & Holding Value</div>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ color: 'var(--tx3)', textAlign: 'right' }}>
                          <th style={{ textAlign: 'left' }}>Date</th>
                          <th>MTF Interest</th><th>Holding Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chartData.map((r, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--br)', textAlign: 'right' }}>
                            <td style={{ textAlign: 'left', padding: '6px 0' }}>{r.month}</td>
                            <td>₹{Number(r.mtf_interest || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>{FMT(r.holding_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
              )}
            </>
          )}
          {client && (
  <button
    className="btn bp"
    style={{ marginTop: '8px' }}
    onClick={() => window.open(`/trade-insights?ucc=${ucc}`, '_blank')}
  >
    📊 View Trade Insights
  </button>
)}
        </>
      )}
    </div>
  );
};

export default Client360;