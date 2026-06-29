import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const InteractionLog = () => {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('all');
  const navigate = useNavigate();

  useEffect(() => { loadLogs(); }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/contact-logs');
      setLogs(res.data || []);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  const getTypeIcon = (type) => {
    const icons = { call: '📞', whatsapp: '💬', email: '📧', meeting: '🤝', other: '📝' };
    return icons[type] || '📝';
  };

  const getOutcomeBadge = (outcome) => {
    const map = {
      sent:         { bg: '#eaf3de', color: '#3b6d11' },
      interested:   { bg: '#e8f3ff', color: '#185fa5' },
      converted:    { bg: '#eaf3de', color: '#3b6d11' },
      not_interested: { bg: '#fcebeb', color: '#a32d2d' },
      initiated:    { bg: '#faeeda', color: '#854f0b' },
      callback:     { bg: '#f5f0ff', color: '#5b21b6' },
    };
    return map[outcome] || { bg: '#f5f5f5', color: '#888' };
  };

  const filtered = filter === 'all' ? logs : logs.filter(l => l.interaction_type === filter);

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
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>Interaction Log</h2>
      <p style={{ color: '#666', marginTop: '4px', marginBottom: '20px', fontSize: '13px' }}>
        Complete history of all client interactions
      </p>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {['all', 'call', 'whatsapp', 'email', 'meeting'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '5px 14px', borderRadius: '20px', border: '1px solid', cursor: 'pointer', fontSize: '12px', fontWeight: '500',
              borderColor: filter === f ? '#223872' : '#ddd',
              background: filter === f ? '#223872' : 'white',
              color: filter === f ? 'white' : '#555' }}>
            {f === 'all' ? 'All' : `${getTypeIcon(f)} ${f.charAt(0).toUpperCase() + f.slice(1)}`}
          </button>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', fontSize: '14px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
          <span>📋 All Interactions</span>
          <span style={{ background: '#f5f5f5', color: '#555', padding: '2px 10px', borderRadius: '10px', fontSize: '12px' }}>
            {filtered.length} records
          </span>
        </div>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Client</th>
                <th style={th}>Type</th>
                <th style={th}>Notes</th>
                <th style={th}>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: '#888' }}>No interactions found</td></tr>
              ) : (
                filtered.map((log, i) => {
                  const badge = getOutcomeBadge(log.outcome);
                  return (
                    <tr key={i}>
                      <td style={{ ...td, color: '#888', fontSize: '12px' }}>
                        {log.created_at ? new Date(new Date(log.created_at).getTime() + (5.5 * 60 * 60 * 1000)).toLocaleString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true }) : '—'}
                      </td>
                      <td style={{ ...td, fontWeight: '600' }}>{log.client_name || log.ucc}</td>
                      <td style={td}>
                        <span style={{ fontSize: '13px' }}>{getTypeIcon(log.interaction_type)}</span>
                        <span style={{ marginLeft: '6px', fontSize: '12px', color: '#555', textTransform: 'capitalize' }}>{log.interaction_type}</span>
                      </td>
                      <td style={{ ...td, color: '#555', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.notes || '—'}
                      </td>
                      <td style={td}>
                        {log.outcome && (
                          <span style={{ background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                            {log.outcome}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default InteractionLog;