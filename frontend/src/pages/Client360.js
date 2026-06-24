import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api';

const Client360 = () => {
  const location = useLocation();
  const selectedUcc = location.state?.ucc;

  const [client, setClient] = useState(null);
  const [clients, setClients] = useState([]);
  const [ucc, setUcc] = useState(selectedUcc || '');

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    if (ucc) {
      fetchClient(ucc);
    }
  }, [ucc]);

  const loadClients = async () => {
    try {
      const res = await api.get('/clients');
      const list = res.data.clients || [];
      setClients(list);

      if (!selectedUcc && list.length > 0) {
        setUcc(list[0].ucc);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to load clients');
    }
  };

  const fetchClient = async (clientUcc) => {
    try {
      const res = await api.get(`/clients/${clientUcc}`);
      setClient(res.data);
    } catch (err) {
      console.error(err);
      alert('Failed to load client details');
    }
  };

  if (!ucc && clients.length === 0) {
    return <div>No clients available</div>;
  }

  return (
    <div>
      <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#111' }}>
        Client 360
      </h2>

      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
        Complete client overview
      </p>

      <div style={{ marginTop: '16px', marginBottom: '16px' }}>
        <label>Select Client</label><br />
        <select
          value={ucc}
          onChange={(e) => setUcc(e.target.value)}
          style={{
            padding: '8px',
            width: '300px',
            border: '1px solid #ccc',
            borderRadius: '5px'
          }}
        >
          {clients.map(c => (
            <option key={c.ucc} value={c.ucc}>
              {c.ucc} - {c.name}
            </option>
          ))}
        </select>
      </div>

      {!client ? (
        <div>Loading client details...</div>
      ) : (
        <div style={{
          background: 'white',
          borderRadius: '10px',
          padding: '20px',
          marginTop: '20px',
          border: '0.5px solid rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginBottom: '16px' }}>{client.name}</h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '16px'
          }}>
            <Info label="UCC" value={client.ucc} />
            <Info label="Client Type" value={client.client_type} />
            <Info label="Plan" value={client.plan} />
            <Info label="Account Open Date" value={formatDate(client.account_open_date)} />
            <Info label="Last Trade Date" value={formatDate(client.last_trade_date)} />
            <Info label="Status" value={client.status || (client.is_active ? 'Active' : 'Inactive')} />
            <Info label="Lead Score" value={client.lead_score || 'N/A'} />
            <Info label="Churn Risk Score" value={client.churn_risk_score || 'N/A'} />
            <Info label="Latest Ledger Balance" value={client.latest_balance || 0} />
            <Info label="Latest Holdings" value={client.latest_holdings || 0} />
            <Info label="Mapped RM" value={client.rm_name || '-'} />
          </div>
        </div>
      )}
    </div>
  );
};

const Info = ({ label, value }) => (
  <div>
    <label>{label}</label>
    <div>{value}</div>
  </div>
);

const formatDate = (date) => {
  return date ? new Date(date).toLocaleDateString('en-IN') : '-';
};

export default Client360;