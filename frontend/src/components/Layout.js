import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Maps permission checkbox IDs (from Users.js) to sidebar paths
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

// Check if a sidebar path is allowed for this user
function isPathAllowed(user, path) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'rm' || user.role === 'team_leader') return true;

  if (user.role === 'supervisor') {
    // If individual permissions were saved (from checkbox selections), use them
    if (user.permissions && typeof user.permissions === 'object' && Object.keys(user.permissions).length > 0) {
      const permId = Object.entries(PERM_PATH_MAP).find(([, p]) => p === path)?.[0];
      if (!permId) return true; // path not in map = always allow
      return !!user.permissions[permId];
    }

    // Fall back to sub_role template if no individual permissions saved
    const tmpl = user.supervisor_sub_role || 'rm-supervisor';
    if (tmpl === 'rm-supervisor') return true;
    if (tmpl === 'ops-head') {
      return !['/mapping-approvals', '/unmap-requests', '/rm-performance', '/lead-pipeline'].includes(path);
    }
    if (tmpl === 'finance-head') {
      return [
        '/supervisor-dashboard', '/daily-mis',
        '/revenue-float', '/concentration-risk', '/market-share', '/revenue-ramp'
      ].includes(path);
    }
    // custom with no permissions saved = full access (admin will configure)
    return true;
  }
  return false;
}

const Layout = () => {
  const { user, logout } = useAuth();
  const [showMenu, setShowMenu] = React.useState(false);
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';

  const rmMenu = [
    { section: 'OVERVIEW', items: [
      { path: '/rm-dashboard', label: 'My Dashboard', icon: '🏠' },
      { path: '/ai-digest', label: 'AI Daily Digest', icon: '🤖', badge: '3' },
    ]},
    { section: 'MY LEADS', items: [
      { path: '/to-call-today', label: 'To Call Today', icon: '📞', badge: '12' },
      { path: '/assigned-leads', label: 'Assigned Leads', icon: '⭐', badge: '7' },
      { path: '/contact-log', label: 'Contact & Log', icon: '📝' },
    ]},
    { section: 'MY CLIENTS', items: [
      { path: '/mapped-clients', label: 'Mapped Clients', icon: '👥' },
      { path: '/client-360', label: 'Client 360', icon: '👤' },
      { path: '/dormant-clients', label: 'Dormant Clients', icon: '🌙', badge: '4' },
    ]},
    { section: 'REVENUE', items: [
      { path: '/revenue-tracker', label: 'Revenue Tracker', icon: '📈' },
      { path: '/cross-sell', label: 'Cross-sell Opps', icon: '🔀' },
    ]},
    { section: 'ACTIVITY', items: [
      { path: '/interaction-log', label: 'Interaction Log', icon: '📋' },
      { path: '/my-performance', label: 'My Performance', icon: '🏆' },
    ]},
  ];

  const supervisorMenu = [
    { section: 'OVERVIEW', items: [
      { path: '/supervisor-dashboard', label: 'Company Dashboard', icon: '🏠' },
      { path: '/ai-insights', label: 'AI Insights', icon: '🤖' },
    ]},
    { section: 'APPROVALS', items: [
      { path: '/mapping-approvals', label: 'Mapping Approvals', icon: '✅', badge: '5' },
      { path: '/unmap-requests', label: 'Unmap Requests', icon: '👤', badge: '2' },
    ]},
    { section: 'CLIENT UNIVERSE', items: [
      { path: '/all-clients', label: 'All Clients', icon: '🌍' },
      { path: '/unmapped-pool', label: 'Unmapped Pool', icon: '❓' },
      { path: '/client-360', label: 'Client 360', icon: '👤' },
    ]},
    { section: 'RM MANAGEMENT', items: [
      { path: '/rm-performance', label: 'RM Performance', icon: '🏆' },
      { path: '/lead-pipeline', label: 'Lead Pipeline', icon: '⭐' },
    ]},
    { section: 'REPORTS', items: [
      { path: '/daily-mis', label: 'Corporate Daily MIS', icon: '🏢' },
      { path: '/options-analytics', label: 'Options Analytics', icon: '📊' },
      { path: '/revenue-float', label: 'Revenue & Float', icon: '💰' },
      { path: '/client-analytics', label: 'Client Analytics', icon: '👥' },
      { path: '/retention', label: 'Retention & Cohorts', icon: '🔄' },
      { path: '/concentration-risk', label: 'Concentration Risk', icon: '⚠️' },
      { path: '/inactive-dp', label: 'Inactive & DP Holdings', icon: '😴' },
      { path: '/revenue-ramp', label: 'Client Revenue Ramp', icon: '📈' },
      { path: '/market-share', label: 'Market Share', icon: '🥧' },
      { path: '/new-business', label: 'New Business', icon: '🚀' },
      { path: '/rm-impact', label: 'RM Impact', icon: '↔️' },
    ]},
  ];

  const adminMenu = [
    { section: 'DATA MANAGEMENT', items: [
      { path: '/import', label: 'Daily Data Import', icon: '📁' },
      { path: '/users', label: 'Users & Roles', icon: '👥' },
    ]},
    { section: 'AI CONFIGURATION', items: [
      { path: '/ai-scoring', label: 'AI Scoring Weights', icon: '🤖' },
      { path: '/commission-rates', label: 'Commission Rates', icon: '💹' },
    ]},
    { section: 'INTEGRATIONS', items: [
      { path: '/api-integrations', label: 'API Integrations', icon: '🔌' },
      { path: '/email-templates', label: 'Email Templates', icon: '📧' },
    ]},
    { section: 'SYSTEM', items: [
      { path: '/rm-pipeline', label: 'RM & Pipeline', icon: '⚙️' },
      { path: '/mis-settings', label: 'MIS Settings', icon: '🎛️' },
      { path: '/client-insights', label: 'Client Insight Email', icon: '📨' },
      { path: '/nudge-settings', label: 'Nudge Settings', icon: '🔔' },
    ]},
  ];

  const getMenu = () => {
    if (user?.role === 'rm' || user?.role === 'team_leader') return rmMenu;
    if (user?.role === 'admin') return adminMenu;
    if (user?.role === 'supervisor') {
      // Filter every sidebar item based on this user's saved permissions
      return supervisorMenu
        .map(section => ({
          ...section,
          items: section.items.filter(item => isPathAllowed(user, item.path))
        }))
        .filter(section => section.items.length > 0); // hide sections with no allowed items
    }
    return [];
  };

  const getRoleLabel = () => {
    const labels = {
      rm: 'Relationship Manager',
      team_leader: 'Team Leader',
      supervisor: 'Supervisor',
      admin: 'Administrator'
    };
    return labels[user?.role] || user?.role;
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "-apple-system,'Segoe UI',system-ui,sans-serif" }}>

      {/* Sidebar */}
      <aside style={{
        width: '228px', minWidth: '228px', background: '#fff',
        borderRight: '0.5px solid rgba(0,0,0,0.1)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto', overflowX: 'hidden', flexShrink: 0
      }}>
        {/* Logo */}
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '16px', fontWeight: '800', letterSpacing: '-0.5px', color: '#223872', fontFamily: "'Sora', sans-serif" }}>
            Navia ClientIQ
          </div>
          <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>Strategic MIS · FY 2026-27</div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '10px 8px 2px' }}>
          {getMenu().map((section) => (
            <div key={section.section} style={{ marginBottom: '4px' }}>
              <div style={{
                fontSize: '9px', fontWeight: '600', color: '#999',
                letterSpacing: '0.8px', textTransform: 'uppercase',
                padding: '0 8px', marginBottom: '3px', marginTop: '10px'
              }}>
                {section.section}
              </div>
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '7px 8px', borderRadius: '6px',
                    cursor: 'pointer', fontSize: '12.5px',
                    color: isActive ? '#223872' : '#45526B',
                    background: isActive ? '#EDEFF6' : 'transparent',
                    fontWeight: isActive ? '500' : 'normal',
                    textDecoration: 'none', transition: 'all 0.1s'
                  })}
                >
                  <span style={{ fontSize: '14px', width: '18px', flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge && (
                    <span style={{
                      marginLeft: 'auto', background: '#EDEFF6', color: '#223872',
                      fontSize: '10px', fontWeight: '600', padding: '1px 6px', borderRadius: '10px'
                    }}>
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div style={{ marginTop: 'auto', padding: '10px 8px', borderTop: '0.5px solid rgba(0,0,0,0.1)' }}>
          <div
            onClick={() => setShowMenu(!showMenu)}
            style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px' }}
          >
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: '#223872', color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', fontWeight: '600', flexShrink: 0
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: '500', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name}
              </div>
              <div style={{ fontSize: '10px', color: '#999' }}>{getRoleLabel()}</div>
            </div>
            <span style={{ fontSize: '10px', color: '#999' }}>⌃</span>

            {showMenu && (
              <div style={{
                position: 'absolute', bottom: '44px', left: 0, right: 0,
                background: '#FFFFFF', border: '1px solid #E6EBF2',
                borderRadius: '8px', padding: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 200
              }}>
                <div style={{ padding: '6px 10px', fontSize: '11px', color: '#999', borderBottom: '0.5px solid rgba(0,0,0,0.1)', marginBottom: '4px' }}>
                  {user?.email}
                </div>
                <div
                  onClick={(e) => { e.stopPropagation(); handleLogout(); }}
                  style={{ padding: '7px 10px', fontSize: '12.5px', cursor: 'pointer', color: '#a32d2d', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fcebeb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  🚪 Logout
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Topbar */}
      <div style={{
        position: 'fixed', top: 0, left: '228px', right: 0, height: '48px',
        background: '#FFFFFF', borderBottom: '1px solid #E6EBF2',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: '10px', zIndex: 100
      }}>
        <span style={{ fontSize: '14px', fontWeight: '500', flex: 1, color: '#111' }}>
          Navia ClientIQ
        </span>
        <span style={{
          fontSize: '11px', background: '#ED4D37', color: '#FFFFFF',
          padding: '3px 10px', borderRadius: '20px', fontWeight: '500'
        }}>
          {getRoleLabel().toUpperCase()}
        </span>
      </div>

      {/* Main Content */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '72px 24px 40px',
        background: '#F7F9FC'
      }}>
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;