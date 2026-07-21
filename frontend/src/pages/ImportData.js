import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

const FILE_CONFIGS = {
  client_master: { label: 'Client Master',  icon: '👤', color: '#3B82F6', bg: '#E6F1FB', freq: 'Daily',    step: 1, sample: 'client_master_sample.csv', keywords: ['clientmaster','client_master','clientmst'] },
  trade:         { label: 'Trade File',      icon: '📊', color: '#3B6D11', bg: '#EAF3DE', freq: 'Daily',    step: 2, sample: 'trade_sample.csv',         keywords: ['trade','tradefile','tradein'] },
  brokerage:     { label: 'Brokerage File',  icon: '🧾', color: '#854F0B', bg: '#FAEEDA', freq: 'Daily',    step: 3, sample: 'brokerage_sample.csv',     keywords: ['brokerage','brokerge','brok'] },
  ledger:        { label: 'Ledger File',     icon: '🏦', color: '#3B82F6', bg: '#E6F1FB', freq: 'Daily',    step: 4, sample: 'ledger_sample.csv',        keywords: ['ledger','ledgr','basecapital','base_capital','rmslimit','rms_limit','rms','limit','capital'] },
  holdings:      { label: 'Holdings',        icon: '📁', color: '#08905C', bg: '#E6FAF3', freq: 'Daily',    step: 5, sample: 'holdings_sample.csv',      keywords: ['holding','dp','dpholding'] },
  mtf:           { label: 'MTF File',        icon: '💰', color: '#854F0B', bg: '#FAEEDA', freq: 'Weekly',   step: 6, sample: 'mtf_sample.csv',           keywords: ['mtf','margintrade','mtfinterest'] },
};

function detectType(filename) {
  const n = (filename || '').toLowerCase().replace(/[\s_\-.]+/g, '');
  for (const [type, cfg] of Object.entries(FILE_CONFIGS)) {
    if (cfg.keywords.some(k => n.includes(k))) return type;
  }
  return null;
}

const FMT_DT = dt => {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const ImportData = () => {
  const [logs, setLogs]             = useState([]);
  const [uploading, setUploading]   = useState({});
  const [results, setResults]       = useState({});
  const [queued, setQueued]         = useState([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [rescoring, setRescoring]   = useState(false);
  const [statusMsg, setStatusMsg]   = useState(null);
  const [rescoreMsg, setRescoreMsg] = useState(null);
  const [conflict, setConflict]     = useState(null);
  const [logFilter, setLogFilter]   = useState('');
  const [showAll, setShowAll]       = useState(false);
  const [dragOver, setDragOver]     = useState(false);

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    try {
      const res = await api.get('/import/logs');
      setLogs(res.data || []);
    } catch (err) { console.error(err); }
  };

  const getLastImport = type =>
    logs.find(l => l.file_type === type && ['success','partial'].includes(l.status)) || null;

  const uploadFile = async (file, fileType, overwrite = false) => {
    const fd = new FormData();
    fd.append('file', file);
    if (fileType) fd.append('file_type', fileType);
    if (overwrite) fd.append('overwrite', 'true');
    const res = await api.post('/import/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data;
  };

  // Single-card upload. overwrite=true is used after the user confirms a duplicate replace.
  const doUpload = async (fileType, file, overwrite = false) => {
    setUploading(u => ({ ...u, [fileType]: true }));
    setResults(r => ({ ...r, [fileType]: null }));
    try {
      const data = await uploadFile(file, fileType, overwrite);
      setResults(r => ({ ...r, [fileType]: { success: true, ...data } }));
      fetchLogs();
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.conflict) {
        const d = err.response.data;
        setConflict({ mode: 'single', fileType, file, message: d.message, importedAt: d.existing?.imported_at, records: d.existing?.records });
      } else {
        setResults(r => ({ ...r, [fileType]: { success: false, message: err.response?.data?.message || 'Upload failed' } }));
      }
    } finally {
      setUploading(u => ({ ...u, [fileType]: false }));
    }
  };
  const handleCardUpload = (fileType, file) => { if (file) doUpload(fileType, file, false); };

  const addToQueue = (files) => {
    const newItems = [], unrecognised = [];
    Array.from(files).forEach(file => {
      const type = detectType(file.name);
      if (type) newItems.push({ id: Date.now() + Math.random(), file, type, status: 'pending', result: null });
      else unrecognised.push(file.name);
    });
    if (unrecognised.length > 0) {
      setStatusMsg({ success: false, text: `Could not detect type for: ${unrecognised.join(', ')}. Rename to include: clientmaster, trade, brokerage, ledger, holdings, or mtf.` });
      setTimeout(() => setStatusMsg(null), 7000);
    }
    newItems.sort((a, b) => FILE_CONFIGS[a.type].step - FILE_CONFIGS[b.type].step);
    setQueued(q => [...q, ...newItems]);
  };

  const runBulkUpload = async (overwriteAll = false) => {
    if (queued.length === 0) return;
    setBulkRunning(true);
    const ordered = [...queued].sort((a, b) => FILE_CONFIGS[a.type].step - FILE_CONFIGS[b.type].step);
    const conflicts = [];
    let errors = 0;
    for (const item of ordered) {
      setQueued(q => q.map(x => x.id === item.id ? { ...x, status: 'uploading' } : x));
      try {
        const data = await uploadFile(item.file, item.type, overwriteAll);
        setQueued(q => q.map(x => x.id === item.id ? { ...x, status: 'done', result: { success: true, ...data } } : x));
      } catch (err) {
        if (err.response?.status === 409 && err.response?.data?.conflict) {
          conflicts.push({ item, existing: err.response.data.existing });
          setQueued(q => q.map(x => x.id === item.id ? { ...x, status: 'conflict', result: { success: false, message: 'Already uploaded' } } : x));
        } else {
          errors++;
          setQueued(q => q.map(x => x.id === item.id ? { ...x, status: 'error', result: { success: false, message: err.response?.data?.message || 'Failed' } } : x));
        }
      }
    }
    setBulkRunning(false);
    fetchLogs();
    // Duplicates found → ask before overwriting (unless the user already chose Replace all).
    if (conflicts.length > 0 && !overwriteAll) {
      setConflict({
        mode: 'bulk',
        files: conflicts.map(c => ({
          label:      FILE_CONFIGS[c.item.type]?.label || c.item.type,
          importedAt: c.existing?.imported_at,
          records:    c.existing?.records
        }))
      });
      return;
    }
    const done = ordered.length;
    setStatusMsg({ success: errors === 0, text: `Bulk import complete — ${done} files processed${errors > 0 ? `, ${errors} failed` : ''}` });
    setTimeout(() => setStatusMsg(null), 5000);
  };

  // Duplicate-conflict resolvers
  const doReplaceSingle = () => {
    if (!conflict || conflict.mode !== 'single') return;
    const { fileType, file } = conflict;
    setConflict(null);
    doUpload(fileType, file, true);
  };
  const doReplaceBulk = () => { setConflict(null); runBulkUpload(true); };

  const runRescore = async () => {
    setRescoring(true);
    try {
      const res = await api.post('/ai/rescore');
      setRescoreMsg({ success: true, title: 'AI rescoring complete', text: `${res.data.processed} clients scored successfully.` });
    } catch (err) {
      setRescoreMsg({ success: false, title: 'Rescoring failed', text: err.response?.data?.message || 'Rescoring failed' });
    } finally {
      setRescoring(false);
    }
  };

  const fmtImportDate = d => {
    if (!d) return 'earlier';
    const dt = new Date(d);
    return isNaN(dt) ? 'earlier'
      : dt.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const pendingCount   = queued.filter(q => q.status === 'pending').length;
  const completedCount = queued.filter(q => q.status === 'done').length;
  const errorCount     = queued.filter(q => q.status === 'error').length;
  const filteredLogs   = logs.filter(l => !logFilter || l.file_type === logFilter).slice(0, showAll ? 200 : 20);

  return (
    <div>
      <div className="ph">
        <h2>Daily Data Import</h2>
        <p>Upload all 6 Symphony files together or one by one — type is auto-detected from the filename</p>
      </div>

      {/* Upload status — top banner (unchanged from your original) */}
      {statusMsg && (
        <div className={`alert ${statusMsg.success ? 'a-s' : 'a-d'}`} style={{ marginBottom: '14px' }}>
          {statusMsg.text}
        </div>
      )}

      {/* AI Rescore confirmation — pop-up (only here, as requested) */}
      {rescoreMsg && (
        <div
          onClick={() => setRescoreMsg(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,38,0.45)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '14px', padding: '30px 34px',
                     maxWidth: '440px', width: '90%', textAlign: 'center',
                     boxShadow: '0 16px 48px rgba(10,18,38,0.28)' }}>
            <div style={{ fontSize: '44px', lineHeight: 1, marginBottom: '12px' }}>
              {rescoreMsg.success ? '✅' : '⚠️'}
            </div>
            <div style={{ fontSize: '17px', fontWeight: 800, marginBottom: '8px',
                          color: rescoreMsg.success ? '#2E7D32' : '#C8313B' }}>
              {rescoreMsg.title || (rescoreMsg.success ? 'Success' : 'Attention')}
            </div>
            <div style={{ fontSize: '13.5px', color: '#42506A', lineHeight: 1.6, marginBottom: '22px' }}>
              {rescoreMsg.text}
            </div>
            <button className="btn bp" style={{ minWidth: '130px' }} onClick={() => setRescoreMsg(null)}>
              OK
            </button>
          </div>
        </div>
      )}

      {/* Duplicate-file warning — pop-up with Replace / Cancel */}
      {conflict && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,38,0.45)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100 }}>
          <div
            style={{ background: '#fff', borderRadius: '14px', padding: '28px 32px',
                     maxWidth: '460px', width: '90%', textAlign: 'center',
                     boxShadow: '0 16px 48px rgba(10,18,38,0.28)' }}>
            <div style={{ fontSize: '42px', lineHeight: 1, marginBottom: '12px' }}>⚠️</div>
            <div style={{ fontSize: '17px', fontWeight: 800, marginBottom: '8px', color: '#854F0B' }}>
              Already uploaded
            </div>
            {conflict.mode === 'bulk' ? (
              <div style={{ fontSize: '13.5px', color: '#42506A', lineHeight: 1.6, marginBottom: '22px', textAlign: 'left' }}>
                <div style={{ marginBottom: '8px' }}>These files were already uploaded. Replace the existing data?</div>
                {conflict.files.map((f, i) => (
                  <div key={i} style={{ padding: '6px 0', borderBottom: '0.5px solid #E6EBF2' }}>
                    <strong>{f.label}</strong> — uploaded {fmtImportDate(f.importedAt)}
                    {f.records != null ? ` · ${f.records} records` : ''}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '13.5px', color: '#42506A', lineHeight: 1.6, marginBottom: '22px' }}>
                {conflict.message}
                {conflict.importedAt && (
                  <div style={{ marginTop: '10px', fontWeight: 700, color: '#1B3F7A' }}>
                    Already uploaded on {fmtImportDate(conflict.importedAt)}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button className="btn" style={{ minWidth: '120px' }} onClick={() => setConflict(null)}>
                Cancel
              </button>
              <button
                className="btn bp"
                style={{ minWidth: '120px' }}
                onClick={conflict.mode === 'bulk' ? doReplaceBulk : doReplaceSingle}>
                {conflict.mode === 'bulk' ? 'Replace all' : 'Replace'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BULK UPLOAD ────────────────────────────────────── */}
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="ptitle">Import All Files</div>
        <p style={{ fontSize: '12px', color: 'var(--tx2)', marginBottom: '14px', lineHeight: 1.6 }}>
          Select all 6 files at once. The system reads the filename and automatically assigns each file to the correct parser.
          Files are then uploaded in the correct order: <strong>Client Master → Trade → Brokerage → Ledger → Holdings → MTF</strong>.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); addToQueue(e.dataTransfer.files); }}
          onClick={() => document.getElementById('bulk-file-input').click()}
          style={{
            border:       `2px dashed ${dragOver ? 'var(--ic)' : 'var(--br)'}`,
            borderRadius: 'var(--r2)',
            background:   dragOver ? 'var(--ibg)' : 'var(--bg2)',
            padding:      '32px 24px',
            textAlign:    'center',
            cursor:       'pointer',
            transition:   'all 0.15s',
            marginBottom: '14px',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>📂</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--tx)', marginBottom: '4px' }}>
            {dragOver ? 'Drop files here' : 'Click to select files or drag & drop'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--tx3)', marginBottom: '10px' }}>
            Select all 6 files at once — .xlsx, .csv accepted
          </div>
          <input
            id="bulk-file-input"
            type="file"
            multiple
            accept=".xlsx,.xls,.csv,.ods,.txt"
            style={{ display: 'none' }}
            onChange={e => { addToQueue(e.target.files); e.target.value = ''; }}
          />
        </div>

        {/* Queue */}
        {queued.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', color: 'var(--tx2)', fontWeight: '500' }}>
                {queued.length} file{queued.length > 1 ? 's' : ''} ready
                {completedCount > 0 && <span style={{ color: 'var(--sc)', marginLeft: '8px' }}>· {completedCount} uploaded</span>}
                {errorCount > 0    && <span style={{ color: 'var(--dc)', marginLeft: '8px' }}>· {errorCount} failed</span>}
              </div>
              <button className="btn sm" onClick={() => setQueued([])} disabled={bulkRunning}>Clear all</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
              {queued.map(item => {
                const cfg = FILE_CONFIGS[item.type];
                const borderColor = item.status === 'done' ? cfg.color : item.status === 'error' ? '#A32D2D' : item.status === 'uploading' ? 'var(--ic)' : 'var(--br)';
                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 14px', borderRadius: 'var(--r)',
                    background: item.status === 'done' ? cfg.bg : item.status === 'error' ? '#FCEBEB' : item.status === 'uploading' ? 'var(--ibg)' : 'var(--bg2)',
                    border: `1px solid ${borderColor}`,
                    borderLeft: `4px solid ${borderColor}`,
                  }}>
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>{cfg.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: cfg.color }}>{cfg.label}</span>
                        <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg3)', color: 'var(--tx3)' }}>Step {cfg.step}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--tx3)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.file.name}
                      </div>
                      {item.result && (
                        <div style={{ fontSize: '11px', marginTop: '3px', color: item.result.success ? 'var(--sc)' : 'var(--dc)' }}>
                          {item.result.success
                            ? `✓ ${item.result.processed?.toLocaleString()} records${item.result.failed > 0 ? `, ${item.result.failed} failed` : ''}`
                            : `✗ ${item.result.message}`}
                        </div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {item.status === 'uploading' && <span style={{ fontSize: '11px', color: 'var(--ic)', fontWeight: '600' }}>Uploading...</span>}
                      {item.status === 'done'      && <span style={{ color: 'var(--sc)', fontSize: '18px' }}>✓</span>}
                      {item.status === 'error'     && <span style={{ color: 'var(--dc)', fontSize: '18px' }}>✗</span>}
                      {item.status === 'pending'   && !bulkRunning && (
                        <button className="btn sm" onClick={() => setQueued(q => q.filter(x => x.id !== item.id))} style={{ fontSize: '11px' }}>✕</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              className="btn bp"
              onClick={() => runBulkUpload()}
              disabled={bulkRunning || pendingCount === 0}
              style={{ width: '100%', padding: '11px', fontSize: '14px' }}
            >
              {bulkRunning
                ? `⏳ Uploading ${queued.find(q => q.status === 'uploading')?.file?.name || '...'}...`
                : `⬆ Upload ${pendingCount} File${pendingCount !== 1 ? 's' : ''} in Correct Order`}
            </button>
          </>
        )}
      </div>

      {/* ── INDIVIDUAL UPLOAD CARDS ── */}
      <div className="slbl" style={{ marginBottom: '10px' }}>Or upload individually</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        {Object.entries(FILE_CONFIGS).map(([key, cfg]) => {
          const last   = getLastImport(key);
          const result = results[key];
          const busy   = uploading[key];
          return (
            <div key={key} style={{
              background: 'var(--bg)', border: '1px solid var(--br)',
              borderTop: `3px solid ${cfg.color}`, borderRadius: 'var(--r2)',
              padding: '14px 16px', boxShadow: 'var(--shadow-xs)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '20px', marginTop: '1px' }}>{cfg.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--tx)', marginBottom: '3px' }}>{cfg.label}</div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', background: cfg.bg, color: cfg.color }}>{cfg.freq}</span>
                    <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg3)', color: 'var(--tx3)' }}>Step {cfg.step}</span>
                  </div>
                </div>
              </div>

              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '8px 12px',
                background: busy ? 'var(--tx3)' : cfg.color,
                color: 'white', borderRadius: 'var(--r)',
                cursor: busy ? 'not-allowed' : 'pointer',
                fontSize: '12px', fontWeight: '600', fontFamily: 'var(--font)',
                width: '100%', boxShadow: busy ? 'none' : `0 2px 6px ${cfg.color}40`,
              }}>
                {busy ? '⏳ Uploading...' : '⬆ Upload File'}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.ods,.txt"
                  style={{ display: 'none' }}
                  disabled={busy}
                  onChange={e => { if (e.target.files[0]) handleCardUpload(key, e.target.files[0]); e.target.value = ''; }}
                />
              </label>

              {cfg.sample && (
                <a href={`/samples/${cfg.sample}`} download
                   style={{ display: 'block', textAlign: 'center', marginTop: '6px',
                            fontSize: '11px', fontWeight: '600', color: cfg.color, textDecoration: 'none' }}>
                  ⬇ Download sample format
                </a>
              )}

              {result && (
                <div className={`alert ${result.success ? 'a-s' : 'a-d'}`} style={{ marginTop: '8px', marginBottom: 0, fontSize: '11px' }}>
                  {result.success
                    ? `✓ ${result.processed?.toLocaleString()} records${result.failed > 0 ? `, ${result.failed} failed` : ''}`
                    : `✗ ${result.message}`}
                </div>
              )}
              {/* Last import status — always shown below upload button */}
              {(() => {
                const lastAll = logs.find(l => l.file_type === key);
                if (!lastAll && !result) return (
                  <div style={{ marginTop: '8px', padding: '7px 10px', borderRadius: 'var(--r)', fontSize: '11px', background: 'var(--bg3)', color: 'var(--tx3)', border: '1px solid var(--br)' }}>
                    Not yet imported
                  </div>
                );
                const log = result
                  ? { status: result.success ? 'success' : 'failed', records_processed: result.processed, records_failed: result.failed, file_name: '', created_at: new Date(), imported_by_name: null, message: result.message }
                  : lastAll;
                if (!log) return null;
                const isSuccess = log.status === 'success';
                const isPartial = log.status === 'partial';
                const isFailed  = log.status === 'failed' || log.status === 'error';
                return (
                  <div style={{
                    marginTop:   '8px',
                    padding:     '8px 10px',
                    borderRadius: 'var(--r)',
                    fontSize:    '11px',
                    background:  isSuccess ? '#EAF3DE' : isPartial ? '#FFF3DC' : '#FCEBEB',
                    border:      `1px solid ${isSuccess ? '#C2ECDC' : isPartial ? '#FBE4BF' : '#FAD4D6'}`,
                    borderLeft:  `3px solid ${isSuccess ? '#3B6D11' : isPartial ? '#854F0B' : '#A32D2D'}`,
                    color:       isSuccess ? '#3B6D11' : isPartial ? '#854F0B' : '#A32D2D',
                  }}>
                    <div style={{ fontWeight: '700', marginBottom: '2px' }}>
                      {isSuccess ? '✓ Success' : isPartial ? '⚠ Partial' : '✗ Failed'}
                    </div>
                    {isSuccess || isPartial ? (
                      <div style={{ color: 'inherit', opacity: 0.85 }}>
                        {Number(log.records_processed || 0).toLocaleString()} imported
                        {log.records_failed > 0 && ` · ${log.records_failed} failed`}
                        {log.imported_by_name && ` · ${log.imported_by_name}`}
                        <br />
                        {new Date(log.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {' · '}
                        {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </div>
                    ) : (
                      <div style={{ opacity: 0.85 }}>{log.message || 'Upload failed — check file format'}</div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* ── ACTION BUTTONS ── */}
      <div className="brow" style={{ marginBottom: '20px' }}>
        <button className="btn bp" onClick={runRescore} disabled={rescoring}>
          {rescoring ? '⏳ Rescoring clients...' : '🤖 Run AI Rescore after import'}
        </button>
        <button className="btn" onClick={fetchLogs}>🔄 Refresh Log</button>
      </div>

      {/* ── IMPORT LOG ── */}
      <div className="panel">
        <div className="phd">
          <div className="ptitle">Import History & Audit Log</div>
          <select value={logFilter} onChange={e => setLogFilter(e.target.value)} style={{ fontSize: '12px', padding: '4px 8px' }}>
            <option value="">All file types</option>
            {Object.entries(FILE_CONFIGS).map(([k, c]) => (
              <option key={k} value={k}>{c.icon} {c.label}</option>
            ))}
          </select>
        </div>

        {filteredLogs.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--tx3)', fontSize: '13px' }}>No imports yet</div>
        ) : (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>File Type</th><th>File Name</th><th>Trade Date</th>
                    <th style={{ textAlign: 'right' }}>Records</th>
                    <th style={{ textAlign: 'right' }}>Failed</th>
                    <th>Status</th><th>Uploaded By</th><th>Date & Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log, i) => {
                    const cfg = FILE_CONFIGS[log.file_type] || {};
                    return (
                      <tr key={i}>
                        <td style={{ color: 'var(--tx3)', fontSize: '11px' }}>{i + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{cfg.icon || '📄'}</span>
                            <span style={{ fontWeight: '600', fontSize: '12px', color: cfg.color || 'var(--tx2)' }}>{cfg.label || log.file_type}</span>
                          </div>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--tx2)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.file_name || '—'}</td>
                        <td style={{ fontSize: '12px', color: 'var(--tx2)', whiteSpace: 'nowrap' }}>{log.trade_date ? new Date(log.trade_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{Number(log.records_processed || 0).toLocaleString()}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '12px', color: log.records_failed > 0 ? 'var(--dc)' : 'var(--tx3)' }}>{log.records_failed > 0 ? log.records_failed : '—'}</td>
                        <td>
                          <span style={{
  display:      'inline-flex', alignItems: 'center', gap: '4px',
  padding:      '3px 10px', borderRadius: '20px',
  fontSize:     '11px', fontWeight: '700',
  background:   log.status === 'success' ? '#EAF3DE' : log.status === 'partial' ? '#FFF3DC' : '#FCEBEB',
  color:        log.status === 'success' ? '#3B6D11' : log.status === 'partial' ? '#854F0B' : '#A32D2D',
  border:       `1px solid ${log.status === 'success' ? '#C2ECDC' : log.status === 'partial' ? '#FBE4BF' : '#FAD4D6'}`,
}}>
  {log.status === 'success' ? '✓ Success' : log.status === 'partial' ? '⚠ Partial' : '✗ Failed'}
</span>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--tx2)' }}>{log.imported_by_name || '—'}</td>
                        <td style={{ fontSize: '12px', color: 'var(--tx2)', whiteSpace: 'nowrap' }}>{FMT_DT(log.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {logs.filter(l => !logFilter || l.file_type === logFilter).length > 20 && (
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <button className="btn sm" onClick={() => setShowAll(s => !s)}>
                  {showAll ? 'Show less' : `Show all ${logs.length} records`}
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