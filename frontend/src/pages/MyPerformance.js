import React, { useEffect, useState } from 'react';
import axios from 'axios';
import api from '../api';

const MyPerformance = () => {
  const [stats, setStats] = useState({
    clients: 0,
    leads: 0,
    interactions: 0
  });

  useEffect(() => {
    loadPerformance();
  }, []);

  const loadPerformance = async () => {
    try {

      const [clientsRes, leadsRes, logsRes] = await Promise.all([
        api.get('/clients/my/clients'),
        api.get('/leads/my'),
        api.get('/contact-logs')
      ]);

      setStats({
        clients: clientsRes.data.length || 0,
        leads: leadsRes.data.length || 0,
        interactions: logsRes.data.length || 0
      });

    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ padding: '30px' }}>
      <h2>My Performance</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        RM performance summary
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '20px'
        }}
      >
        <div
          style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '10px'
          }}
        >
          <h3>Clients</h3>
          <h1>{stats.clients}</h1>
        </div>

        <div
          style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '10px'
          }}
        >
          <h3>Assigned Leads</h3>
          <h1>{stats.leads}</h1>
        </div>

        <div
          style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '10px'
          }}
        >
          <h3>Interactions</h3>
          <h1>{stats.interactions}</h1>
        </div>
      </div>
    </div>
  );
};

export default MyPerformance;