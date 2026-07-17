import React from 'react';
import api from '../api';
import { useState, useEffect } from 'react';

const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/audit-log?limit=100').then(r => setLogs(r.data||[])).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="ph"><h2>Audit log</h2><p>All file imports, data changes, and system events</p></div>
      <div className="panel">
        <div className="ptitle">📋 Audit log</div>
        <div className="tw"><table>
          <thead><tr><th>Date</th><th>Trade Date</th><th>File name</th><th>Type</th><th>Records</th><th>Status</th><th>User</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="7" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>Loading...</td></tr>
            : logs.length===0 ? <tr><td colSpan="7" style={{padding:'30px',textAlign:'center',color:'var(--tx3)'}}>No audit logs found</td></tr>
            : logs.map((l,i) => (
              <tr key={i}>
                <td>{l.created_at ? new Date(l.created_at).toLocaleString('en-IN') : '—'}</td>
                <td>{l.trade_date ? new Date(l.trade_date).toLocaleDateString('en-IN') : '—'}</td>
                <td>{l.file_name||'—'}</td>
                <td><span className="badge b-int">{l.file_type||l.type||'—'}</span></td>
                <td>{l.record_count||'—'}</td>
                <td><span className={`badge ${l.status==='success'?'b-act':'b-dor'}`}>{l.status||'—'}</span></td>
                <td>{l.uploaded_by||'—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};
export default AuditLog;
