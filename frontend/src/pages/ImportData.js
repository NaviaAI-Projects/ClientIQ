import React, { useState, useEffect } from 'react';
import api from '../api';

const FILE_TYPES = [
  { key: 'client_master', label: 'Client Master', desc: 'All client records — UCC, name, type, plan' },
  { key: 'trade', label: 'Trade File', desc: 'Daily turnover per client per segment' },
  { key: 'brokerage', label: 'Brokerage File', desc: 'Daily brokerage amount per client' },
  { key: 'ledger', label: 'Ledger File', desc: 'Daily cash balance per client' },
  { key: 'mtf', label: 'MTF File', desc: 'Monthly MTF balance and interest' },
];

const ImportData = () => {
  const [logs, setLogs] = useState([]);
  const [uploading, setUploading] = useState({});
  const [results, setResults] = useState({});

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await api.get('/import/logs');
      setLogs(res.data);
    } catch (err) {
      console.error(err);
    }
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
        [fileType]: {
          success: false,
          message: err.response?.data?.message || 'Upload failed'
        }
      }));
    } finally {
      setUploading(u => ({ ...u, [fileType]: false }));
    }
  };

  const runPipeline = async () => {
    try {
      const res = await api.post('/import/run-pipeline');
      alert(res.data.message);
    } catch (err) {
      alert(err.response?.data?.message || 'Pipeline failed');
    }
  };

  const renderResult = (key) => {
    const result = results[key];

    if (!result) return null;

    return (
      <div style={{
        marginTop: '10px',
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '12px',
        background: result.success ? '#eaf3de' : '#fcebeb',
        color: result.success ? '#3b6d11' : '#a32d2d'
      }}>
        {result.success
          ? `✓ ${result.processed} records imported${result.failed > 0 ? `, ${result.failed} failed` : ''}`
          : `✗ ${result.message}`}
      </div>
    );
  };

  const UploadButton = ({ fileType, label }) => {
    const busy = uploading[fileType];

    return (
      <label style={{
        display: 'inline-block',
        padding: '8px 16px',
        background: busy ? '#94a3b8' : '#185fa5',
        color: 'white',
        borderRadius: '6px',
        cursor: busy ? 'not-allowed' : 'pointer',
        fontSize: '12px',
        fontWeight: '500',
        marginRight: '8px',
        marginBottom: '8px'
      }}>
        {busy ? 'Uploading...' : label}

        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          disabled={busy}
          onChange={e => {
            if (e.target.files[0]) {
              handleUpload(fileType, e.target.files[0]);
            }
            e.target.value = '';
          }}
        />
      </label>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>
          Daily Data Import
        </h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
          Upload the daily Excel/CSV files to update the database
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '14px',
        marginBottom: '24px'
      }}>
        {FILE_TYPES.map(ft => (
          <div
            key={ft.key}
            style={{
              background: 'white',
              borderRadius: '10px',
              padding: '20px',
              border: '0.5px solid rgba(0,0,0,0.1)'
            }}
          >
            <div style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#111',
              marginBottom: '4px'
            }}>
              {ft.label}
            </div>

            <div style={{
              fontSize: '12px',
              color: '#888',
              marginBottom: '14px'
            }}>
              {ft.desc}
            </div>

            <UploadButton fileType={ft.key} label="Choose File & Upload" />
            {renderResult(ft.key)}
          </div>
        ))}

        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '20px',
          border: '0.5px solid rgba(0,0,0,0.1)'
        }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#111',
            marginBottom: '4px'
          }}>
            Holdings + Bhavcopy
          </div>

          <div style={{
            fontSize: '12px',
            color: '#888',
            marginBottom: '14px'
          }}>
            Upload Bhavcopy first, then Holdings file
          </div>

          <div>
            <UploadButton fileType="bhavcopy" label="Upload Bhavcopy" />
            {renderResult('bhavcopy')}
          </div>

          <div style={{ marginTop: '10px' }}>
            <UploadButton fileType="holdings" label="Upload Holdings" />
            {renderResult('holdings')}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={runPipeline}
          style={{
            padding: '10px 18px',
            background: '#185fa5',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600'
          }}
        >
          Run Import Pipeline
        </button>
      </div>

      <div style={{
        background: 'white',
        borderRadius: '10px',
        border: '0.5px solid rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: '0.5px solid rgba(0,0,0,0.1)',
          fontSize: '13px',
          fontWeight: '600'
        }}>
          Import History
        </div>

        {logs.length === 0 ? (
          <div style={{
            padding: '30px',
            textAlign: 'center',
            color: '#888',
            fontSize: '13px'
          }}>
            No imports yet
          </div>
        ) : (
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12.5px'
          }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid rgba(0,0,0,0.1)' }}>
                {['File Type', 'File Name', 'Records', 'Failed', 'Status', 'Imported By', 'Date'].map(h => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '10px 14px',
                      fontSize: '10px',
                      fontWeight: '600',
                      color: '#888',
                      textTransform: 'uppercase'
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {logs.map((log, i) => (
                <tr key={i} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: '500' }}>
                    {log.file_type}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#555' }}>
                    {log.file_name}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {log.records_processed}
                  </td>
                  <td style={{
                    padding: '10px 14px',
                    color: log.records_failed > 0 ? '#a32d2d' : '#888'
                  }}>
                    {log.records_failed}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600',
                      background: log.status === 'success' ? '#eaf3de' : '#fcebeb',
                      color: log.status === 'success' ? '#3b6d11' : '#a32d2d'
                    }}>
                      {log.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#555' }}>
                    {log.imported_by_name}
                  </td>
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