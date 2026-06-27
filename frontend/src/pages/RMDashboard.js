import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const StatCard = ({ title, value, subtitle, color, icon }) => (
  <div style={{
  background: 'white',
  borderRadius: '12px',
  padding: '24px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  borderLeft: `4px solid ${color}`,
  flex: 1,
  minWidth: '200px'
}}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>{title}</div>
        <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#223872', fontFamily: "'Sora', sans-serif" }}>{value}</div>
        {subtitle && <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{subtitle}</div>}
      </div>
      <div style={{ fontSize: '28px' }}>{icon}</div>
    </div>
  </div>
);

const RMDashboard = () => {
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, leadsRes, clientsRes] = await Promise.all([
          api.get('/dashboard/rm'),
          api.get('/leads?status=assigned'),
          api.get('/clients/my/clients'),
        ]);
        setStats(statsRes.data);
        setLeads(leadsRes.data.slice(0, 5));
        setClients(clientsRes.data.slice(0, 5));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <div style={{ fontSize: '16px', color: '#888' }}>Loading dashboard...</div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="ph">
  <h2>My dashboard</h2>
  <p>{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
</div>
<div className="cards">
  <div className="card ci">
    <div className="clbl">MTD revenue (attributed)</div>
    <div className="cval">{stats?.my_clients || 0}</div>
    <div className="csub">Mapped to you</div>
  </div>
  <div className="card cs">
    <div className="clbl">Mapped clients</div>
    <div className="cval">{stats?.my_clients || 0}</div>
  </div>
  <div className="card cw">
    <div className="clbl">Active leads</div>
    <div className="cval">{stats?.my_leads || 0}</div>
  </div>
  <div className="card cp">
    <div className="clbl">Interactions (30d)</div>
    <div className="cval">{stats?.interactions_30d || 0}</div>
  </div>
</div>

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

        {/* My Leads */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1B3A6B', margin: 0 }}>My Active Leads</h2>
            <button onClick={() => navigate('/leads')} style={{
              background: 'none', border: '1px solid #1B3A6B', color: '#1B3A6B',
              padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
            }}>View All</button>
          </div>
          {leads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>No active leads assigned</div>
          ) : (
            leads.map((lead, i) => (
              <div key={i} onClick={() => navigate('/client-360', { state: { ucc: lead.ucc } })} style={{
                padding: '12px', borderRadius: '8px', background: '#F8FAFF',
                marginBottom: '8px', cursor: 'pointer', border: '1px solid #E8F0FF'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: '600', color: '#333', fontSize: '14px' }}>{lead.name}</div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{lead.ucc} • {lead.client_type}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      background: lead.lead_score >= 80 ? '#D4EDDA' : lead.lead_score >= 60 ? '#FFF3CD' : '#F8D7DA',
                      color: lead.lead_score >= 80 ? '#1E7E34' : lead.lead_score >= 60 ? '#856404' : '#721C24',
                      padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600'
                    }}>
                      Score: {lead.lead_score || 'N/A'}
                    </div>
                    {lead.assignment_expires_at && (
                      <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '4px' }}>
                        Expires: {new Date(lead.assignment_expires_at).toLocaleDateString('en-IN')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* My Clients */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1B3A6B', margin: 0 }}>My Clients</h2>
            <button onClick={() => navigate('/clients')} style={{
              background: 'none', border: '1px solid #1B3A6B', color: '#1B3A6B',
              padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
            }}>View All</button>
          </div>
          {clients.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>No clients mapped yet</div>
          ) : (
            clients.map((client, i) => (
              <div key={i} onClick={() => navigate('/client-360', { state: { ucc: client.ucc } })} style={{
                padding: '12px', borderRadius: '8px', background: '#F8FAFF',
                marginBottom: '8px', cursor: 'pointer', border: '1px solid #E8F0FF'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: '600', color: '#333', fontSize: '14px' }}>{client.name}</div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{client.ucc} • {client.client_type}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      background: client.is_active ? '#D4EDDA' : '#F8D7DA',
                      color: client.is_active ? '#1E7E34' : '#721C24',
                      padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600'
                    }}>
                      {client.is_active ? 'Active' : 'Inactive'}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
};

export default RMDashboard;