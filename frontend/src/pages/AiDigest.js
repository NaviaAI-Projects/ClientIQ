import React, { useEffect, useState } from 'react';
import api from '../api';

const AiDigest = () => {
  const [leads, setLeads] = useState([]);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    loadDigest();
  }, []);

  const loadDigest = async () => {
    try {
      const [leadsRes, logsRes] = await Promise.all([
        api.get('/leads/my'),
        api.get('/contact-logs')
      ]);

      setLeads(leadsRes.data || []);
      setLogs(logsRes.data || []);
    } catch (err) {
      console.error(err);
      alert('Failed to load AI Daily Digest');
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600' }}>
        AI Daily Digest
      </h2>

      <p style={{ color: '#666', marginBottom: '20px' }}>
        Daily AI summary of leads, follow-ups and opportunities
      </p>

      <div style={styles.card}>
        <h3>Today&apos;s Priority</h3>

        {leads.length === 0 ? (
          <p>No priority leads available today.</p>
        ) : (
          leads.map((lead) => (
            <div key={lead.id} style={styles.item}>
              <b>{lead.client_name}</b>
              <p>
                Lead Score: {lead.lead_score} | Churn Risk: {lead.churn_risk_score}
              </p>
              <p>
                AI Suggestion: This client has a high opportunity score.
                Recommended to follow up for MTF or revenue conversion.
              </p>
            </div>
          ))
        )}
      </div>

      <div style={styles.card}>
        <h3>Follow-up Summary</h3>

        {logs.length === 0 ? (
          <p>No interaction logs available.</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} style={styles.item}>
              <b>{log.client_name}</b>
              <p>{log.interaction_type} - {log.notes}</p>
              <p>Status: {log.status}</p>
            </div>
          ))
        )}
      </div>

      <div style={styles.card}>
        <h3>Recommended Action</h3>
        <p>
          Focus on high-score clients first, complete pending follow-ups,
          and update interaction notes after each call.
        </p>
      </div>
    </div>
  );
};

const styles = {
  card: {
    background: '#fff',
    padding: '20px',
    borderRadius: '10px',
    marginBottom: '20px',
    border: '1px solid #eee'
  },
  item: {
    background: '#F8FAFF',
    padding: '12px',
    borderRadius: '8px',
    marginTop: '10px'
  }
};

export default AiDigest;