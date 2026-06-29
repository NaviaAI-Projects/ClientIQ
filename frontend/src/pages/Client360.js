import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api';
import { BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const Client360 = () => {
  const location    = useLocation();
  const selectedUcc = location.state?.ucc;

  const [client, setClient]     = useState(null);
  const [clients, setClients]   = useState([]);
  const [ucc, setUcc]           = useState(selectedUcc || '');
  const [chartData, setChartData] = useState([]);
  const [nudges, setNudges]     = useState([]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => { loadClients(); }, []);
  useEffect(() => { if (ucc) { fetchClient(ucc); fetchNudges(ucc); } }, [ucc]);

  const loadClients = async () => {
    try {
      const res  = await api.get('/clients');
      const list = res.data.clients || [];
      setClients(list);
      if (!selectedUcc && list.length > 0) setUcc(list[0].ucc);
    } catch (err) { console.error(err); }
  };

  const fetchClient = async (clientUcc) => {
    try {
      const [clientRes, chartRes] = await Promise.all([
        api.get(`/clients/${clientUcc}`),
        api.get(`/clients/${clientUcc}/chart-data`)
      ]);
      setClient(clientRes.data);
      setChartData(chartRes.data || []);
    } catch (err) { console.error(err); }
  };

  const fetchNudges = async (clientUcc) => {
    try {
      const res = await api.get(`/nudge?ucc=${clientUcc}`);
      setNudges(res.data.nudges || []);
    } catch (e) {
      console.error('Nudge fetch error:', e.message);
    }
  };

  const fmtAmt = (v) => {
    if (!v) return '₹0';
    if (v >= 10000000) return '₹' + (v/10000000).toFixed(2) + 'Cr';
    if (v >= 100000)   return '₹' + (v/100000).toFixed(1) + 'L';
    if (v >= 1000)     return '₹' + (v/1000).toFixed(1) + 'K';
    return '₹' + parseFloat(v).toFixed(2);
  };

  if (!ucc && clients.length === 0) return <div>No clients available</div>;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#111' }}>Client 360</h2>
      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Complete client overview</p>

      {/* Client Selector */}
      <div style={{ marginTop: '16px', marginBottom: '16px' }}>
        <label style={{ fontSize: '11px', fontWeight: '600', color: '#666', textTransform: 'uppercase' }}>Select Client</label><br />
        <select value={ucc} onChange={e => setUcc(e.target.value)}
          style={{ padding: '8px 12px', width: '300px', border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px', fontSize: '13px' }}>
          {clients.map(c => (
            <option key={c.ucc} value={c.ucc}>{c.ucc} — {c.name}</option>
          ))}
        </select>
      </div>

      {/* AUTO NUDGE ALERTS — appears automatically when client is loaded */}
      {nudges.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          {nudges.map((n, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              padding: '12px 16px', borderRadius: '8px', marginBottom: '8px',
              background: n.type === 'warning' ? '#fff8e6' : n.type === 'success' ? '#eaf3de' : '#e8f3ff',
              border: '1px solid ' + (n.type === 'warning' ? '#d98a0e' : n.type === 'success' ? '#3b6d11' : '#b3d4f5'),
              borderLeft: '4px solid ' + (n.type === 'warning' ? '#d98a0e' : n.type === 'success' ? '#3b6d11' : '#185fa5')
            }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>
                {n.icon === 'WARN' ? '⚠️' : n.icon === 'OK' ? '✅' : '📊'}
              </span>
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: n.type === 'warning' ? '#854f0b' : n.type === 'success' ? '#3b6d11' : '#185fa5', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>
                  {n.title || (n.type === 'warning' ? 'Nudge Alert' : n.type === 'success' ? 'Healthy Profile' : 'Trading Insight')}
                </div>
                <div style={{ fontSize: '13px', color: '#333', lineHeight: '1.5' }}>{n.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Client Details */}
      {!client ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading client details...</div>
      ) : (
        <div style={{ background: 'white', borderRadius: '10px', padding: '20px', border: '0.5px solid rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '700' }}>{client.name}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <Info label="UCC"                value={client.ucc} />
            <Info label="Client Type"        value={client.client_type} />
            <Info label="Plan"               value={client.plan} />
            <Info label="Account Open Date"  value={formatDate(client.account_open_date)} />
            <Info label="Last Trade Date"    value={formatDate(client.last_trade_date)} />
            <Info label="Status"             value={client.status || (client.is_active ? 'Active' : 'Inactive')} />
            <Info label="Lead Score"         value={client.lead_score || 'N/A'} />
            <Info label="Churn Risk Score"   value={client.churn_risk_score || 'N/A'} />
            <Info label="Latest Balance"     value={fmtAmt(client.latest_balance)} />
            <Info label="Latest Holdings"    value={fmtAmt(client.latest_holdings)} />
            <Info label="Mapped RM"          value={client.rm_name || '-'} />
          </div>
        </div>
      )}

      {/* Charts */}
      {client && (
        <>
          <div style={{ fontSize: '10px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.7px', margin: '16px 0 8px' }}>
            Monthly trading averages — last 6 months
          </div>

          <div style={{ background: 'white', borderRadius: '10px', padding: '16px', marginBottom: '14px', border: '0.5px solid rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>Turnover by Segment (₹/month avg)</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => {
                  if (v >= 10000000) return '₹' + (v/10000000).toFixed(1) + 'Cr';
                  if (v >= 100000)   return '₹' + (v/100000).toFixed(1) + 'L';
                  if (v >= 1000)     return '₹' + (v/1000).toFixed(1) + 'K';
                  return '₹' + v;
                }} />
                <Tooltip formatter={v => {
                  if (v >= 10000000) return '₹' + (v/10000000).toFixed(2) + 'Cr';
                  if (v >= 100000)   return '₹' + (v/100000).toFixed(1) + 'L';
                  if (v >= 1000)     return '₹' + (v/1000).toFixed(1) + 'K';
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ background: 'white', borderRadius: '10px', padding: '16px', border: '0.5px solid rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>Opening Balance (₹ avg/month)</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'K'} />
                  <Tooltip formatter={v => ['₹' + v.toLocaleString('en-IN')]} />
                  <Line type="monotone" dataKey="balance" name="Opening balance" stroke="#185fa5" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: 'white', borderRadius: '10px', padding: '16px', border: '0.5px solid rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>MTF Interest & Holding Value</div>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left"  tick={{ fontSize: 10 }} tickFormatter={v => '₹' + v.toLocaleString('en-IN')} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => '₹' + (v/100000).toFixed(1) + 'L'} />
                  <Tooltip formatter={(v, n) => n === 'MTF interest' ? ['₹' + v] : ['₹' + (v/100000).toFixed(1) + 'L', n]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} iconSize={10} />
                  <Bar  yAxisId="left"  dataKey="mtf_interest"  name="MTF interest"  fill="#9FE1CB" />
                  <Line yAxisId="right" dataKey="holding_value" name="Holding value" type="monotone" stroke="#854f0b" strokeWidth={1.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const Info = ({ label, value }) => (
  <div>
    <div style={{ fontSize: '10px', fontWeight: '600', color: '#888', textTransform: 'uppercase', marginBottom: '3px' }}>{label}</div>
    <div style={{ fontSize: '13px', color: '#111' }}>{value || '—'}</div>
  </div>
);

const formatDate = (date) => date ? new Date(date).toLocaleDateString('en-IN') : '-';

export default Client360;