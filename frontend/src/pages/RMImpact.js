import React, { useEffect, useState } from 'react';
import api from '../api';
import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const FMT = v => {
  if (!v) return '₹0';
  if (v >= 100000) return '₹' + (v/100000).toFixed(1) + 'L';
  if (v >= 1000)   return '₹' + (v/1000).toFixed(0) + 'K';
  return '₹' + v;
};

const RMImpact = () => {
  const [rmData, setRmData]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/rm-impact')
      .then(res => setRmData(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>
  );

  const noData = rmData.length === 0;

  return (
    <div>
      <div className="ph">
        <h2>RM Impact Analysis</h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
          RM contribution — revenue and options volume per mapped client base
        </p>
      </div>

      {/* Summary cards */}
      {!noData && (
        <div className="cards" style={{ marginBottom: '16px' }}>
          {rmData.map((rm, i) => (
            <div key={i} className="card ci">
              <div className="clbl">{rm.name}</div>
              <div className="cval">{FMT(rm.post_rev)}</div>
              <div className="csub">{rm.total_clients} clients · {rm.active_days} active days</div>
            </div>
          ))}
        </div>
      )}

      <div className="tc2">
        {/* ch-rmi-rev: Revenue per RM */}
        <div className="panel">
          <div className="ptitle">Total Revenue by RM (₹)</div>
          {noData ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
              No mapped clients with trade data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={rmData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={FMT} />
                <Tooltip formatter={v => [FMT(v)]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="pre_rev"  name="Pre-mapping revenue (₹)"  fill="#d3d1c7" />
                <Bar dataKey="post_rev" name="Post-mapping revenue (₹)" fill="#185fa5" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ch-rmi-vol: Options TO per RM */}
        <div className="panel">
          <div className="ptitle">Options Turnover by RM (₹Cr)</div>
          {noData ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
              No data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={rmData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v + ' ₹Cr'} />
                <Tooltip formatter={v => [v.toFixed(2) + ' ₹Cr']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="pre_vol"  name="Pre-mapping options TO (₹Cr)"  fill="#d3d1c7" />
                <Bar dataKey="post_vol" name="Post-mapping options TO (₹Cr)" fill="#9FE1CB" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* RM detail table */}
      {!noData && (
        <div className="panel" style={{ marginTop: '14px' }}>
          <div className="ptitle">RM Performance Summary</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E6EBF2' }}>
                {['RM Name', 'Mapped Clients', 'Total Revenue', 'Options TO (₹Cr)', 'Active Days'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '10px',
                    fontSize: '10px', fontWeight: '600',
                    color: '#888', textTransform: 'uppercase'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rmData.map((rm, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F1F4F9' }}>
                  <td style={{ padding: '10px', fontWeight: '500' }}>{rm.name}</td>
                  <td style={{ padding: '10px' }}>{rm.total_clients}</td>
                  <td style={{ padding: '10px', color: '#185fa5', fontWeight: '600' }}>
                    {FMT(rm.post_rev)}
                  </td>
                  <td style={{ padding: '10px' }}>{rm.post_vol.toFixed(2)} ₹Cr</td>
                  <td style={{ padding: '10px' }}>{rm.active_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RMImpact;