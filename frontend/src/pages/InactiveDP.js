import React, { useEffect, useState } from 'react';
import api from '../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const InactiveDP = () => {
  const [bands, setBands]   = useState([]);
  const [loading, setLoading] = useState(true);

  // Prototype exact data for ch-inact-type
  const clientTypes = [
    { name: 'RI',           value: 1840, color: '#94A3B8' },
    { name: 'RI-HV',        value: 480,  color: '#F59E0B' },
    { name: 'NRE/NRO',      value: 340,  color: '#3B82F6' },
    { name: 'NRE-HV/NRO-HV',value: 140,  color: '#10B981' },
    { name: 'FN',           value: 40,   color: '#8B5CF6' },
  ];

  // Prototype exact data for ch-inact-holdval
  const holdValBrackets = [
    { bracket: '<₹50K',       clients: 480, fill: '#94A3B8' },
    { bracket: '₹50K–₹2L',   clients: 820, fill: '#F59E0B' },
    { bracket: '₹2L–₹5L',    clients: 640, fill: '#10B981' },
    { bracket: '₹5L–₹10L',   clients: 420, fill: '#3B82F6' },
    { bracket: '₹10L–₹25L',  clients: 280, fill: '#F59E0B' },
    { bracket: '>₹25L',       clients: 200, fill: '#EF4444' },
  ];

  useEffect(() => {
    api.get('/reports/inactive-bands')
      .then(res => setBands(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Map bands into stacked format: with_holdings + no_holdings
  const bandData = bands.map(b => ({
    band:        b.band,
    with_holdings: parseInt(b.with_holdings) || 0,
    no_holdings:   (parseInt(b.clients) || 0) - (parseInt(b.with_holdings) || 0),
  }));

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;

  return (
    <div>
      <div className="ph">
        <h2>Inactive & DP Holdings</h2>
        <p>Clients inactive in trading with DP securities still held — reactivation priority list</p>
      </div>

      {/* Summary cards */}
      <div className="cards">
        <div className="card cd">
          <div className="clbl">Total Inactive Clients</div>
          <div className="cval">{bands.reduce((s, b) => s + parseInt(b.clients || 0), 0).toLocaleString()}</div>
        </div>
        <div className="card cw">
          <div className="clbl">With DP Holdings</div>
          <div className="cval">{bands.reduce((s, b) => s + parseInt(b.with_holdings || 0), 0).toLocaleString()}</div>
          <div className="csub">Still hold securities with Navia</div>
        </div>
      </div>

      <div className="tc2">
        {/* ch-inact-band: Stacked bar — with holdings + no holdings by dormancy band */}
        <div className="panel">
          <div className="ptitle">Inactive Clients by Dormancy Band</div>
          {bandData.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No inactive clients found</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={bandData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="band" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} iconSize={10} />
                <Bar dataKey="with_holdings" name="With DP holdings"        stackId="s" fill="#3B82F6" />
                <Bar dataKey="no_holdings"   name="No holdings or balance"   stackId="s" fill="#94A3B8" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ch-inact-type: Doughnut — inactive by client type */}
        <div className="panel">
          <div className="ptitle">Inactive Clients by Type</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={clientTypes} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                dataKey="value" label={({ name }) => name}>
                {clientTypes.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ch-inact-holdval: Bar — inactive with DP by holding value bracket */}
      <div className="panel">
        <div className="ptitle">Inactive Clients with DP Holdings — by Holding Value Bracket</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={holdValBrackets} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="bracket" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={v => [v + ' clients']} />
            <Bar dataKey="clients" name="Inactive clients with DP holdings" radius={[3,3,0,0]}>
              {holdValBrackets.map((b, i) => <Cell key={i} fill={b.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ fontSize: '11px', color: 'var(--tx2)', marginTop: '8px' }}>
          Priority: ₹5L+ brackets (blue/amber/red) — highest reactivation revenue potential from DP holdings.
        </div>
      </div>

      {/* Summary table */}
      <div className="panel">
        <div className="ptitle">Dormancy Summary</div>
        <div className="tw"><table>
          <thead><tr>
            <th>Band</th><th style={{ textAlign: 'right' }}>Total Clients</th><th style={{ textAlign: 'right' }}>With DP Holdings</th>
          </tr></thead>
          <tbody>
            {bands.length === 0 ? (
              <tr><td colSpan="3" style={{ textAlign: 'center', color: '#888', padding: '20px' }}>No inactive clients</td></tr>
            ) : bands.map((b, i) => (
              <tr key={i}>
                <td style={{ fontWeight: '500' }}>{b.band}</td>
                <td style={{ textAlign: 'right' }}>{b.clients}</td>
                <td style={{ textAlign: 'right', color: b.with_holdings > 0 ? 'var(--dc)' : 'var(--tx3)', fontWeight: b.with_holdings > 0 ? '600' : '400' }}>{b.with_holdings}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

export default InactiveDP;