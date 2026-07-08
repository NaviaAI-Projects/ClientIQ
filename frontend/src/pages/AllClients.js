import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const AllClients = () => {
  const [clients, setClients]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [typeFilter, setTypeFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter]   = useState('');
  const [rmFilter, setRmFilter]       = useState('');
  const [page, setPage]         = useState(1);
  const limit = 50;
  const navigate = useNavigate();

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, statusFilter, planFilter, rmFilter]);

  useEffect(() => {
    fetchClients();
  }, [page, search, typeFilter, statusFilter, planFilter, rmFilter]); // eslint-disable-line

  const fetchClients = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit,
        search,
        ...(typeFilter   && { type:   typeFilter }),
        ...(statusFilter && { status: statusFilter }),
        ...(planFilter   && { plan:   planFilter }),
        ...(rmFilter     && { rm:     rmFilter }),
      });
      const res = await api.get(`/clients?${params}`);
      setClients(res.data.clients || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('');
    setStatusFilter('');
    setPlanFilter('');
    setRmFilter('');
    setPage(1);
  };

  const hasFilters = search || typeFilter || statusFilter || planFilter || rmFilter;
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="ph">
        <h2>All Clients {total > 0 && <span style={{ fontSize: '14px', fontWeight: '400', color: 'var(--tx2)' }}>— {total.toLocaleString()} clients</span>}</h2>
        <p>Complete client universe</p>
      </div>

      {/* Filters */}
      <div className="panel" style={{ marginBottom: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
          <div className="fgrp">
            <label>Search</label>
            <input
              type="text"
              placeholder="UCC or client name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="fgrp">
            <label>Client Type</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">All</option>
              <option value="RI">RI</option>
              <option value="NRI">NRI</option>
              <option value="NRE">NRE</option>
              <option value="NRO">NRO</option>
              <option value="NRE-HV">NRE-HV</option>
              <option value="NRO-HV">NRO-HV</option>
              <option value="FN">FN</option>
            </select>
          </div>
          <div className="fgrp">
            <label>Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="mapped">Mapped</option>
              <option value="unmapped">Unmapped</option>
            </select>
          </div>
          <div className="fgrp">
            <label>Plan</label>
            <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}>
              <option value="">All</option>
              <option value="zero">Zero brokerage</option>
              <option value="paying">Paying brokerage</option>
            </select>
          </div>
          <div className="fgrp">
            <label>Mapped RM</label>
            <select value={rmFilter} onChange={e => setRmFilter(e.target.value)}>
              <option value="">All</option>
              <option value="unmapped">Unmapped</option>
            </select>
          </div>
          {hasFilters && (
            <button className="btn sm" onClick={clearFilters} style={{ marginBottom: '1px' }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="panel">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx3)' }}>Loading...</div>
        ) : clients.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx3)', fontSize: '13px' }}>
            No clients found {hasFilters && '— try clearing filters'}
          </div>
        ) : (
          <div className="tw"><table>
            <thead><tr>
              <th>UCC</th>
              <th>Name</th>
              <th>Type</th>
              <th>Plan</th>
              <th>Mapped RM</th>
              <th>Status</th>
              <th>Action</th>
            </tr></thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.ucc}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{c.ucc}</td>
                  <td style={{ fontWeight: '500' }}>{c.name}</td>
                  <td>
                    <span className={`badge ${c.client_type?.toLowerCase().includes('nri') || c.client_type?.toLowerCase().includes('nre') || c.client_type?.toLowerCase().includes('nro') ? 'b-nri' : c.client_type?.toLowerCase().includes('hv') ? 'b-hv' : 'b-ri'}`}>
                      {c.client_type}
                    </span>
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--tx2)' }}>{c.plan || '-'}</td>
                  <td style={{ fontSize: '12px' }}>{c.rm_name || <span style={{ color: 'var(--tx3)' }}>Unmapped</span>}</td>
                  <td>
                    <span className={`badge ${c.is_active ? 'b-act' : 'b-dor'}`}>
                      {c.status || (c.is_active ? 'Active' : 'Inactive')}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn sm"
                      onClick={() => navigate('/client-360', { state: { ucc: c.ucc } })}
                    >
                      View 360
                    </button>
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
              Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total.toLocaleString()} clients
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                Prev
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page - 2 + i;
                if (p < 1 || p > totalPages) return null;
                return (
                  <button key={p} className={`btn sm ${p === page ? 'bp' : ''}`} onClick={() => setPage(p)}>
                    {p}
                  </button>
                );
              })}
              <button className="btn sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AllClients;