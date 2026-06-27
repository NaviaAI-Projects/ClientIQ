import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import api from '../api';

const FMT = (v) => {
  if (!v) return '₹0';
  if (v >= 10000000) return '₹' + (v / 100000).toFixed(0) + 'L';
  if (v >= 100000)   return '₹' + (v / 100000).toFixed(1) + 'L';
  if (v >= 1000)     return '₹' + (v / 1000).toFixed(0) + 'K';
  return '₹' + v;
};

const StatCard = ({ title, value, subtitle, color, icon }) => (
  <div style={{
    background: 'white', borderRadius: '12px', padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: `4px solid ${color}`,
    flex: 1, minWidth: '180px'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>{title}</div>
        <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1B3A6B' }}>{value}</div>
        {subtitle && <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{subtitle}</div>}
      </div>
      <div style={{ fontSize: '24px' }}>{icon}</div>
    </div>
  </div>
);

const fmt = (n) => {
  if (!n) return '0';
  if (n >= 10000000) return `₹${(n/10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n/100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n/1000).toFixed(1)}K`;
  return `₹${n}`;
};

const SupervisorDashboard = () => {
  const [stats, setStats] = useState(null);
  const [topClients, setTopClients] = useState([]);
  const [rmPerf, setRmPerf] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, topRes, rmRes] = await Promise.all([
          api.get('/dashboard/company'),
          api.get('/reports/top-clients?limit=5'),
          api.get('/reports/rm-performance'),
          api.get('/reports/monthly-brokerage').then(r => setMonthlyTrend(r.data)).catch(() => {})
        ]);
        setStats(statsRes.data);
        setTopClients(topRes.data);
        setRmPerf(rmRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <div style={{ fontSize: '16px', color: '#888' }}>Loading dashboard...</div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="ph">
  <h2>Company dashboard</h2>
  <p>All clients · All RMs · {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
</div>
<div className="cards">
  <div className="card ci">
    <div className="clbl">Total clients</div>
    <div className="cval">{stats?.total_clients?.toLocaleString() || 0}</div>
    <div className="csub">Mapped {stats?.mapped_clients || 0} · Unmapped {(stats?.total_clients - stats?.mapped_clients) || 0}</div>
  </div>
  <div className="card cs">
    <div className="clbl">Company MTD revenue</div>
    <div className="cval">{fmt(stats?.today_brokerage)}</div>
    <div className="csub">Today's brokerage</div>
  </div>
  <div className="card cw">
    <div className="clbl">Active leads in pipeline</div>
    <div className="cval">{stats?.unassigned_leads || 0}</div>
    <div className="csub">Unassigned leads</div>
  </div>
  <div className="card cd">
    <div className="clbl">Total float</div>
    <div className="cval">{fmt(stats?.total_float)}</div>
    <div className="csub">Client ledger balance</div>
  </div>
</div>

      {/* Two column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>

        {/* Top Clients */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1B3A6B', margin: 0 }}>Top 5 Clients by Brokerage</h2>
            <button onClick={() => navigate('/daily-mis')} style={{
              background: 'none', border: '1px solid #1B3A6B', color: '#1B3A6B',
              padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
            }}>View Reports</button>
          </div>
          {topClients.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>No data yet — import trade files first</div>
          ) : (
            topClients.map((client, i) => (
              <div key={i} onClick={() => navigate(`/clients/${client.ucc}`)} style={{
                padding: '12px', borderRadius: '8px', background: '#F8FAFF',
                marginBottom: '8px', cursor: 'pointer', border: '1px solid #E8F0FF',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', background: '#1B3A6B',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: 'bold', flexShrink: 0
                  }}>{i + 1}</div>
                  <div>
                    <div style={{ fontWeight: '600', color: '#333', fontSize: '14px' }}>{client.name}</div>
                    <div style={{ fontSize: '12px', color: '#888' }}>{client.ucc} • {client.rm_name || 'Unassigned'}</div>
                  </div>
                </div>
                <div style={{ fontWeight: 'bold', color: '#1E7E34', fontSize: '14px' }}>
                  {fmt(client.total_brokerage)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* RM Performance */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1B3A6B', margin: '0 0 16px' }}>RM Performance (30 Days)</h2>
          {rmPerf.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>No RM data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
  <BarChart data={monthlyTrend} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
    <YAxis tick={{ fontSize: 10 }} tickFormatter={FMT} />
    <Tooltip formatter={(v) => [FMT(v)]} />
    <Legend wrapperStyle={{ fontSize: 11 }} />
    <Bar dataKey="brokerage"        name="Brokerage"   stackId="s" fill="#b5d4f4" />
    <Bar dataKey="options_turnover" name="Options Clr" stackId="s" fill="#185fa5" radius={[4,4,0,0]} />
  </BarChart>
</ResponsiveContainer>
          )}
        </div>

      </div>

      {/* Float Info */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1B3A6B', margin: '0 0 16px' }}>Client Float Summary</h2>
        <div style={{ display: 'flex', gap: '32px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#888' }}>Total Client Float</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1B3A6B' }}>{fmt(stats?.total_float)}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#888' }}>Est. Annual Float Income (@ 6.5%)</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981' }}>
              {fmt((stats?.total_float || 0) * 0.065)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginTop: '24px' }}>
  <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#223872', margin: '0 0 16px' }}>Monthly Revenue Trend</h2>
  {monthlyTrend.length === 0 ? (
    <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>No trade data yet</div>
  ) : (
    <ResponsiveContainer width="100%" height={250}>
  <BarChart data={rmPerf.slice(0, 8)} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
    <YAxis tick={{ fontSize: 11 }} tickFormatter={FMT} />
    <Tooltip formatter={(v) => [FMT(v), 'Brokerage']} />
    <Bar dataKey="total_brokerage" name="Brokerage" fill="#b5d4f4" radius={[4,4,0,0]} />
  </BarChart>
</ResponsiveContainer>
  )}
</div>

    </div>
  );
};

export default SupervisorDashboard;