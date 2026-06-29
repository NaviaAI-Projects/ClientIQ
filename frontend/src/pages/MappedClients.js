import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const MappedClients = () => {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await api.get('/clients/my/clients');
      setClients(res.data);
    } catch (err) {
      console.error(err);
      alert('Failed to load mapped clients');
    }
  };

  const filteredClients = clients.filter(client =>
    (client.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (client.ucc || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
        <button onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#223872', fontSize: '13px', fontWeight: '500' }}>
          ← Back
        </button>
      </div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>
        Mapped Clients
      </h2>

      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
        Clients mapped to your RM account
      </p>

      <div style={{
        background: 'white',
        borderRadius: '10px',
        padding: '20px',
        marginTop: '20px',
        border: '0.5px solid rgba(0,0,0,0.1)'
      }}>
        <input
          type="text"
          placeholder="Search by UCC or Client Name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '9px',
            width: '300px',
            marginBottom: '16px',
            border: '1px solid #ddd',
            borderRadius: '6px'
          }}
        />

        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px'
        }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '10px' }}>UCC</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Client Name</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Client Type</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Plan</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredClients.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '20px', color: '#888', textAlign: 'center' }}>
                  No mapped clients found
                </td>
              </tr>
            ) : (
              filteredClients.map(client => (
                <tr key={client.id} style={{ borderBottom: '1px solid #f1f1f1' }}>
                  <td style={{ padding: '10px' }}>{client.ucc}</td>
                  <td style={{ padding: '10px' }}>{client.name}</td>
                  <td style={{ padding: '10px' }}>{client.client_type}</td>
                  <td style={{ padding: '10px' }}>{client.plan}</td>
                  <td style={{ padding: '10px' }}>
                    {client.is_active ? 'Active' : 'Inactive'}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <button
                      onClick={() => navigate('/client-360', { state: { ucc: client.ucc } })}
                      style={{
                        padding: '6px 12px',
                        background: '#223872',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      View 360
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MappedClients;