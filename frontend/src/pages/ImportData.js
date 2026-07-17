import React, { useState, useEffect } from 'react';
import api from '../api';

// File type definitions with full instructions
const FILE_CONFIGS = [
  {
    key:   'client_master',
    label: 'Client Master',
    icon:  '👤',
    badge: 'Periodic',
    badgeColor: 'var(--wc)',
    badgeBg:    'var(--wbg)',
    desc:  'All client records — UCC, name, type, plan, registration date, status.',
    instructions: [
      'Download from Symphony → Reports → Client Master',
      'File format: Excel (.xlsx)',
      'Required columns: UCC, Client Name, Client Type, Regd Date, Accross Exch Overall Status',
      'Upload whenever client list changes (new accounts, closures, type changes)',
      'Must be uploaded before Trade file to ensure UCCs are registered',
    ],
    warning: 'Upload this first before any other file.',
    importOrder: 1,
  },
  {
    key:   'trade',
    label: 'Trade File',
    icon:  '📊',
    badge: 'Daily',
    badgeColor: 'var(--ic)',
    badgeBg:    'var(--ibg)',
    desc:  'Daily turnover per client per segment — individual trades aggregated by UCC + segment + date.',
    instructions: [
      'Download from Symphony → Reports → Trade Summary → Individual Trades',
      'File format: Excel (.xlsx) — save from LibreOffice as .xlsx before uploading',
      'Required columns: Account Id, Exchg. Seg, Instrument Name, Traded Value, Trade Date',
      'Segments handled: EQ, BFO, MCX, CDS, BSE, NFO',
      'System aggregates turnover by UCC + segment + date automatically',
      'Updates last_trade_date for each client on import',
    ],
    importOrder: 2,
  },
  {
    key:   'brokerage',
    label: 'Brokerage File',
    icon:  '🧾',
    badge: 'Daily',
    badgeColor: 'var(--ic)',
    badgeBg:    'var(--ibg)',
    desc:  'Daily brokerage earned per client — merged with trade data.',
    instructions: [
      'Download from Symphony → Reports → Brokerage Report',
      'File format: Excel (.xlsx) — has 3 header rows, system skips them automatically',
      'Required columns: Party (UCC), Brokerage(G), Turnoverin Rs',
      'Upload on the same date as the Trade file',
      'Brokerage is stored in daily_trades alongside turnover data',
    ],
    importOrder: 3,
  },
  {
    key:   'ledger',
    label: 'Ledger File',
    icon:  '🏦',
    badge: 'Daily',
    badgeColor: 'var(--ic)',
    badgeBg:    'var(--ibg)',
    desc:  'Daily opening cash balance per client — used for float income calculation.',
    instructions: [
      'Download from Symphony → Reports → Ledger Report',
      'File format: Excel (.xlsx) — has 2 header rows, system skips them',
      'Required columns: UCC, Account Name, ClosingDebit, ClosingCredit',
      'Opening balance = ClosingCredit − ClosingDebit',
      'Stored in daily_ledger table with ledger date',
      'Used to compute total company float for Revenue & Float report',
    ],
    importOrder: 4,
  },
  {
    key:   'mtf',
    label: 'MTF File',
    icon:  '💰',
    badge: 'Monthly',
    badgeColor: 'var(--sc)',
    badgeBg:    'var(--sbg)',
    desc:  'Monthly MTF (Margin Trade Funding) balance and interest charged per client.',
    instructions: [
      'Download from Symphony → Reports → MTF Interest Report',
      'File format: Excel (.xlsx)',
      'Required columns: UCC, From Date, To Date, Interest Rate (%), Interest (Rs.), Net Charged',
      'Upload once per month after month-end closing',
      'Stored in mtf_monthly table keyed by UCC + month',
    ],
    importOrder: 5,
  },
];

const ImportData = () => {
  const [logs, setLogs]                   = useState([]);
  const [uploading, setUploading]         = useState({});
  const [results, setResults]             = useState({});
  const [expanded, setExpanded]           = useState({});
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [rescoring, setRescoring]         = useState(false);
  const [statusMsg, setStatusMsg]         = useState(null);
  const [logFilter, setLogFilter]         = useState('');
  const [showAllLogs, setShowAllLogs]     = useState(false);

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    try {
      const res = await api.get('/import/logs');
      setLogs(res.data || []);
    } catch (err) { console.error(err); }
  };

  const getLastImport = (fileType) =>
    logs.find(l => l.file_type === fileType && ['success','partial'].includes(l.status)) || null;

  const handleUpload = async (fileType, file) => {
    if (!file) return;
    setUploading(u => ({ ...u, [fileType]: true }));
    setResults(r => ({ ...r, [fileType]: null }));
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', fileType);
    try {
      const res = await api.post('/import/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResults(r => ({ ...r, [fileType]: { success: true, ...res.data } }));
      fetchLogs();
    } catch (err) {
      setResults(r => ({
        ...r,
        [fileType]: { success: false, message: err.response?.data?.message || 'Upload failed' }
      }));
    } finally {
      setUploading(u => ({ ...u, [fileType]: false }));
    }
  };

  const runRescore = async () => {
    setRescoring(true);
    setStatusMsg(null);
    try {
      const res = await api.post('/ai/rescore');
      setStatusMsg({ success: true, text: `AI rescoring complete — ${res.data.processed} clients scored` });
    } catch (err) {
      setStatusMsg({ success: false, text: err.response?.data?.message || 'AI rescoring failed' });
    } finally { setRescoring(false); }
  };

  const formatDateTime = (dt) => {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' · '
      + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatDateShort = (dt) => {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      + ' '
      + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const filteredLogs = logs
    .filter(l => !logFilter || l.file_type === logFilter)
    .slice(0, showAllLogs ? 200 : 20);

  const toggleInstructions = (key) =>
    setExpanded(e => ({ ...e, [key]: !e[key] }));

  return (
    <div>
      <div className="ph">
        <h2>Daily Data Import</h2>
        <p>Upload Symphony backoffice files in the correct order — Client Master first, then Trade, Brokerage, Ledger, Holdings, MTF</p>
      </div>

      {/* Import order notice */}
      <div className="alert a-i" style={{ marginBottom: '16px' }}>
        <div>
          <strong>Import order:</strong> Client Master → Trade File → Brokerage File → Ledger File → Holdings → MTF File.
          Always follow this order to ensure data integrity. Run AI Rescore after all files are uploaded.
        </div>
      </div>

      {statusMsg && (
        <div className={`alert ${statusMsg.success ? 'a-s' : 'a-d'}`} style={{ marginBottom: '16px' }}>
          {statusMsg.text}
        </div>
      )}

      {/* Upload cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '20px' }}>
        {FILE_CONFIGS.map(fc => {
          const last    = getLastImport(fc.key);
          const result  = results[fc.key];
          const busy    = uploading[fc.key];
          const isOpen  = expanded[fc.key];

          return (
            <div key={fc.key} style={{
              background:    'var(--bg)',
              borderRadius:  'var(--r3)',
              border:        `1px solid var(--br)`,
              boxShadow:     'var(--shadow-xs)',
              display:       'flex',
              flexDirection: 'column',
              overflow:      'hidden',
            }}>
              {/* Card header */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--br)', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <span style={{ fontSize: '20px', flexShrink: 0, marginTop: '1px' }}>{fc.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--tx)' }}>{fc.label}</span>
                    <span style={{
                      fontSize: '9px', fontWeight: '700', padding: '1px 6px',
                      borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.4px',
                      background: fc.badgeBg, color: fc.badgeColor
                    }}>{fc.badge}</span>
                    <span style={{
                      fontSize: '9px', fontWeight: '700', padding: '1px 6px',
                      borderRadius: '4px', background: 'var(--bg3)', color: 'var(--tx3)'
                    }}>Step {fc.importOrder}</span>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--tx2)', marginTop: '3px', lineHeight: '1.5' }}>{fc.desc}</p>
                </div>
              </div>

              {/* Instructions (expandable) */}
              <div style={{ padding: '0 16px' }}>
                <button
                  onClick={() => toggleInstructions(fc.key)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '11px', color: 'var(--ic)', fontWeight: '600',
                    padding: '8px 0', display: 'flex', alignItems: 'center', gap: '4px',
                    fontFamily: 'var(--font)'
                  }}
                >
                  {isOpen ? '▲' : '▼'} {isOpen ? 'Hide' : 'Show'} instructions
                </button>

                {isOpen && (
                  <div style={{
                    background:    'var(--bg2)',
                    borderRadius:  'var(--r)',
                    padding:       '10px 12px',
                    marginBottom:  '10px',
                    border:        '1px solid var(--br)',
                  }}>
                    {fc.warning && (
                      <div style={{ fontSize: '11px', color: 'var(--wc)', fontWeight: '600', marginBottom: '6px', display: 'flex', gap: '4px' }}>
                        ⚠️ {fc.warning}
                      </div>
                    )}
                    <ul style={{ margin: 0, paddingLeft: '14px' }}>
                      {fc.instructions.map((ins, i) => (
                        <li key={i} style={{ fontSize: '11px', color: 'var(--tx2)', marginBottom: '4px', lineHeight: '1.5' }}>
                          {ins}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Upload button */}
              <div style={{ padding: '0 16px 14px', marginTop: 'auto' }}>
                <label style={{
                  display:       'inline-flex',
                  alignItems:    'center',
                  gap:           '6px',
                  padding:       '8px 14px',
                  background:    busy ? 'var(--tx3)' : 'var(--brand)',
                  color:         'white',
                  borderRadius:  'var(--r)',
                  cursor:        busy ? 'not-allowed' : 'pointer',
                  fontSize:      '12px',
                  fontWeight:    '600',
                  fontFamily:    'var(--font)',
                  boxShadow:     busy ? 'none' : '0 2px 6px rgba(34,56,114,0.25)',
                  transition:    'background 120ms',
                  width:         '100%',
                  justifyContent: 'center',
                }}>
                  {busy ? '⏳ Uploading...' : '⬆ Choose File & Upload'}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.ods"
                    style={{ display: 'none' }}
                    disabled={busy}
                    onChange={e => {
                      if (e.target.files[0]) handleUpload(fc.key, e.target.files[0]);
                      e.target.value = '';
                    }}
                  />
                </label>

                {/* Upload result */}
                {result && (
                  <div className={`alert ${result.success ? 'a-s' : 'a-d'}`} style={{ marginTop: '8px', marginBottom: 0 }}>
                    {result.success
                      ? `✓ ${result.processed?.toLocaleString()} records imported${result.failed > 0 ? `, ${result.failed} failed` : ''}`
                      : `✗ ${result.message}`}
                  </div>
                )}

                {/* Last import status */}
                {!result && last && (
                  <div style={{
                    marginTop:    '8px',
                    padding:      '6px 10px',
                    borderRadius: 'var(--r)',
                    fontSize:     '11px',
                    background:   last.status === 'success' ? 'var(--sbg)' : 'var(--wbg)',
                    color:        last.status === 'success' ? 'var(--sc)' : 'var(--wc)',
                  }}>
                    {last.status === 'success' ? '✓' : '⚠'} Last: {formatDateShort(last.created_at)} · {Number(last.records_processed).toLocaleString()} records
                    {last.imported_by_name && <span style={{ opacity: 0.7 }}> · {last.imported_by_name}</span>}
                  </div>
                )}

                {!result && !last && (
                  <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: 'var(--r)', fontSize: '11px', background: 'var(--bg3)', color: 'var(--tx3)' }}>
                    Not yet imported
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Holdings + Bhavcopy — special dual upload card */}
        <div style={{
          background:    'var(--bg)',
          borderRadius:  'var(--r3)',
          border:        `1px solid var(--br)`,
          boxShadow:     'var(--shadow-xs)',
          overflow:      'hidden',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--br)', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <span style={{ fontSize: '20px', flexShrink: 0 }}>📁</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--tx)' }}>Holdings</span>
                <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase', background: 'var(--sbg)', color: 'var(--sc)' }}>Weekly</span>
                <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg3)', color: 'var(--tx3)' }}>Step 6</span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--tx2)', marginTop: '3px', lineHeight: '1.5' }}>
                Pipe-delimited file: UCC|ISIN|Quantity|...|CurrentPrice. System multiplies Qty × Price per ISIN and sums per UCC.
              </p>
            </div>
          </div>

          <div style={{ padding: '0 16px' }}>
            <button
              onClick={() => toggleInstructions('holdings')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--ic)', fontWeight: '600', padding: '8px 0', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font)' }}
            >
              {expanded['holdings'] ? '▲ Hide' : '▼ Show'} instructions
            </button>

            {expanded['holdings'] && (
              <div style={{ background: 'var(--bg2)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: '10px', border: '1px solid var(--br)' }}>
                <ul style={{ margin: 0, paddingLeft: '14px' }}>
                  {[
                    'Download from Symphony → Reports → DP Holdings (SYMPHONY_colISIN file)',
                    'File is pipe-delimited (|) — not a standard Excel file',
                    'Format: UCC|ISIN|Quantity|0|1|0|OldPrice||0|||CurrentMarketPrice',
                    'Column positions: [0]=UCC, [1]=ISIN, [2]=Quantity, [11]=Current Market Price',
                    'System computes: Quantity × CurrentMarketPrice per ISIN, sums all ISINs per UCC',
                    'Only total holding value per UCC is stored — individual ISIN details are not retained',
                    'Upload weekly or whenever DP holding values need to be refreshed',
                  ].map((ins, i) => (
                    <li key={i} style={{ fontSize: '11px', color: 'var(--tx2)', marginBottom: '4px', lineHeight: '1.5' }}>{ins}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', background: uploading['holdings'] ? 'var(--tx3)' : 'var(--brand)',
              color: 'white', borderRadius: 'var(--r)', cursor: uploading['holdings'] ? 'not-allowed' : 'pointer',
              fontSize: '12px', fontWeight: '600', fontFamily: 'var(--font)', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(34,56,114,0.25)',
            }}>
              {uploading['holdings'] ? '⏳ Uploading...' : '⬆ Upload Holdings File'}
              <input type="file" accept=".xlsx,.csv,.ods,.txt" style={{ display: 'none' }}
                onChange={e => { if (e.target.files[0]) handleUpload('holdings', e.target.files[0]); e.target.value = ''; }} />
            </label>

            {results['holdings'] && (
              <div className={`alert ${results['holdings'].success ? 'a-s' : 'a-d'}`} style={{ marginBottom: 0 }}>
                {results['holdings'].success
                  ? `✓ ${results['holdings'].processed?.toLocaleString()} records imported`
                  : `✗ ${results['holdings'].message}`}
              </div>
            )}
            {!results['holdings'] && getLastImport('holdings') && (
              <div style={{ padding: '6px 10px', borderRadius: 'var(--r)', fontSize: '11px', background: 'var(--sbg)', color: 'var(--sc)' }}>
                ✓ Last: {formatDateShort(getLastImport('holdings').created_at)} · {Number(getLastImport('holdings').records_processed).toLocaleString()} records
              </div>
            )}
            {!results['holdings'] && !getLastImport('holdings') && (
              <div style={{ padding: '6px 10px', borderRadius: 'var(--r)', fontSize: '11px', background: 'var(--bg3)', color: 'var(--tx3)' }}>Not yet imported</div>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="brow" style={{ marginBottom: '20px' }}>
        <button className="btn bp" onClick={runRescore} disabled={rescoring}>
          {rescoring ? '⏳ Rescoring...' : '🤖 Run AI Rescore after import'}
        </button>
        <button className="btn" onClick={fetchLogs}>
          🔄 Refresh Log
        </button>
      </div>

      {/* Import History / Audit Log */}
      <div className="panel">
        <div className="phd">
          <div className="ptitle">Import History & Audit Log</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              value={logFilter}
              onChange={e => setLogFilter(e.target.value)}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              <option value="">All file types</option>
              <option value="client_master">Client Master</option>
              <option value="trade">Trade File</option>
              <option value="brokerage">Brokerage File</option>
              <option value="ledger">Ledger File</option>
              <option value="holdings">Holdings</option>
              <option value="mtf">MTF File</option>
            </select>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--tx3)', fontSize: '13px' }}>
            No imports yet
          </div>
        ) : (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>File Type</th>
                    <th>File Name</th>
                    <th style={{ textAlign: 'right' }}>Records</th>
                    <th style={{ textAlign: 'right' }}>Failed</th>
                    <th>Status</th>
                    <th>Uploaded By</th>
                    <th>Date & Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--tx3)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                        {logs.indexOf(log) + 1}
                      </td>
                      <td>
                        <span style={{
                          fontWeight: '600', fontSize: '12px',
                          color: log.file_type === 'trade' ? 'var(--ic)'
                               : log.file_type === 'brokerage' ? 'var(--sc)'
                               : log.file_type === 'ledger' ? 'var(--wc)'
                               : log.file_type === 'client_master' ? 'var(--pc)'
                               : log.file_type === 'holdings' ? 'var(--sc)'
                               : 'var(--tx2)'
                        }}>
                          {log.file_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--tx2)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.file_name || '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                        {Number(log.records_processed || 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '12px', color: log.records_failed > 0 ? 'var(--dc)' : 'var(--tx3)' }}>
                        {log.records_failed > 0 ? log.records_failed : '—'}
                      </td>
                      <td>
                        <span className={`badge ${
                          log.status === 'success' ? 'b-act' :
                          log.status === 'partial' ? 'b-pend' : 'b-dor'
                        }`}>
                          {log.status === 'success' ? '✓ Success' : log.status === 'partial' ? '⚠ Partial' : '✗ Failed'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--tx2)' }}>
                        {log.imported_by_name || '—'}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--tx2)', whiteSpace: 'nowrap' }}>
                        {formatDateTime(log.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Show more */}
            {logs.filter(l => !logFilter || l.file_type === logFilter).length > 20 && (
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <button className="btn sm" onClick={() => setShowAllLogs(s => !s)}>
                  {showAllLogs ? 'Show less' : `Show all ${logs.length} records`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ImportData;