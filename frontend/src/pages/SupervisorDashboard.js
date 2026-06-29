import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';
import api from '../api';

const N = { navy:'#223872', red:'#ED4D37', bg:'#f5f4f0', card:'#fff', border:'rgba(0,0,0,0.10)', tx:'#111', tx2:'#555', tx3:'#999', ic:'#185fa5', ibg:'#e6f1fb', sc:'#3b6d11', sbg:'#eaf3de', wc:'#854f0b', wbg:'#faeeda', dc:'#a32d2d', dbg:'#fcebeb' };

const fmt = (v) => {
  const n = parseFloat(v) || 0;
  if (n >= 10000000) return '₹' + (n/10000000).toFixed(2) + 'Cr';
  if (n >= 100000)   return '₹' + (n/100000).toFixed(1) + 'L';
  if (n >= 1000)     return '₹' + (n/1000).toFixed(1) + 'K';
  return '₹' + n.toFixed(0);
};

const StatCard = ({ title, value, subtitle, color, bg, icon, onClick }) => (
  <div onClick={onClick} style={{ background: N.card, borderRadius: '10px', padding: '18px 20px', border: `1px solid ${N.border}`, flex: 1, minWidth: '160px', cursor: onClick ? 'pointer' : 'default', borderTop: `3px solid ${color}` }}
    onMouseEnter={e => onClick && (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.10)')}
    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{ fontSize: '10px', fontWeight: '700', color: N.tx3, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>{title}</div>
        <div style={{ fontSize: '28px', fontWeight: '700', color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '11px', color: N.tx3, marginTop: '5px' }}>{subtitle}</div>
      </div>
      <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>{icon}</div>
    </div>
  </div>
);

const SupervisorDashboard = () => {
  const [stats, setStats]           = useState(null);
  const [topClients, setTopClients] = useState([]);
  const [rmPerf, setRmPerf]         = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [floatStats, setFloatStats] = useState(null);
  const [loading, setLoading]       = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, topRes, rmRes, trendRes, floatRes] = await Promise.all([
          api.get('/dashboard/company'),
          api.get('/reports/top-clients?limit=5'),
          api.get('/reports/rm-performance'),
          api.get('/reports/monthly-brokerage'),
          api.get('/dashboard/float-stats'),
        ]);
        setStats(statsRes.data);
        setTopClients(topRes.data || []);
        setRmPerf(rmRes.data || []);
        setMonthlyTrend(trendRes.data || []);
        setFloatStats(floatRes.data || null);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>⏳</div>
        <div style={{ color: N.tx3, fontSize: '14px' }}>Loading dashboard...</div>
      </div>
    </div>
  );

  const panel = { background: N.card, borderRadius: '10px', border: `1px solid ${N.border}`, overflow: 'hidden', marginBottom: '16px' };
  const panelHead = { padding: '14px 18px', borderBottom: `1px solid ${N.border}`, fontSize: '14px', fontWeight: '600', color: N.tx, display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
  const th = { padding: '10px 16px', fontSize: '10px', fontWeight: '700', color: N.tx3, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `1px solid ${N.border}`, background: N.bg, textAlign: 'left' };
  const td = { padding: '13px 16px', fontSize: '13px', borderBottom: `1px solid rgba(0,0,0,0.05)`, color: N.tx };

  return (
    <div style={{ fontFamily: "-apple-system,'Segoe UI',system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: N.tx, margin: 0 }}>Company Dashboard</h1>
        <p style={{ color: N.tx3, margin: '4px 0 0', fontSize: '13px' }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stat Cards Row 1 */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <StatCard title="Total Clients"    value={stats?.total_clients||0}   subtitle="All clients"        color={N.navy} bg={N.ibg} icon="👥" />
        <StatCard title="Active Clients"   value={stats?.active_clients||0}  subtitle="Trading actively"   color={N.sc}   bg={N.sbg} icon="✅" />
        <StatCard title="Mapped Clients"   value={stats?.mapped_clients||0}  subtitle="Assigned to RMs"   color={N.ic}   bg={N.ibg} icon="🔗" />
        <StatCard title="Unassigned Leads" value={stats?.unassigned_leads||0} subtitle="Waiting assignment" color={N.dc}  bg={N.dbg} icon="🎯" />
      </div>

      {/* Stat Cards Row 2 */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <StatCard title="Today's Brokerage" value={fmt(stats?.today_brokerage)} subtitle="Today's earnings"  color={N.wc}   bg={N.wbg} icon="💰" />
        <StatCard title="Today's Turnover"  value={fmt(stats?.today_turnover)}  subtitle="Total traded value" color={N.navy} bg={N.ibg} icon="📈" />
        <StatCard title="Total Float"       value={fmt(floatStats?.total_float)} subtitle="Client ledger balance" color={N.sc} bg={N.sbg} icon="🏦" />
        <StatCard title="Daily Float Income" value={fmt(floatStats?.daily_income)} subtitle="Est. @ 6.5% p.a." color={N.ic}  bg={N.ibg} icon="📊" />
      </div>

      {/* Two Column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* Top Clients */}
        <div style={panel}>
          <div style={panelHead}>
            <span>🏆 Top Clients by Turnover</span>
            <button onClick={() => navigate('/all-clients')} style={{ background: 'none', border: `1px solid ${N.border}`, color: N.ic, padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>View All</button>
          </div>
          <div style={{ padding: '8px' }}>
            {topClients.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: N.tx3, fontSize: '13px' }}>No data — import trade files first</div>
            ) : topClients.map((c, i) => (
              <div key={i} onClick={() => navigate('/client-360', { state: { ucc: c.ucc } })}
                style={{ padding: '10px 12px', borderRadius: '8px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}
                onMouseEnter={e => e.currentTarget.style.background = N.bg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: i === 0 ? N.red : N.navy, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>{i+1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', fontSize: '13px', color: N.tx }}>{c.name}</div>
                  <div style={{ fontSize: '11px', color: N.tx3 }}>{c.ucc} · {c.rm_name || 'Unassigned'}</div>
                </div>
                <div style={{ fontWeight: '700', color: N.sc, fontSize: '13px' }}>{fmt(c.total_turnover || c.total || c.total_brokerage)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RM Performance */}
        <div style={panel}>
          <div style={panelHead}>
            <span>👥 RM Performance (30 Days)</span>
            <button onClick={() => navigate('/rm-performance')} style={{ background: 'none', border: `1px solid ${N.border}`, color: N.ic, padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Details</button>
          </div>
          {rmPerf.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: N.tx3, fontSize: '13px' }}>No RM data yet</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['RM Name', 'Clients', 'Leads', 'Turnover'].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rmPerf.map((rm, i) => (
                  <tr key={i} onMouseEnter={e => e.currentTarget.style.background = N.bg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ ...td, fontWeight: '600' }}>{rm.name || rm.rm_name}</td>
                    <td style={td}>{rm.client_count || rm.clients || 0}</td>
                    <td style={td}>{rm.lead_count || rm.leads || 0}</td>
                    <td style={{ ...td, fontWeight: '600', color: N.sc }}>{fmt(rm.total_turnover || rm.total_brokerage || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Monthly Turnover Chart */}
      <div style={panel}>
        <div style={panelHead}>📊 Monthly Revenue Trend</div>
        <div style={{ padding: '16px' }}>
          {monthlyTrend.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: N.tx3, fontSize: '13px' }}>No trade data yet — import trade files first</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyTrend} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} />
                <Tooltip formatter={(v) => [fmt(v)]} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                <Bar dataKey="brokerage"        name="Brokerage"        stackId="s" fill={N.ibg.replace('e6','b5')} />
                <Bar dataKey="options_turnover" name="Options Turnover" stackId="s" fill={N.ic} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Float Summary */}
      <div style={panel}>
        <div style={panelHead}>🏦 Client Float Summary</div>
        <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' }}>
          {[
            { label: 'Total Client Float',         value: fmt(floatStats?.total_float),                          color: N.navy },
            { label: 'Est. Daily Float Income',    value: fmt(floatStats?.daily_income),                         color: N.sc   },
            { label: 'Est. Annual Float Income',   value: fmt((parseFloat(floatStats?.daily_income)||0) * 365),  color: N.ic   },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '16px', background: N.bg, borderRadius: '8px' }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: N.tx3, marginTop: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default SupervisorDashboard;