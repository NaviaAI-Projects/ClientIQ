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
        const [leadsRes] = await Promise.all([api.get('/leads/my')]);
        const leads = leadsRes.data || [];
        setCounts(prev => ({
          ...prev,
          to_call:        leads.length,
          assigned_leads: leads.length,
          ai_digest:      leads.filter(l => l.lead_score >= 50).length,
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

  const getMenu = () => {
    if (user?.role === 'rm' || user?.role === 'team_leader') return rmMenu;
    if (user?.role === 'admin') return adminMenu;
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
              position: 'absolute', bottom: '70px', left: '12px', right: '12px',
              background: '#FFFFFF', borderRadius: 'var(--r2)', boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--br)', zIndex: 300, overflow: 'hidden',
            }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--br)' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--tx)' }}>{user?.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--tx3)', marginTop: '1px' }}>{user?.email || roleLabel}</div>
              </div>
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

export default Layout;