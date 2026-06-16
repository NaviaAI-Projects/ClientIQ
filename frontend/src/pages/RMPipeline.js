import React, { useState, useEffect } from 'react';
import api from '../api';

const RMPipeline = () => {
  const [rms, setRms] = useState([]);
  const [rmCapacityLimit, setRmCapacityLimit] = useState(100);
  const [leadExpiryWindow, setLeadExpiryWindow] = useState(30);

  useEffect(() => {
    fetchRms();
    fetchSettings();
  }, []);

  const fetchRms = async () => {
    try {
      const res = await api.get('/rm/list');
      setRms(res.data);
    } catch (err) {
      console.error(err);
      alert('Failed to load RM list');
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await api.get('/rm/settings');
      if (res.data) {
        setRmCapacityLimit(res.data.rm_capacity_limit);
        setLeadExpiryWindow(res.data.lead_expiry_window);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to load settings');
    }
  };

  const saveSettings = async () => {
    try {
      const res = await api.post('/rm/settings', {
        rm_capacity_limit: Number(rmCapacityLimit),
        lead_expiry_window: Number(leadExpiryWindow)
      });

      alert(res.data.message);
      fetchSettings();
    } catch (err) {
      console.error(err);
      alert('Failed to save settings');
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>
        RM & Pipeline
      </h2>

      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
        RM capacity, auto-assignment rules, and lead expiry settings
      </p>

      <div style={{
        background: 'white',
        borderRadius: '10px',
        padding: '20px',
        marginTop: '20px',
        border: '0.5px solid rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '15px', marginBottom: '15px' }}>
          Pipeline Settings
        </h3>

        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          marginBottom: '20px'
        }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px' }}>RM Name</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Capacity</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Assigned Clients</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Available Slots</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Status</th>
            </tr>
          </thead>

          <tbody>
            {rms.map(rm => {
  const assignedClients = Number(rm.assigned_clients || 0);
  const availableSlots = rm.capacity - assignedClients;

  return (
                <tr key={rm.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>{rm.rm_name}</td>
                  <td style={{ padding: '10px' }}>{rm.capacity}</td>
                  <td style={{ padding: '10px' }}>{assignedClients}</td>
                  <td style={{ padding: '10px' }}>{availableSlots}</td>
                  <td style={{ padding: '10px' }}>{rm.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginBottom: '12px' }}>
          <label>RM Capacity Limit</label><br />
          <input
            type="number"
            value={rmCapacityLimit}
            onChange={(e) => setRmCapacityLimit(e.target.value)}
            style={{ padding: '8px', width: '250px' }}
          />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label>Lead Expiry Window</label><br />
          <input
            type="number"
            value={leadExpiryWindow}
            onChange={(e) => setLeadExpiryWindow(e.target.value)}
            style={{ padding: '8px', width: '250px' }}
          />
        </div>

        <button
          onClick={saveSettings}
          style={{
            padding: '9px 18px',
            background: '#185fa5',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default RMPipeline;