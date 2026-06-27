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
    <>
    <div className="ph">
  <h2>Mapped Clients</h2>
  <p>Clients mapped to your RM account</p>
</div>
<div className="panel">
  <input
    type="text"
    placeholder="Search by UCC or Client Name"
    value={search}
    onChange={e => setSearch(e.target.value)}
    style={{ width: '280px', marginBottom: '12px' }}
  />
  <div className="tw"><table>
    <thead><tr>
      <th>UCC</th><th>Client Name</th><th>Type</th><th>Plan</th><th>Status</th><th>Action</th>
    </tr></thead>
    <tbody>
      {filteredClients.length === 0 ? (
        <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No mapped clients found</td></tr>
      ) : filteredClients.map(client => (
        <tr key={client.id}>
          <td>{client.ucc}</td>
          <td style={{ fontWeight: '500' }}>{client.name}</td>
          <td><span className={`badge b-${client.client_type?.toLowerCase() === 'nri' ? 'nri' : 'ri'}`}>{client.client_type}</span></td>
          <td>{client.plan}</td>
          <td><span className={`badge ${client.is_active ? 'b-act' : 'b-dor'}`}>{client.is_active ? 'Active' : 'Inactive'}</span></td>
          <td>
            <button className="btn bp sm" onClick={() => navigate('/client-360', { state: { ucc: client.ucc } })}>
              View 360
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
  </div>
</div>
</>
  );
};

export default MappedClients;