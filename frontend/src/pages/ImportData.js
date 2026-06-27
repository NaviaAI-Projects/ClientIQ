import React, { useState, useEffect } from 'react';
import api from '../api';

const FILE_TYPES = [
  {
    key: 'trade',
    label: 'Trade file (individual trades)',
    icon: '📊',
    desc: 'Columns: Account Id, Exchg. Seg, Instrument Name, Traded Value, Trade Date. Aggregated by UCC+segment+date. Updates last_trade_date. Save as .xlsx from LibreOffice before uploading.',
  },
  {
    key: 'brokerage',
    label: 'Brokerage file (separate)',
    icon: '🧾',
    desc: 'Columns: Party [UCC], Brokerage(G), Turnoverin Rs. Merged into daily_trades alongside turnover.',
  },
  {
    key: 'ledger',
    label: 'Ledger file (opening balance)',
    icon: '🏦',
    desc: 'Columns: UCC, Account Name, ClosingDebit, ClosingCredit. Opening balance = Credit − Debit. Stored in daily_ledger.',
  },
  {
    key: 'mtf',
    label: 'MTF file (monthly)',
    icon: '💰',
    desc: 'Columns: UCC, FromDate, ToDate, InterestRate (%), Interest(Rs.), NetCharged. Stored in mtf_monthly.',
  },
  {
    key: 'client_master',
    label: 'Client master (periodic)',
    icon: '👤',
    desc: 'Columns: UCC, Client Name, Gender, Regd Date, Overall Status, Last Trade. Type set to RI by default. Upload when client list changes.',
  },
];

const ImportData = () => {
  const [logs, setLogs]         = useState([]);
  const [uploading, setUploading] = useState({});
  const [results, setResults]   = useState({});
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [rescoring, setRescoring] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    try {
      const res = await api.get('/import/logs');
      setLogs(res.data || []);
    } catch (err) { console.error(err); }
  };

  const getLastImport = (fileType) => {
    return logs.find(l => l.file_type === fileType && (l.status === 'success' || l.status === 'partial')) || null;
  };

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

  const runPipeline = async () => {
    setPipelineRunning(true);
    setStatusMsg(null);
    try {
      const res = await api.post('/import/run-pipeline');
      setStatusMsg({ success: true, text: res.data.message });
    } catch (err) {
      setStatusMsg({ success: false, text: err.response?.data?.message || 'Pipeline failed' });
    } finally { setPipelineRunning(false); }
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

  const th = {
    textAlign: 'left', padding: '8px 14px',
    fontSize: '10px', fontWeight: '600', color: '#888',
    textTransform: 'uppercase', letterSpacing: '0.4px',
    borderBottom: '0.5px solid rgba(0,0,0,0.1)'
  };

  const UploadCard = ({ fileKey, label, icon, desc, extra }) => {
    const last   = getLastImport(fileKey);
    const result = results[fileKey];
    const busy   = uploading[fileKey];

    return (
      <div style={{ background: 'white', borderRadius: '10px', padding: '18px', border: '0.5px solid rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#111' }}>{icon} {label}</div>
        <div style={{ fontSize: '12px', color: '#888', lineHeight: '1.5', flex: 1 }}>{desc}</div>

        {extra || (
          <label style={{
            display: 'inline-block', padding: '7px 14px',
            background: busy ? '#94a3b8' : '#185fa5',
            color: 'white', borderRadius: '6px',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontSize: '12px', fontWeight: '500', alignSelf: 'flex-start'
          }}>
            {busy ? 'Uploading...' : 'Choose File & Upload'}
            <input type="file" accept=".xlsx,.xls,.csv,.ods" style={{ display: 'none' }} disabled={busy}
              onChange={e => { if (e.target.files[0]) handleUpload(fileKey, e.target.files[0]); e.target.value = ''; }} />
          </label>
        )}

        {/* Result after upload */}
        {result && (
          <div style={{ padding: '6px 10px', borderRadius: '5px', fontSize: '12px',
            background: result.success ? '#eaf3de' : '#fcebeb',
            color:      result.success ? '#3b6d11' : '#a32d2d' }}>
            {result.success
              ? `✓ ${result.processed} records imported${result.failed > 0 ? `, ${result.failed} failed` : ''}`
              : `✗ ${result.message}`}
          </div>
        )}

        {/* Last import status */}
        {!result && last && (
          <div style={{ padding: '6px 10px', borderRadius: '5px', fontSize: '12px',
            background: last.status === 'success' ? '#eaf3de' : '#faeeda',
            color:      last.status === 'success' ? '#3b6d11' : '#854f0b' }}>
            {last.status === 'success' ? '✓' : '⚠'} Last: {new Date(last.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {Number(last.records_processed).toLocaleString()} records
          </div>
        )}

        {!result && !last && (
          <div style={{ padding: '6px 10px', borderRadius: '5px', fontSize: '12px', background: '#f5f4f0', color: '#888' }}>
            Not yet imported
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>Daily Data Import</h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
          6 daily feed files. Trade file has individual trades — aggregated by UCC+segment on import.
          Brokerage is a separate file. Opening balance (not closing). Last trade date updated daily from trade file.
        </p>
      </div>

      <div style={{ background: '#e8f3ff', padding: '10px 14px', borderRadius: '8px', color: '#185fa5', fontSize: '12.5px', marginBottom: '20px' }}>
        <strong>Import logic:</strong> (1) Trade file: individual trades → aggregate turnover by UCC+segment+date → update last_trade_date per UCC.
        (2) Brokerage file: stored in daily_trades alongside turnover.
        (3) Holdings: compute total holding value per UCC from pipe-delimited file. ISIN detail discarded after compute.
      </div>

      {/* 3-column upload grid — matches prototype tc3 layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '20px' }}>

        {FILE_TYPES.map(ft => (
          <UploadCard key={ft.key} fileKey={ft.key} label={ft.label} icon={ft.icon} desc={ft.desc} />
        ))}

        {/* Holdings + Bhavcopy — special dual upload card */}
        <UploadCard
          fileKey="holdings"
          label="Holdings + Bhavcopy"
          icon="📁"
          desc="Upload Bhavcopy first (EOD prices), then Holdings file (UCC|ISIN|Qty pipe-delimited). System computes total holding value per UCC. Only total stored in holdings_summary."
          extra={
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#555', marginBottom: '4px' }}>1. Bhavcopy (EOD prices) — optional</div>
                <label style={{ display: 'inline-block', padding: '6px 12px', background: uploading['bhavcopy'] ? '#94a3b8' : '#f5f4f0', color: '#223872', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', border: '0.5px solid rgba(0,0,0,0.15)' }}>
                  {uploading['bhavcopy'] ? 'Uploading...' : 'Upload Bhavcopy'}
                  <input type="file" accept=".xlsx,.csv,.ods,.dat" style={{ display: 'none' }}
                    onChange={e => { if (e.target.files[0]) handleUpload('bhavcopy', e.target.files[0]); e.target.value = ''; }} />
                </label>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#555', marginBottom: '4px' }}>2. Holdings file</div>
                <label style={{ display: 'inline-block', padding: '6px 12px', background: uploading['holdings'] ? '#94a3b8' : '#185fa5', color: 'white', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>
                  {uploading['holdings'] ? 'Uploading...' : 'Upload Holdings'}
                  <input type="file" accept=".xlsx,.csv,.ods" style={{ display: 'none' }}
                    onChange={e => { if (e.target.files[0]) handleUpload('holdings', e.target.files[0]); e.target.value = ''; }} />
                </label>
              </div>
              {results['holdings'] && (
                <div style={{ padding: '6px 10px', borderRadius: '5px', fontSize: '12px',
                  background: results['holdings'].success ? '#eaf3de' : '#fcebeb',
                  color:      results['holdings'].success ? '#3b6d11' : '#a32d2d' }}>
                  {results['holdings'].success ? `✓ ${results['holdings'].processed} records` : `✗ ${results['holdings'].message}`}
                </div>
              )}
              {!results['holdings'] && getLastImport('holdings') && (
                <div style={{ padding: '6px 10px', borderRadius: '5px', fontSize: '12px', background: '#faeeda', color: '#854f0b' }}>
                  ⏱ Last: {new Date(getLastImport('holdings').created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. Upload Bhavcopy first.
                </div>
              )}
              {!results['holdings'] && !getLastImport('holdings') && (
                <div style={{ padding: '6px 10px', borderRadius: '5px', fontSize: '12px', background: '#f5f4f0', color: '#888' }}>
                  Not yet imported
                </div>
              )}
            </div>
          }
        />

      </div>

      {/* Action buttons — matches prototype brow */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={runPipeline} disabled={pipelineRunning}
          style={{ padding: '9px 18px', background: pipelineRunning ? '#94a3b8' : '#223872', color: 'white', border: 'none', borderRadius: '6px', cursor: pipelineRunning ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>
          {pipelineRunning ? '⏳ Running...' : '▶ Run import pipeline'}
        </button>
        <button onClick={runRescore} disabled={rescoring}
          style={{ padding: '9px 18px', background: 'white', color: '#223872', border: '1px solid #223872', borderRadius: '6px', cursor: rescoring ? 'not-allowed' : 'pointer', fontSize: '13px' }}>
          {rescoring ? '⏳ Rescoring...' : '🤖 Run AI rescoring after import'}
        </button>
        <button onClick={fetchLogs}
          style={{ padding: '9px 18px', background: 'white', color: '#555', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
          🕘 View import log
        </button>
      </div>

      {statusMsg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px',
          background: statusMsg.success ? '#eaf3de' : '#fcebeb',
          color:      statusMsg.success ? '#3b6d11' : '#a32d2d' }}>
          {statusMsg.text}
        </div>
      )}

      {/* Import History */}
      <div style={{ background: 'white', borderRadius: '10px', border: '0.5px solid rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '0.5px solid rgba(0,0,0,0.1)', fontSize: '13px', fontWeight: '600' }}>
          Import History
        </div>
        {logs.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No imports yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr>
                {['File Type', 'File Name', 'Records', 'Failed', 'Status', 'Imported By', 'Date'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={i} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: '500', textTransform: 'capitalize' }}>
                    {log.file_type?.replace(/_/g, ' ')}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#555', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.file_name}
                  </td>
                  <td style={{ padding: '10px 14px' }}>{Number(log.records_processed).toLocaleString()}</td>
                  <td style={{ padding: '10px 14px', color: log.records_failed > 0 ? '#a32d2d' : '#888' }}>
                    {log.records_failed}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                      background: log.status === 'success' ? '#eaf3de' : log.status === 'partial' ? '#faeeda' : '#fcebeb',
                      color:      log.status === 'success' ? '#3b6d11' : log.status === 'partial' ? '#854f0b' : '#a32d2d' }}>
                      {log.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#555' }}>{log.imported_by_name}</td>
                  <td style={{ padding: '10px 14px', color: '#888' }}>
                    {new Date(log.created_at).toLocaleDateString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ImportData;