import React, { useState, useEffect } from 'react';
import api from '../api';

const PERMISSIONS = [
  { group: 'Overview', items: [
    { id: 'sup-dash', label: 'Company Dashboard' },
    { id: 'sup-ai', label: 'AI Insights' },
  ]},
  { group: 'Approvals', items: [
    { id: 'sup-approve', label: 'Mapping Approvals' },
    { id: 'sup-unmap', label: 'Unmap Requests' },
  ]},
  { group: 'Client Universe', items: [
    { id: 'sup-all', label: 'All Clients' },
    { id: 'sup-unmapped', label: 'Unmapped Pool' },
    { id: 'sup-c360', label: 'Client 360' },
  ]},
  { group: 'RM Management', items: [
    { id: 'sup-rm', label: 'RM Performance' },
    { id: 'sup-leads', label: 'Lead Pipeline' },
  ]},
  { group: 'Reports — Operations', items: [
    { id: 'sup-daily-mis', label: 'Corporate Daily MIS' },
    { id: 'sup-options', label: 'Options Analytics' },
    { id: 'sup-client-analytics', label: 'Client Analytics' },
    { id: 'sup-retention', label: 'Retention & Cohorts' },
    { id: 'sup-inactive', label: 'Inactive & DP Holdings' },
    { id: 'sup-new-biz', label: 'New Business' },
    { id: 'sup-rmi', label: 'RM Impact' },
  ]},
  { group: 'Reports — Finance', items: [
    { id: 'sup-revenue-float', label: 'Revenue & Float' },
    { id: 'sup-concentration', label: 'Concentration Risk' },
    { id: 'sup-mktshare', label: 'Market Share' },
    { id: 'sup-ramp', label: 'Client Revenue Ramp' },
  ]},
];

const ALL_IDS = PERMISSIONS.flatMap(g => g.items.map(i => i.id));

const TEMPLATES = {
  'rm-supervisor': {
    label: 'RM Supervisor (full access)',
    desc: 'Full access to all 20 sections.',
    perms: Object.fromEntries(ALL_IDS.map(id => [id, true]))
  },
  'ops-head': {
    label: 'Operations Head',
    desc: 'No approvals · No RM mgmt · Full client & reports',
    perms: Object.fromEntries(ALL_IDS.map(id => [id,
      !['sup-approve','sup-unmap','sup-rm','sup-leads'].includes(id)]))
  },
  'finance-head': {
    label: 'Finance Head',
    desc: 'Reports — Finance subset only',
    perms: Object.fromEntries(ALL_IDS.map(id => [id,
      ['sup-dash','sup-revenue-float','sup-concentration','sup-mktshare','sup-ramp','sup-daily-mis'].includes(id)]))
  },
  'custom': {
    label: 'Custom',
    desc: 'Manually configured access.',
    perms: Object.fromEntries(ALL_IDS.map(id => [id, false]))
  },
};

const roleColors = {
  admin:       { bg: '#FDEDEA', color: '#D43A24' },
  supervisor:  { bg: '#FEF4E6', color: '#D98A0E' },
  rm:          { bg: '#EDEFF6', color: '#223872' },
  team_leader: { bg: '#E6F7F0', color: '#08905C' },
};

const inp = {
  padding: '8px 12px', border: '1px solid #ddd',
  borderRadius: '6px', fontSize: '13px',
  width: '100%', boxSizing: 'border-box',
  outline: 'none', color: '#111'
};

const lbl = {
  display: 'block', fontSize: '11px',
  fontWeight: '600', color: '#666', marginBottom: '5px'
};

// Layout: col1 = Overview+Approvals+RM Mgmt, col2 = Client Universe, col3 = Reports
const PERM_COLS = [
  [PERMISSIONS[0], PERMISSIONS[1], PERMISSIONS[3]], // Overview, Approvals, RM Mgmt
  [PERMISSIONS[2]],                                  // Client Universe
  [PERMISSIONS[4], PERMISSIONS[5]],                  // Reports Ops + Finance
];

const Users = () => {
  const [users, setUsers]               = useState([]);
  const [rmData, setRmData]             = useState({});
  const [loading, setLoading]           = useState(true);
  const [message, setMessage]           = useState('');
  const [form, setForm]                 = useState({ name: '', email: '', password: '', role: 'rm', supervisor_sub_role: 'rm-supervisor' });
  const [saving, setSaving]             = useState(false);
  const [modal, setModal]               = useState(null);
  const [editTemplate, setEditTemplate] = useState('rm-supervisor');
  const [editPerms, setEditPerms]       = useState({});
  const [modalSaving, setModalSaving]   = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const r = await api.get('/users');
      setUsers(r.data);
    } catch (e) { console.error(e); }
    try {
      const r = await api.get('/rm/list');
      const map = {};
      (r.data || []).forEach(rm => { map[rm.rm_name.toLowerCase()] = rm; });
      setRmData(map);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      await api.post('/users', form);
      setMessage('success');
      setForm({ name: '', email: '', password: '', role: 'rm', supervisor_sub_role: 'rm-supervisor' });
      fetchAll();
    } catch (err) { setMessage(err.response?.data?.message || 'Error creating user'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (user) => {
    try {
      await api.put(`/users/${user.id}`, { ...user, is_active: !user.is_active });
      fetchAll();
    } catch { alert('Failed to update'); }
  };

  const openModal = (user) => {
    const tmpl = user.supervisor_sub_role || 'rm-supervisor';
    setEditTemplate(tmpl);
    // If user has saved individual permissions, show those — otherwise use template defaults
    if (user.permissions && typeof user.permissions === 'object' && Object.keys(user.permissions).length > 0) {
      setEditPerms({ ...user.permissions });
    } else {
      setEditPerms({ ...(TEMPLATES[tmpl]?.perms || TEMPLATES['rm-supervisor'].perms) });
    }
    setModal({ ...user });
  };

  const applyTemplate = (tmpl) => {
    setEditTemplate(tmpl);
    // Always apply template perms when switching (custom starts with all false)
    setEditPerms({ ...TEMPLATES[tmpl].perms });
  };

  const saveModal = async () => {
    setModalSaving(true);
    try {
      await api.put(`/users/${modal.id}`, {
        name: modal.name, email: modal.email,
        role: modal.role, supervisor_sub_role: editTemplate,
        is_active: modal.is_active,
        permissions: editPerms,
        agent_number: modal.agent_number || null,
        phone: modal.phone || null
      });
      setModal(null); fetchAll();
    } catch { alert('Failed to save'); }
    setModalSaving(false);
  };

  const getClients = (user) => {
    const rm = rmData[user.name.toLowerCase()];
    return rm ? `${rm.assigned_clients} / ${rm.capacity}` : null;
  };

  const getDesc = (user) => {
    if (user.role === 'supervisor') return TEMPLATES[user.supervisor_sub_role]?.desc || 'Full access';
    if (user.role === 'team_leader') return 'Own book + team visibility';
    if (user.role === 'rm') return 'Standard RM access';
    return '—';
  };

  const cell = { padding: '12px 16px', fontSize: '13px', borderBottom: '1px solid #f1f1f1', verticalAlign: 'middle' };
  const th   = { padding: '10px 16px', fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid #eee', background: '#fafafa' };

  const RoleBadge = ({ role }) => {
    const c = roleColors[role] || roleColors.rm;
    return (
      <span style={{ background: c.bg, color: c.color, padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
        {role.replace('_', ' ')}
      </span>
    );
  };

  const PermCol = ({ groups, perms, onChange }) => (
    <div style={{ padding: '12px 14px', background: '#f8f9fb', minHeight: '100%' }}>
      {groups.map(group => (
        <div key={group.group} style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>
            {group.group}
          </div>
          {group.items.map(item => (
            <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '12.5px', cursor: 'pointer', color: '#333' }}>
              <input type="checkbox"
                checked={!!perms[item.id]}
                onChange={e => onChange(item.id, e.target.checked)}
                style={{ width: '14px', height: '14px', cursor: 'pointer' }} />
              {item.label}
            </label>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* PAGE HEADER */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111', margin: 0 }}>Users & Roles</h2>
        <p style={{ fontSize: '13px', color: '#777', marginTop: '4px' }}>
          Manage all users and their menu-level access. Supervisor sub-roles control which sections each person can see.
        </p>
      </div>

      {/* MESSAGE */}
      {message && (
        <div style={{ padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px',
          background: message === 'success' ? '#eaf3de' : '#fcebeb',
          color: message === 'success' ? '#3b6d11' : '#a32d2d' }}>
          {message === 'success' ? '✓ User created successfully!' : message}
        </div>
      )}

      {/* ADD USER PANEL */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px 24px', border: '1px solid #eee', marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#111', marginBottom: '16px' }}>➕ Add User</div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={lbl}>Full Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Priya Shankar" required style={inp} />
            </div>
            <div>
              <label style={lbl}>Role Level</label>
              <select value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value, supervisor_sub_role: 'rm-supervisor' })}
                style={inp}>
                <option value="rm">RM</option>
                <option value="team_leader">Team Leader</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {form.role === 'supervisor' && (
              <div>
                <label style={lbl}>Sub-role</label>
                <select value={form.supervisor_sub_role}
                  onChange={e => setForm({ ...form, supervisor_sub_role: e.target.value })} style={inp}>
                  <option value="rm-supervisor">RM Supervisor (full access)</option>
                  <option value="ops-head">Operations Head</option>
                  <option value="finance-head">Finance Head</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            )}
            <div>
              <label style={lbl}>Email</label>
              <input type="email" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="user@navia.in" required style={inp} />
            </div>
            <div>
              <label style={lbl}>Password</label>
              <input type="password" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="Min 6 chars" required style={inp} />
            </div>
          </div>
          <button type="submit" disabled={saving}
            style={{ padding: '9px 20px', background: saving ? '#94a3b8' : '#223872', color: 'white', border: 'none', borderRadius: '7px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>
            {saving ? 'Creating...' : '+ Add user'}
          </button>
        </form>
      </div>

      {/* ALL USERS TABLE */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #eee', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #eee', fontSize: '14px', fontWeight: '600', color: '#111' }}>
          All Users
        </div>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#aaa' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Role Level</th>
                <th style={th}>Sub-role / Access Profile</th>
                <th style={th}>Clients</th>
                <th style={th}>Status</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const clients  = getClients(user);
                const desc     = getDesc(user);
                const tmpl     = TEMPLATES[user.supervisor_sub_role];
                return (
                  <tr key={user.id} style={{ background: 'white' }}>
                    <td style={{ ...cell, fontWeight: '600', color: '#111' }}>{user.name}</td>
                    <td style={cell}><RoleBadge role={user.role} /></td>
                    <td style={cell}>
                      {tmpl && (
                        <span style={{ background: '#EEF5FF', color: '#185fa5', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', marginRight: '8px' }}>
                          {tmpl.label}
                        </span>
                      )}
                      <span style={{ fontSize: '12px', color: '#888' }}>{desc}</span>
                    </td>
                    <td style={{ ...cell, fontWeight: '600', color: clients ? '#223872' : '#ccc' }}>
                      {clients || '—'}
                    </td>
                    <td style={cell}>
                      <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                        background: user.is_active ? '#eaf3de' : '#fcebeb',
                        color: user.is_active ? '#3b6d11' : '#a32d2d' }}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ ...cell }}>
                      <button onClick={() => openModal(user)}
                        style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '5px', cursor: 'pointer', border: '1px solid #ddd', background: 'white', color: '#333', marginRight: '6px', fontWeight: '500' }}>
                        {user.role === 'supervisor' ? 'Edit access' : 'Edit'}
                      </button>
                      <button onClick={() => toggleActive(user)}
                        style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '5px', cursor: 'pointer', border: '1px solid',
                          borderColor: user.is_active ? '#f1a1a1' : '#a1d1a1',
                          background: user.is_active ? '#fff5f5' : '#f5fff5',
                          color: user.is_active ? '#c0392b' : '#27ae60', fontWeight: '500' }}>
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* EDIT MODAL */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '14px', width: '820px', maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto', padding: '28px', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>

            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: '#111' }}>
                {modal.role === 'supervisor' ? `Edit access — ${modal.name}` : `Edit user — ${modal.name}`}
              </h3>
              <button onClick={() => setModal(null)}
                style={{ background: '#f5f5f5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', fontSize: '16px', cursor: 'pointer', color: '#555', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ✕
              </button>
            </div>

            {/* Name + Email + Agent Number */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
              <div>
                <label style={lbl}>Full Name</label>
                <input value={modal.name} onChange={e => setModal({ ...modal, name: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={lbl}>Email</label>
                <input value={modal.email} onChange={e => setModal({ ...modal, email: e.target.value })} style={inp} />
              </div>
              {(modal.role === 'rm' || modal.role === 'team_leader') && (
                <>
                  <div>
                    <label style={lbl}>Smartflo Agent Number</label>
                    <input value={modal.agent_number || ''} onChange={e => setModal({ ...modal, agent_number: e.target.value })}
                      placeholder="e.g. 9962017083" style={inp} />
                    <div style={{ fontSize: '10px', color: '#888', marginTop: '3px' }}>Mobile registered with Tata Tele Smartflo for click-to-call</div>
                  </div>
                  <div>
                    <label style={lbl}>Work Phone</label>
                    <input value={modal.phone || ''} onChange={e => setModal({ ...modal, phone: e.target.value })}
                      placeholder="e.g. 9962017083" style={inp} />
                  </div>
                </>
              )}
            </div>

            {/* Supervisor: template + permission matrix */}
            {modal.role === 'supervisor' && (
              <>
                {/* Template selector */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  <div>
                    <label style={lbl}>Sub-role Template</label>
                    <select value={editTemplate} onChange={e => applyTemplate(e.target.value)} style={inp}>
                      <option value="rm-supervisor">RM Supervisor (full access)</option>
                      <option value="ops-head">Operations Head</option>
                      <option value="finance-head">Finance Head</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ background: '#EEF5FF', color: '#185fa5', padding: '10px 14px', borderRadius: '8px', fontSize: '12.5px', width: '100%', lineHeight: '1.4' }}>
                      {TEMPLATES[editTemplate]?.desc}
                    </div>
                  </div>
                </div>

                {/* Permission grid — 3 columns matching prototype */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                    Menu Access
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #eee' }}>
                    {PERM_COLS.map((colGroups, ci) => (
                      <PermCol
                        key={ci}
                        groups={colGroups}
                        perms={editPerms}
                        onChange={(id, checked) => {
                          setEditPerms(prev => ({ ...prev, [id]: checked }));
                          if (editTemplate !== 'custom') setEditTemplate('custom');
                        }}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Modal actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={saveModal} disabled={modalSaving}
                style={{ padding: '10px 24px', background: modalSaving ? '#94a3b8' : '#223872', color: 'white', border: 'none', borderRadius: '7px', cursor: modalSaving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>
                {modalSaving ? 'Saving...' : '💾 Save access profile'}
              </button>
              <button onClick={() => setModal(null)}
                style={{ padding: '10px 24px', background: 'white', color: '#555', border: '1px solid #ddd', borderRadius: '7px', cursor: 'pointer', fontSize: '13px' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;