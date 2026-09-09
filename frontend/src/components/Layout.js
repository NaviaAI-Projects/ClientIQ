import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const PERM_PATH_MAP = {
  'sup-dash':             '/supervisor-dashboard',
  'sup-ai':              '/ai-insights',
  'sup-approve':         '/mapping-approvals',
  'sup-unmap':           '/unmap-requests',
  'sup-all':             '/all-clients',
  'sup-unmapped':        '/unmapped-pool',
  'sup-c360':            '/client-360',
  'sup-rm':              '/rm-performance',
  'sup-leads':           '/lead-pipeline',
  'sup-daily-mis':       '/daily-mis',
  'sup-options':         '/options-analytics',
  'sup-client-analytics':'/client-analytics',
  'sup-retention':       '/retention',
  'sup-inactive':        '/inactive-dp',
  'sup-new-biz':         '/new-business',
  'sup-rmi':             '/rm-impact',
  'sup-revenue-float':   '/revenue-float',
  'sup-concentration':   '/concentration-risk',
  'sup-mktshare':        '/market-share',
  'sup-ramp':            '/revenue-ramp',
};

function isPathAllowed(user, path) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'rm' || user.role === 'team_leader') return true;
  if (user.role === 'supervisor') {
    if (user.permissions && typeof user.permissions === 'object' && Object.keys(user.permissions).length > 0) {
      const permId = Object.entries(PERM_PATH_MAP).find(([, p]) => p === path)?.[0];
      if (!permId) return true;
      return !!user.permissions[permId];
    }
    const tmpl = user.supervisor_sub_role || 'rm-supervisor';
    if (tmpl === 'rm-supervisor') return true;
    if (tmpl === 'ops-head') return !['/mapping-approvals','/unmap-requests','/rm-performance','/lead-pipeline'].includes(path);
    if (tmpl === 'finance-head') return ['/supervisor-dashboard','/daily-mis','/revenue-float','/concentration-risk','/market-share','/revenue-ramp'].includes(path);
    return true;
  }
  return false;
}

const Layout = () => {
  const { user, logout }   = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('viewMode') || 'admin');   // dual-access: 'admin' | 'supervisor'
  const navigate = useNavigate();
  const [counts, setCounts] = useState({
    ai_digest: 0, to_call: 0, assigned_leads: 0,
    dormant: 0, mapping_approvals: 0, unmap_requests: 0
  });

  useEffect(() => {
    if (!user) return;
    fetchCounts();
    const interval = setInterval(fetchCounts, 300000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchCounts = async () => {
    try {
      if (user?.role === 'rm' || user?.role === 'team_leader') {
        // Each badge maps to what its page actually shows:
        //  • To Call Today  → the to-call list (leads still needing a call today), NOT assigned count
        //  • AI Daily Digest → priority (high-score) clients, using the digest's own ≥60 threshold
        //  • Dormant Clients → mapped clients with no trade >3 months
        const [leadsRes, toCallRes, dormantRes] = await Promise.all([
          api.get('/leads/my'),
          api.get('/leads/to-call-today'),
          api.get('/clients/my/clients?dormant=true'),
        ]);
        const leads   = leadsRes.data   || [];
        const toCall  = toCallRes.data  || [];
        const dormant = dormantRes.data || [];
        setCounts(prev => ({
          ...prev,
          to_call:        toCall.filter(c => !c.contacted_today).length,
          assigned_leads: leads.length,
          ai_digest:      leads.filter(l => (l.lead_score || 0) >= 60).length,
          dormant:        dormant.length,
        }));
      }
      if (user?.role === 'supervisor' || user?.role === 'admin') {
        // Badge must match the Mapping Approvals page — pending approval requests,
        // NOT the whole scored unmapped pool (/leads/mapping-pool returned ~7824).
        const [approvalRes] = await Promise.all([api.get('/analytics/mapping-approvals')]);
        setCounts(prev => ({
          ...prev,
          mapping_approvals: (approvalRes.data?.rows || []).length,
        }));
      }
    } catch (e) { console.error('Count fetch error:', e); }
  };

  const handleLogout = () => { logout(); navigate('/login'); };
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2) || 'U';
  const roleLabel = user?.role === 'rm' ? 'Relationship Manager'
    : user?.role === 'supervisor' ? 'Supervisor'
    : user?.role === 'admin'      ? 'Administrator'
    : user?.role === 'team_leader' ? 'Team Leader'
    : user?.role || '';

  const rmMenu = [
    { section: 'OVERVIEW', items: [
      { path: '/rm-dashboard',    label: 'My Dashboard',    icon: '⊞' },
      { path: '/ai-digest',       label: 'AI Daily Digest', icon: '◆', badge: counts.ai_digest || null },
    ]},
    { section: 'MY LEADS', items: [
      { path: '/to-call-today',   label: 'To Call Today',   icon: '◎', badge: counts.to_call || null },
      { path: '/assigned-leads',  label: 'Assigned Leads',  icon: '★', badge: counts.assigned_leads || null },
      { path: '/contact-log',     label: 'Contact & Log',   icon: '✎' },
    ]},
    { section: 'MY CLIENTS', items: [
      { path: '/mapped-clients',  label: 'Mapped Clients',  icon: '◈' },
      { path: '/client-360',      label: 'Client 360',      icon: '○' },
      { path: '/dormant-clients', label: 'Dormant Clients', icon: '◑', badge: counts.dormant || null },
    ]},
    { section: 'REVENUE', items: [
      { path: '/revenue-tracker', label: 'Revenue Tracker', icon: '↑' },
      { path: '/cross-sell',      label: 'Cross-sell Opps', icon: '⇄' },
    ]},
    { section: 'ACTIVITY', items: [
      { path: '/interaction-log', label: 'Interaction Log', icon: '≡' },
      { path: '/my-performance',  label: 'My Performance',  icon: '⬟' },
    ]},
  ];

  const supervisorMenu = [
    { section: 'OVERVIEW', items: [
      { path: '/supervisor-dashboard', label: 'Company Dashboard', icon: '⊞' },
      { path: '/ai-insights',          label: 'AI Insights',       icon: '◆' },
    ]},
    { section: 'APPROVALS', items: [
      { path: '/mapping-approvals', label: 'Mapping Approvals', icon: '✓', badge: counts.mapping_approvals || null },
      { path: '/unmap-requests',    label: 'Unmap Requests',    icon: '○', badge: counts.unmap_requests   || null },
    ]},
    { section: 'CLIENT UNIVERSE', items: [
      { path: '/all-clients',   label: 'All Clients',   icon: '◈' },
      { path: '/unmapped-pool', label: 'Unmapped Pool', icon: '◉' },
      { path: '/client-360',    label: 'Client 360',    icon: '○' },
    ]},
    { section: 'RM MANAGEMENT', items: [
      { path: '/rm-performance', label: 'RM Performance', icon: '⬟' },
      { path: '/lead-pipeline',  label: 'Lead Pipeline',  icon: '⇢' },
    ]},
    { section: 'REPORTS', items: [
      { path: '/daily-mis',          label: 'Corporate Daily MIS',   icon: '▦' },
      { path: '/options-analytics',  label: 'Options Analytics',     icon: '◎' },
      { path: '/revenue-float',      label: 'Revenue & Float',       icon: '◈' },
      { path: '/client-analytics',   label: 'Client Analytics',      icon: '↗' },
      { path: '/retention',          label: 'Retention & Cohorts',   icon: '⟳' },
      { path: '/concentration-risk', label: 'Concentration Risk',    icon: '⚡' },
      { path: '/inactive-dp',        label: 'Inactive & DP',         icon: '◑' },
      { path: '/revenue-ramp',       label: 'Revenue Ramp',          icon: '↑' },
      { path: '/market-share',       label: 'Market Share',          icon: '◔' },
      { path: '/new-business',       label: 'New Business',          icon: '⊕' },
      { path: '/rm-impact',          label: 'RM Impact',             icon: '⇄' },
    ]},
  ];

  const adminMenu = [
    { section: 'DATA MANAGEMENT', items: [
      { path: '/import', label: 'Daily Data Import', icon: '↑' },
      { path: '/users',  label: 'Users & Roles',     icon: '◈' },
    ]},
    { section: 'AI CONFIGURATION', items: [
      { path: '/ai-scoring',       label: 'AI Scoring Weights', icon: '◆' },
      { path: '/commission-rates', label: 'Commission Rates',   icon: '◎' },
    ]},
    { section: 'INTEGRATIONS', items: [
      { path: '/api-integrations', label: 'API Integrations', icon: '⇄' },
      { path: '/email-templates',  label: 'Email Templates',  icon: '✉' },
    ]},
    { section: 'SYSTEM', items: [
      { path: '/rm-pipeline',     label: 'RM & Pipeline',        icon: '⚙' },
      { path: '/mis-settings',    label: 'MIS Settings',          icon: '▦' },
      { path: '/client-insights', label: 'Client Insight Email',  icon: '◉' },
      { path: '/nudge-settings',  label: 'Nudge Settings',        icon: '◎' },
      { path: '/audit-log',       label: 'Audit Log',             icon: '≡' },
    ]},
  ];

  // A user can hold admin + supervisor access on one login: role stays 'admin'
  // (route guards already permit admin on every supervisor page) and the flag
  // permissions.dual_supervisor = true makes BOTH menus show in the sidebar.
  const parsePerms = (p) => { if (!p) return null; if (typeof p === 'object') return p; try { return JSON.parse(p); } catch (e) { return null; } };
  const dualSupervisor = user?.role === 'admin' && parsePerms(user?.permissions)?.dual_supervisor === true;

  // Switch view for dual-access users; remember the choice and jump to that view's home.
  const switchView = (mode) => {
    setViewMode(mode);
    localStorage.setItem('viewMode', mode);
    navigate(mode === 'supervisor' ? '/supervisor-dashboard' : '/import');
  };

  const getMenu = () => {
    if (user?.role === 'rm' || user?.role === 'team_leader') return rmMenu;
    if (user?.role === 'admin') {
      // Dual-access users toggle between the Admin menu and the Supervisor menu.
      if (dualSupervisor) return viewMode === 'supervisor' ? supervisorMenu : adminMenu;
      return adminMenu;
    }
    if (user?.role === 'supervisor') {
      return supervisorMenu.map(section => ({
        ...section,
        items: section.items.filter(item => isPathAllowed(user, item.path))
      })).filter(section => section.items.length > 0);
    }
    return [];
  };

  const menu = getMenu();

  return (
    <div className="app-layout">

      {/* ── Sidebar ── */}
      <aside className="sidebar">

        {/* Logo */}
        <div className="sb-logo">
          <h1>Navia ClientIQ</h1>
          <p>Strategic MIS · FY 2026-27</p>
        </div>

        {/* Admin ⇄ Supervisor view toggle (only for dual-access users) */}
        {dualSupervisor && (
          <div style={{ display: 'flex', gap: 4, margin: '0 12px 8px', padding: 3,
                        background: 'rgba(255,255,255,0.08)', borderRadius: 8 }}>
            {[['admin', 'Admin'], ['supervisor', 'Supervisor']].map(([mode, label]) => (
              <button key={mode} onClick={() => switchView(mode)} style={{
                flex: 1, padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)',
                background: viewMode === mode ? '#ED4D37' : 'transparent',
                color: viewMode === mode ? '#fff' : 'rgba(255,255,255,0.65)',
                transition: 'background 0.15s',
              }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {menu.map(section => (
            <div key={section.section} className="sb-section">
              <div className="sb-section-label">{section.section}</div>
              {section.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `sb-item${isActive ? ' active' : ''}`}
                >
                  <span style={{ fontSize: '14px', width: '16px', textAlign: 'center', flexShrink: 0 }}>
                    {item.icon}
                  </span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge > 0 && (
                    <span className="sb-badge">{item.badge}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="sb-footer">
          <div className="sb-user" onClick={() => setShowMenu(m => !m)} style={{ position: 'relative' }}>
            <div className="sb-avatar">{initials}</div>
            <div className="sb-user-info">
              <div className="sb-user-name">{user?.name || 'User'}</div>
              <div className="sb-user-role">{roleLabel}</div>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>▲</span>
          </div>
          {showMenu && (
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 6px)', left: '10px', right: '10px',
              background: '#FFFFFF', borderRadius: 'var(--r2)', boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--br)', zIndex: 300, overflow: 'hidden',
            }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--br)' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--tx)' }}>{user?.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--tx3)', marginTop: '1px' }}>{user?.email || roleLabel}</div>
              </div>
              <button onClick={() => { setShowMenu(false); setShowPwdModal(true); }} style={{
                width: '100%', padding: '10px 14px', background: 'none', border: 'none',
                borderBottom: '1px solid var(--br)', cursor: 'pointer', textAlign: 'left',
                fontSize: '13px', color: 'var(--tx)', fontFamily: 'var(--font)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                🔑 Change password
              </button>
              <button onClick={handleLogout} style={{
                width: '100%', padding: '10px 14px', background: 'none', border: 'none',
                cursor: 'pointer', textAlign: 'left', fontSize: '13px', color: 'var(--dc)',
                fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                ⎋ Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {showPwdModal && <ChangePasswordModal onClose={() => setShowPwdModal(false)} />}

      {/* ── Topbar ── */}
      <header className="topbar">
        <span className="topbar-logo">Navia ClientIQ</span>
        <div className="topbar-sep" />
        <span className="topbar-title" />
        <span className="topbar-role">{roleLabel.toUpperCase()}</span>
      </header>

      {/* ── Main ── */}
      <main className="main-content">
        <Outlet />
      </main>

    </div>
  );
};

// ── Change-password modal (any logged-in user) ──────────────────────────────
const ChangePasswordModal = ({ onClose }) => {
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState(null);   // { ok, text }
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (nw.length < 8) return setMsg({ ok: false, text: 'New password must be at least 8 characters.' });
    if (nw !== confirm) return setMsg({ ok: false, text: 'New passwords do not match.' });
    setSaving(true);
    try {
      const res = await api.post('/auth/change-password', { current_password: cur, new_password: nw });
      setMsg({ ok: true, text: res.data.message || 'Password changed successfully.' });
      setCur(''); setNw(''); setConfirm('');
      setTimeout(onClose, 1200);
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.message || 'Could not change password.' });
    } finally {
      setSaving(false);
    }
  };

  const inp = { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'var(--font)' };
  const lbl = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', margin: '0 0 6px' };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 400,
        padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: '#EEF2FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>🔑</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#223872' }}>Change password</div>
        </div>
        <div style={{ fontSize: 12, color: '#888', margin: '8px 0 18px' }}>Choose a new password for your account.</div>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Current password</label>
            <input type={show ? 'text' : 'password'} value={cur} onChange={e => setCur(e.target.value)} required style={inp} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>New password</label>
            <input type={show ? 'text' : 'password'} value={nw} onChange={e => setNw(e.target.value)} required style={inp} placeholder="At least 8 characters" />
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={lbl}>Confirm new password</label>
            <input type={show ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} required style={inp} />
            {confirm.length > 0 && nw !== confirm &&
              <div style={{ fontSize: 12, color: '#B42318', fontWeight: 600, marginTop: 6 }}>Passwords do not match.</div>}
            {confirm.length > 0 && nw === confirm && nw.length >= 8 &&
              <div style={{ fontSize: 12, color: '#187A3E', fontWeight: 600, marginTop: 6 }}>✓ Passwords match.</div>}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555', margin: '12px 0 16px', cursor: 'pointer' }}>
            <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)}
              style={{ width: 16, height: 16, flexShrink: 0, margin: 0, accentColor: '#223872', cursor: 'pointer' }} />
            <span>Show passwords</span>
          </label>

          {msg && (
            <div style={{
              background: msg.ok ? '#E7F7EE' : '#FEE2E2', color: msg.ok ? '#1B7A46' : '#DC2626',
              padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 14,
            }}>{msg.text}</div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '11px', background: '#fff', color: '#555', border: '1px solid #ddd',
              borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
            }}>Cancel</button>
            {(() => {
              const disabled = saving || !cur || !nw || !confirm;
              return (
                <button type="submit" disabled={disabled} style={{
                  flex: 1, padding: '11px', background: disabled ? '#B6C0D0' : '#223872', color: '#fff',
                  border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                  cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)',
                }}>{saving ? 'Saving…' : 'Update password'}</button>
              );
            })()}
          </div>
        </form>
      </div>
    </div>
  );
};

export default Layout;