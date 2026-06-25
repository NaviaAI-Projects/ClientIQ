import React, { useEffect, useState } from 'react';
import api from '../api';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const FMT = v => {
  if (!v) return '₹0';
  if (v >= 10000000) return '₹' + (v/10000000).toFixed(1) + 'Cr';
  if (v >= 100000)   return '₹' + (v/100000).toFixed(1) + 'L';
  if (v >= 1000)     return '₹' + (v/1000).toFixed(0) + 'K';
  return '₹' + v;
};

const NewBusiness = () => {
  const [clientsData, setClientsData]   = useState([]);
  const [newAcctData, setNewAcctData]   = useState([]);
  const [ledgerData, setLedgerData]     = useState([]);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    api.get('/reports/new-business')
      .then(res => {
        setClientsData(res.data.clients     || []);
        setNewAcctData(res.data.new_accounts || []);
        setLedgerData(res.data.ledger       || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Merge new accounts + ledger by month for bottom charts
  const acctChartData = newAcctData.map(r => {
    const ledger = ledgerData.find(l => l.month === r.month) || {};
    return {
      month:       r.month,
      opened:      parseInt(r.opened) || 0,
      new_balance: parseFloat(ledger.new_client_balance) || 0
    };
  });

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>
  );

  const noData = clientsData.length === 0;

  return (
    <div>
      <div className="ph">
        <h2>New Business</h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
          New client acquisition, activation and revenue ramp
        </p>
      </div>

      {/* Summary cards */}
      <div className="cards" style={{ marginBottom: '16px' }}>
        <div className="card ci">
          <div className="clbl">New Accounts (12M)</div>
          <div className="cval">
            {newAcctData.reduce((s, r) => s + (parseInt(r.opened) || 0), 0).toLocaleString()}
          </div>
        </div>
        <div className="card cs">
          <div className="clbl">Months of Data</div>
          <div className="cval">{clientsData.length}</div>
        </div>
        <div className="card cw">
          <div className="clbl">Total New Client Float</div>
          <div className="cval">
            {FMT(ledgerData.reduce((s, r) => s + (parseFloat(r.new_client_balance) || 0), 0))}
          </div>
        </div>
      </div>

      <div className="tc2" style={{ marginBottom: '14px' }}>
        {/* Active Clients by Segment — stacked bar */}
        <div className="panel">
          <div className="ptitle">Active Clients by Segment (Monthly)</div>
          {noData ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
              No data — import trade files first
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={clientsData} margin={{ top: 8, right: 4, bottom: 8, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="eq_cash"     name="Eq Cash"      stackId="s" fill="#185fa5" />
                <Bar dataKey="eq_options"  name="Eq Options"   stackId="s" fill="#9FE1CB" />
                <Bar dataKey="comm_futures"name="Comm Futures"  stackId="s" fill="#FAC775" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* New Accounts Opened */}
        <div className="panel">
          <div className="ptitle">New Accounts Opened (Monthly)</div>
          {acctChartData.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
              No account open date data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={acctChartData} margin={{ top: 8, right: 4, bottom: 8, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="opened" name="New accounts opened" fill="#185fa5" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* New Client Ledger Balance */}
      <div className="panel">
        <div className="ptitle">New Client Opening Ledger Balance (₹)</div>
        {acctChartData.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
            No ledger data for new clients
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={acctChartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={FMT} />
              <Tooltip formatter={v => [FMT(v)]} />
              <Bar dataKey="new_balance" name="New client ledger balance (₹)" fill="#FAC775" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default NewBusiness;