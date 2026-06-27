import React, { useEffect, useState } from 'react';
import api from '../api';

const AiDigest = () => {
  const [leads, setLeads] = useState([]);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/leads/my'),
      api.get('/contact-logs')
    ]).then(([leadsRes, logsRes]) => {
      setLeads(leadsRes.data || []);
      setLogs(logsRes.data || []);
    }).catch(console.error);
  }, []);

  return (
    <div>
      <div className="ph">
        <h2>AI Daily Digest</h2>
        <p>Personalised intelligence · {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      <div className="panel" style={{ borderLeft: '3px solid var(--ic)' }}>
        <div className="ptitle">Today's Priority Leads</div>
        {leads.length === 0 ? (
          <p style={{ color: 'var(--tx2)', fontSize: '13px' }}>No priority leads available today.</p>
        ) : leads.map(lead => (
          <div key={lead.id} style={{ padding: '10px 12px', background: 'var(--bg2)', borderRadius: 'var(--r2)', marginBottom: '8px' }}>
            <div style={{ fontWeight: '600', fontSize: '13px' }}>{lead.client_name}</div>
            <div style={{ fontSize: '12px', color: 'var(--tx2)', marginTop: '3px' }}>
              Lead Score: <span className="ais h">{lead.lead_score}</span> &nbsp;
              Churn Risk: <span className="ais m">{lead.churn_risk_score}</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--tx2)', marginTop: '4px' }}>
              AI: High opportunity client — recommended for MTF or revenue conversion follow-up.
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="ptitle">Follow-up Summary</div>
        {logs.length === 0 ? (
          <p style={{ color: 'var(--tx2)', fontSize: '13px' }}>No interaction logs available.</p>
        ) : logs.map(log => (
          <div key={log.id} style={{ padding: '10px 12px', background: 'var(--bg2)', borderRadius: 'var(--r2)', marginBottom: '8px' }}>
            <div style={{ fontWeight: '600', fontSize: '13px' }}>{log.client_name}</div>
            <div style={{ fontSize: '12px', color: 'var(--tx2)', marginTop: '3px' }}>{log.interaction_type} — {log.notes}</div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="ptitle">Recommended Action</div>
        <div className="aibox">
          Focus on high-score clients first, complete pending follow-ups, and update interaction notes after each call.
        </div>
      </div>
    </div>
  );
};

export default AiDigest;