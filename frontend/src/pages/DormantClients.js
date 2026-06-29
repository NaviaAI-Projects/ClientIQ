import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const DormantClients = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadClients(); }, []);

  const loadClients = async () => {
    setLoading(true);
    try {
      const res = await api.get('/clients/my/clients');
      // Dormant = no trade in last 30 days
      const dormant = (res.data || []).filter(c => {
        if (!c.last_trade_date) return true;
        const days = Math.floor((Date.now() - new Date(c.last_trade_date)) / 86400000);
        return days > 30;
      });
      setClients(dormant);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  const getDaysSince = (date) => {
    if (!date) return '—';
    const days = Math.floor((Date.now() - new Date(date)) / 86400000);
    return `${days} days ago`;
  };

  const th = { textAlign: 'left', padding: '10px 14px', fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', borderBottom: '1px solid #eee', background: '#fafafa' };
  const td = { padding: '12px 14px', fontSize: '13px', borderBottom: '1px solid #f5f5f5' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
        <button onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#223872', fontSize: '13px', fontWeight: '500' }}>
          ← Back
        </button>
      </div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>Dormant Clients</h2>
      <p style={{ color: '#666', marginTop: '4px', marginBottom: '20px', fontSize: '13px' }}>
        Clients with no trading activity in the last 30+ days
      </p>

      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', fontSize: '14px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
          <span>🌙 Dormant Clients</span>
          <span style={{ background: '#faeeda', color: '#854f0b', padding: '2px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>
            {clients.length} clients
          </span>
        </div>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={th}>UCC</th>
                <th style={th}>Client Name</th>
                <th style={th}>Type</th>
                <th style={th}>Last Trade</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: '#888' }}>No dormant clients</td></tr>
              ) : (
                clients.map(c => (
                  <tr key={c.ucc}>
                    <td style={{ ...td, color: '#555' }}>{c.ucc}</td>
                    <td style={{ ...td, fontWeight: '600' }}>{c.name}</td>
                    <td style={td}>{c.client_type}</td>
                    <td style={{ ...td, color: '#854f0b' }}>{getDaysSince(c.last_trade_date)}</td>
                    <td style={td}>
                      <button onClick={() => navigate('/client-360', { state: { ucc: c.ucc } })}
                        style={{ padding: '4px 10px', background: '#223872', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>
                        View 360
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DormantClients;