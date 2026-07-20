import React, { useState, useEffect } from 'react';
import api from '../api';

const catClass = (c) => (c === 'Upload' ? 'b-int' : c === 'RM Conversation' ? 'b-act' : 'b-pend');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const FILE_TYPES = [['all', 'All types'], ['client_master', 'Client Master'], ['trade', 'Trade'], ['brokerage', 'Brokerage'], ['ledger', 'Ledger'], ['holdings', 'Holdings'], ['mtf', 'MTF']];

const AuditLog = () => {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat]         = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    api.get('/audit-log?limit=300').then(r => setLogs(r.data || [])).catch(console.error).finally(() => setLoading(false));
  }, []);

  const counts = {
    all: logs.length,
    Upload: logs.filter(l => l.category === 'Upload').length,
    'RM Conversation': logs.filter(l => l.category === 'RM Conversation').length,
    'Admin Event': logs.filter(l => l.category === 'Admin Event').length,
  };
  const shown = logs.filter(l => {
    if (cat !== 'all' && l.category !== cat) return false;
    if ((cat === 'all' || cat === 'Upload') && typeFilter !== 'all' && !(l.category === 'Upload' && l.type === typeFilter)) return false;
    return true;
  });

  const fbtn = (key, label) => (
    <button type="button" onClick={() => setCat(key)}
      style={{ cursor: 'pointer', border: '1px solid var(--br2, #cbd5e1)',
        background: cat === key ? 'var(--pc, #185fa5)' : 'var(--card, #fff)',
        color: cat === key ? '#fff' : 'var(--tx2, #475569)',
        borderRadius: 6, fontSize: 12, fontWeight: 600, padding: '4px 12px' }}>
      {label} ({counts[key]})
    </button>
  );

  return (
    <div>
      <div className="ph"><h2>Audit log</h2><p>All file uploads, RM conversations, and admin events — newest first</p></div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        {fbtn('all', 'All')}{fbtn('Upload', 'Uploads')}{fbtn('RM Conversation', 'RM Conversations')}{fbtn('Admin Event', 'Admin Events')}
        {(cat === 'all' || cat === 'Upload') && (
          <>
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--tx3)', fontWeight: 600 }}>File type:</span>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--br2, #cbd5e1)', color: 'var(--tx2, #334155)' }}>
              {FILE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </>
        )}
      </div>

      <div className="panel">
        <div className="ptitle">📋 Activity log</div>
        <div className="tw"><table>
          <thead><tr><th>Date &amp; Time</th><th>Category</th><th>Type</th><th>Reference</th><th>Detail</th><th>Trade Date</th><th>Status</th><th>User</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="8" style={{ padding: '30px', textAlign: 'center', color: 'var(--tx3)' }}>Loading…</td></tr>
            : shown.length === 0 ? <tr><td colSpan="8" style={{ padding: '30px', textAlign: 'center', color: 'var(--tx3)' }}>No entries in this category</td></tr>
            : shown.map((l, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: 'nowrap' }}>{l.created_at ? new Date(l.created_at).toLocaleString('en-IN') : '—'}</td>
                <td><span className={`badge ${catClass(l.category)}`}>{l.category}</span></td>
                <td style={{ fontSize: 12 }}>{l.type || '—'}</td>
                <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reference || '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--tx2)', maxWidth: 260 }}>{l.detail || '—'}</td>
                <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(l.trade_date)}</td>
                <td><span className={`badge ${l.status === 'success' ? 'b-act' : l.status === 'partial' ? 'b-pend' : 'b-int'}`}>{l.status || '—'}</span></td>
                <td style={{ fontSize: 12 }}>{l.user || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

export default AuditLog;