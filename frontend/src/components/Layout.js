import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Layout = () => {
  const { user, logout } = useAuth();
  const [showMenu, setShowMenu] = React.useState(false);
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2) || 'U';

  const rmMenu = [
    { section: 'OVERVIEW', items: [
      { path: '/rm-dashboard', label: 'My Dashboard', icon: '🏠' },
      { path: '/ai-digest', label: 'AI Daily Digest', icon: '🤖' },
    ]},
    { section: 'MY LEADS', items: [
      { path: '/to-call-today', label: 'To Call Today', icon: '📞' },
      { path: '/assigned-leads', label: 'Assigned Leads', icon: '⭐' },
      { path: '/contact-log', label: 'Contact & Log', icon: '📝' },
    ]},
    { section: 'MY CLIENTS', items: [
      { path: '/mapped-clients', label: 'Mapped Clients', icon: '👥' },
      { path: '/client-360', label: 'Client 360', icon: '👤' },
      { path: '/dormant-clients', label: 'Dormant Clients', icon: '🌙' },
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
      { path: '/mapping-approvals', label: 'Mapping Approvals', icon: '✅' },
      { path: '/unmap-requests', label: 'Unmap Requests', icon: '👤' },
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
    if (user?.role === 'supervisor') return supervisorMenu;
    if (user?.role === 'admin') return adminMenu;
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

  const getRoleShort = () => {
    const labels = {
      rm: 'RM',
      team_leader: 'Team Leader',
      supervisor: 'Supervisor',
      admin: 'Admin'
    };
    return labels[user?.role] || user?.role;
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* Sidebar — exact prototype match */}
      <aside style={{
        width: 'var(--sw)', minWidth: 'var(--sw)',
        background: 'var(--bg)',
        borderRight: '.5px solid var(--br)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto', overflowX: 'hidden', flexShrink: 0
      }}>
        {/* Logo */}
        <div style={{ padding: '14px 16px', borderBottom: '.5px solid var(--br)' }}>
          <div style={{ fontSize: '16px', fontWeight: '700', letterSpacing: '-.5px', color: 'var(--ic)' }}>
            Navia ClientIQ
          </div>
          <div style={{ fontSize: '10px', color: 'var(--tx3)', marginTop: '2px' }}>
            Strategic MIS · FY 2026-27
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px 2px' }}>
          {getMenu().map(section => (
            <div key={section.section} style={{ marginBottom: '4px' }}>
              <div style={{
                fontSize: '9px', fontWeight: '600', color: 'var(--tx3)',
                letterSpacing: '.8px', textTransform: 'uppercase',
                padding: '0 8px', marginBottom: '3px', marginTop: '10px'
              }}>
                {section.section}
              </div>
              {section.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '7px 8px', borderRadius: 'var(--r)',
                    cursor: 'pointer', fontSize: '12.5px',
                    color: isActive ? 'var(--ic)' : 'var(--tx2)',
                    background: isActive ? 'var(--ibg)' : 'transparent',
                    fontWeight: isActive ? '500' : 'normal',
                    textDecoration: 'none', transition: 'all .1s',
                    border: 'none', width: '100%'
                  })}
                >
                  <span style={{ fontSize: '14px', width: '18px', flexShrink: 0 }}>
                    {item.icon}
                  </span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div style={{ marginTop: 'auto', padding: '10px 8px', borderTop: '.5px solid var(--br)' }}>
          <div
            onClick={() => setShowMenu(!showMenu)}
            style={{ position: 'relative', cursor: 'pointer' }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 8px', borderRadius: 'var(--r)'
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'var(--ibg)', color: 'var(--ic)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: '600', flexShrink: 0
              }}>
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '12px', fontWeight: '500', color: 'var(--tx)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                  {user?.name}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--tx3)' }}>
                  {getRoleLabel()}
                </div>
              </div>
            </div>

            {showMenu && (
              <div style={{
                position: 'absolute', bottom: '44px', left: 0, right: 0,
                background: 'var(--bg)', border: '.5px solid var(--br)',
                borderRadius: 'var(--r2)', padding: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 200
              }}>
                <div style={{
                  padding: '6px 10px', fontSize: '11px', color: 'var(--tx3)',
                  borderBottom: '.5px solid var(--br)', marginBottom: '4px'
                }}>
                  {user?.email}
                </div>
                <div
                  onClick={e => { e.stopPropagation(); handleLogout(); }}
                  style={{
                    padding: '7px 10px', fontSize: '12.5px',
                    cursor: 'pointer', color: 'var(--dc)',
                    borderRadius: 'var(--r)',
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--dbg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  🚪 Sign out
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Topbar */}
      <div style={{
        position: 'fixed', top: 0, left: 'var(--sw)', right: 0, height: '48px',
        background: 'var(--bg)', borderBottom: '.5px solid var(--br)',
        display: 'flex', alignItems: 'center', padding: '0 20px',
        gap: '10px', zIndex: 100
      }}>
        <span style={{ fontSize: '14px', fontWeight: '500', flex: 1, color: 'var(--tx)' }}>
          Navia ClientIQ
        </span>
        <span style={{
          fontSize: '11px', background: 'var(--ibg)', color: 'var(--ic)',
          padding: '3px 10px', borderRadius: '20px', fontWeight: '500'
        }}>
          {getRoleShort().toUpperCase()}
        </span>
      </div>

      {/* Main content */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '72px 24px 40px',
        background: 'var(--bg3)'
      }}>
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;