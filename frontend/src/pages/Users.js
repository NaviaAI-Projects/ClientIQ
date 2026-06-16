import React, { useState, useEffect } from 'react';
import api from '../api';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'rm' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/users', form);
      setMessage('success');
      setForm({ name: '', email: '', password: '', role: 'rm' });
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Error creating user');
    } finally {
      setSaving(false);
    }
  };

  const roleStyle = {
    admin:       { background: '#fcebeb', color: '#a32d2d' },
    supervisor:  { background: '#faeeda', color: '#854f0b' },
    rm:          { background: '#e6f1fb', color: '#185fa5' },
    team_leader: { background: '#eaf3de', color: '#3b6d11' },
  };

  const cell = { padding: '12px 16px' };
  const th = { ...cell, fontSize: '10px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'left', borderBottom: '0.5px solid rgba(0,0,0,0.1)' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '600' }}>Users and Roles</h2>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Manage RM, Supervisor, Team Leader and Admin accounts</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '8px 16px', background: '#185fa5', color: 'white',
          border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px'
        }}>
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {message && (
        <div style={{
          padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px',
          background: message === 'success' ? '#eaf3de' : '#fcebeb',
          color: message === 'success' ? '#3b6d11' : '#a32d2d'
        }}>
          {message === 'success' ? 'User created successfully!' : message}
        </div>
      )}

      {showForm && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '20px', border: '0.5px solid rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>Create New User</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '4px' }}>Full Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Arjun Rajan"
                  required
                  style={{ width: '100%', padding: '8px 12px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '4px' }}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="user@navia.com"
                  required
                  style={{ width: '100%', padding: '8px 12px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '4px' }}>Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Minimum 6 characters"
                  required
                  style={{ width: '100%', padding: '8px 12px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '4px' }}>Role</label>
                <select
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                >
                  <option value="rm">RM (Relationship Manager)</option>
                  <option value="team_leader">Team Leader</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '10px 24px',
                background: saving ? '#94a3b8' : '#185fa5',
                color: 'white', border: 'none', borderRadius: '6px',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: '600'
              }}
            >
              {saving ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Loading users...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Status</th>
                <th style={th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const rs = roleStyle[user.role] || roleStyle.rm;
                return (
                  <tr key={user.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ ...cell, fontWeight: '500' }}>{user.name}</td>
                    <td style={{ ...cell, color: '#555' }}>{user.email}</td>
                    <td style={cell}>
                      <span style={{ ...rs, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>
                        {user.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={cell}>
                      <span style={{
                        background: user.is_active ? '#eaf3de' : '#fcebeb',
                        color: user.is_active ? '#3b6d11' : '#a32d2d',
                        padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600'
                      }}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ ...cell, color: '#888', fontSize: '12px' }}>
                      {new Date(user.created_at).toLocaleDateString('en-IN')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Users;