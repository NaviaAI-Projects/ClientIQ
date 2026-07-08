import React, { useEffect, useState } from 'react';
import api from '../api';

const ACTION_ICONS = {
  FILE_IMPORT:       '📁',
  MAPPING_APPROVED:  '✅',
  MAPPING_REJECTED:  '❌',
  UNMAP_APPROVED:    '🔓',
  AI_RESCORE:        '🤖',
  USER_CREATED:      '👤',
  USER_UPDATED:      '✏️',
  SETTINGS_UPDATED:  '⚙️',
  LOGIN:             '🔑',
};

const ACTION_COLORS = {
  FILE_IMPORT:       'b-int',
  MAPPING_APPROVED:  'b-act',
  MAPPING_REJECTED:  'b-dor',
  UNMAP_APPROVED:    'b-pend',
  AI_RESCORE:        'b-lead',
  USER_CREATED:      'b-nri',
  USER_UPDATED:      'b-ri',
  SETTINGS_UPDATED:  'b-hv',
};

const formatDateTime = dt => {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · '
    + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const AuditLog = () => {
  const [logs, setLogs]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const limit = 50;

  useEffect(() => {
    setPage(1);
  }, [moduleFilter, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [page, moduleFilter, actionFilter]); // eslint-disable-line

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page, limit,
        ...(moduleFilter && { module: moduleFilter }),
        ...(actionFilter && { action: actionFilter }),
      });
      const res = await api.get(`/admin-settings/audit-log?${params}`);
      setLogs(res.data.logs  || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const hasFilters = moduleFilter || actionFilter;

  return (
    <div>
      <div className="ph">
        <h2>Audit Log</h2>
        <p>Complete record of all actions performed in the system — imports, mappings, AI rescores, user changes, settings</p>
      </div>

      {/* Summary cards */}
      <div className="cards">
        <div className="card ci">
          <div className="clbl">Total Actions</div>
          <div className="cval">{total.toLocaleString()}</div>
          <div className="csub">All time</div>
        </div>
        <div className="card cs">
          <div className="clbl">Shown</div>
          <div className="cval">{logs.length}</div>
          <div className="csub">This page</div>
        </div>
      </div>

      {/* Filters */}
      <div className="panel" style={{ marginBottom: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
          <div className="fgrp">
            <label>Module</label>
            <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}>
              <option value="">All modules</option>
              <option value="import">File Import</option>
              <option value="leads">Leads & Mapping</option>
              <option value="ai">AI Rescore</option>
              <option value="users">Users</option>
              <option value="settings">Settings</option>
            </select>
          </div>
          <div className="fgrp">
            <label>Action</label>
            <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
              <option value="">All actions</option>
              <option value="FILE_IMPORT">File Import</option>
              <option value="MAPPING_APPROVED">Mapping Approved</option>
              <option value="MAPPING_REJECTED">Mapping Rejected</option>
              <option value="UNMAP_APPROVED">Unmap Approved</option>
              <option value="AI_RESCORE">AI Rescore</option>
              <option value="USER_CREATED">User Created</option>
              <option value="USER_UPDATED">User Updated</option>
              <option value="SETTINGS_UPDATED">Settings Updated</option>
            </select>
          </div>
          {hasFilters && (
            <button className="btn sm" style={{ marginBottom: '1px' }}
              onClick={() => { setModuleFilter(''); setActionFilter(''); }}>
              Clear
            </button>
          )}
        </div>
        {!loading && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--tx2)' }}>
            {total.toLocaleString()} records {hasFilters ? 'matching filters' : 'total'}
          </div>
        )}
      </div>

      {/* Log table */}
      <div className="panel">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx3)' }}>Loading...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>📋</div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--tx2)', marginBottom: '6px' }}>
              No audit records yet
            </div>
            <div style={{ fontSize: '12px', color: 'var(--tx3)' }}>
              Actions will appear here as users import files, approve mappings, run AI rescore, and update settings.
            </div>
          </div>
        ) : (
          <div className="tw"><table>
            <thead><tr>
              <th>#</th>
              <th>Action</th>
              <th>Module</th>
              <th>Details</th>
              <th>Client (UCC)</th>
              <th>Performed By</th>
              <th>Role</th>
              <th>IP Address</th>
              <th>Date & Time</th>
            </tr></thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={log.id}>
                  <td style={{ color: 'var(--tx3)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                    {(page - 1) * limit + i + 1}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{ACTION_ICONS[log.action] || '📋'}</span>
                      <span className={`badge ${ACTION_COLORS[log.action] || 'b-ri'}`}>
                        {log.action?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--tx2)', textTransform: 'capitalize' }}>
                    {log.module || '—'}
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--tx2)', maxWidth: '220px' }}>
                    {log.details || '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ic)' }}>
                    {log.target_ucc || '—'}
                  </td>
                  <td style={{ fontWeight: '500', fontSize: '13px' }}>
                    {log.performed_by_name || '—'}
                  </td>
                  <td>
                    <span className={`badge ${
                      log.performed_by_role === 'admin'       ? 'b-dor'  :
                      log.performed_by_role === 'supervisor'  ? 'b-nri'  :
                      log.performed_by_role === 'rm'          ? 'b-act'  : 'b-ri'
                    }`}>
                      {log.performed_by_role || '—'}
                    </span>
                  </td>
                  <td style={{ fontSize: '11px', color: 'var(--tx3)', fontFamily: 'var(--font-mono)' }}>
                    {log.ip_address || '—'}
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--tx2)', whiteSpace: 'nowrap' }}>
                    {formatDateTime(log.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px', fontSize: '13px' }}>
            <span style={{ color: 'var(--tx2)' }}>
              Showing {((page-1)*limit)+1}–{Math.min(page*limit, total)} of {total.toLocaleString()}
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn sm" disabled={page === 1} onClick={() => setPage(p => p-1)}>Prev</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = page <= 3 ? i+1 : page-2+i;
                if (p < 1 || p > totalPages) return null;
                return (
                  <button key={p} className={`btn sm ${p === page ? 'bp' : ''}`} onClick={() => setPage(p)}>{p}</button>
                );
              })}
              <button className="btn sm" disabled={page === totalPages} onClick={() => setPage(p => p+1)}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLog;