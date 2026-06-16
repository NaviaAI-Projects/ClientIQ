import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';

// RM Pages
import RMDashboard from './pages/RMDashboard';
import AiDigest from './pages/AiDigest';
import ToCallToday from './pages/ToCallToday';
import AssignedLeads from './pages/AssignedLeads';
import ContactLog from './pages/ContactLog';
import MappedClients from './pages/MappedClients';
import Client360 from './pages/Client360';
import DormantClients from './pages/DormantClients';
import RevenueTracker from './pages/RevenueTracker';
import CrossSell from './pages/CrossSell';
import InteractionLog from './pages/InteractionLog';
import MyPerformance from './pages/MyPerformance';

// Supervisor Pages
import SupervisorDashboard from './pages/SupervisorDashboard';
import AiInsights from './pages/AiInsights';
import MappingApprovals from './pages/MappingApprovals';
import UnmapRequests from './pages/UnmapRequests';
import AllClients from './pages/AllClients';
import UnmappedPool from './pages/UnmappedPool';
import RMPerformance from './pages/RMPerformance';
import LeadPipeline from './pages/LeadPipeline';
import DailyMIS from './pages/DailyMIS';
import OptionsAnalytics from './pages/OptionsAnalytics';
import RevenueFloat from './pages/RevenueFloat';
import ClientAnalytics from './pages/ClientAnalytics';
import Retention from './pages/Retention';
import ConcentrationRisk from './pages/ConcentrationRisk';
import InactiveDP from './pages/InactiveDP';
import RevenueRamp from './pages/RevenueRamp';
import MarketShare from './pages/MarketShare';
import NewBusiness from './pages/NewBusiness';
import RMImpact from './pages/RMImpact';

// Admin Pages
import ImportData from './pages/ImportData';
import Users from './pages/Users';
import AiScoring from './pages/AiScoring';
import CommissionRates from './pages/CommissionRates';
import ApiIntegrations from './pages/ApiIntegrations';
import EmailTemplates from './pages/EmailTemplates';
import RMPipeline from './pages/RMPipeline';
import MISSettings from './pages/MISSettings';
import ClientInsights from './pages/ClientInsights';
import NudgeSettings from './pages/NudgeSettings';

const PrivateRoute = ({ children, roles }) => {
  const { user, token } = useAuth();
  if (!token) return <Navigate to="/login" />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/" />;
  return children;
};

const HomeRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (user.role === 'rm' || user.role === 'team_leader') return <Navigate to="/rm-dashboard" />;
  if (user.role === 'supervisor') return <Navigate to="/supervisor-dashboard" />;
  if (user.role === 'admin') return <Navigate to="/import" />;
  return <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<HomeRedirect />} />

            {/* RM Routes */}
            <Route path="rm-dashboard" element={<PrivateRoute roles={['rm','team_leader']}><RMDashboard /></PrivateRoute>} />
            <Route path="ai-digest" element={<PrivateRoute roles={['rm','team_leader']}><AiDigest /></PrivateRoute>} />
            <Route path="to-call-today" element={<PrivateRoute roles={['rm','team_leader']}><ToCallToday /></PrivateRoute>} />
            <Route path="assigned-leads" element={<PrivateRoute roles={['rm','team_leader']}><AssignedLeads /></PrivateRoute>} />
            <Route path="contact-log" element={<PrivateRoute roles={['rm','team_leader']}><ContactLog /></PrivateRoute>} />
            <Route path="mapped-clients" element={<PrivateRoute roles={['rm','team_leader']}><MappedClients /></PrivateRoute>} />
            <Route path="client-360" element={<PrivateRoute><Client360 /></PrivateRoute>} />
            <Route path="dormant-clients" element={<PrivateRoute roles={['rm','team_leader']}><DormantClients /></PrivateRoute>} />
            <Route path="revenue-tracker" element={<PrivateRoute roles={['rm','team_leader']}><RevenueTracker /></PrivateRoute>} />
            <Route path="cross-sell" element={<PrivateRoute roles={['rm','team_leader']}><CrossSell /></PrivateRoute>} />
            <Route path="interaction-log" element={<PrivateRoute roles={['rm','team_leader']}><InteractionLog /></PrivateRoute>} />
            <Route path="my-performance" element={<PrivateRoute roles={['rm','team_leader']}><MyPerformance /></PrivateRoute>} />

            {/* Supervisor Routes */}
            <Route path="supervisor-dashboard" element={<PrivateRoute roles={['supervisor','admin']}><SupervisorDashboard /></PrivateRoute>} />
            <Route path="ai-insights" element={<PrivateRoute roles={['supervisor','admin']}><AiInsights /></PrivateRoute>} />
            <Route path="mapping-approvals" element={<PrivateRoute roles={['supervisor','admin']}><MappingApprovals /></PrivateRoute>} />
            <Route path="unmap-requests" element={<PrivateRoute roles={['supervisor','admin']}><UnmapRequests /></PrivateRoute>} />
            <Route path="all-clients" element={<PrivateRoute roles={['supervisor','admin']}><AllClients /></PrivateRoute>} />
            <Route path="unmapped-pool" element={<PrivateRoute roles={['supervisor','admin']}><UnmappedPool /></PrivateRoute>} />
            <Route path="rm-performance" element={<PrivateRoute roles={['supervisor','admin']}><RMPerformance /></PrivateRoute>} />
            <Route path="lead-pipeline" element={<PrivateRoute roles={['supervisor','admin']}><LeadPipeline /></PrivateRoute>} />
            <Route path="daily-mis" element={<PrivateRoute roles={['supervisor','admin']}><DailyMIS /></PrivateRoute>} />
            <Route path="options-analytics" element={<PrivateRoute roles={['supervisor','admin']}><OptionsAnalytics /></PrivateRoute>} />
            <Route path="revenue-float" element={<PrivateRoute roles={['supervisor','admin']}><RevenueFloat /></PrivateRoute>} />
            <Route path="client-analytics" element={<PrivateRoute roles={['supervisor','admin']}><ClientAnalytics /></PrivateRoute>} />
            <Route path="retention" element={<PrivateRoute roles={['supervisor','admin']}><Retention /></PrivateRoute>} />
            <Route path="concentration-risk" element={<PrivateRoute roles={['supervisor','admin']}><ConcentrationRisk /></PrivateRoute>} />
            <Route path="inactive-dp" element={<PrivateRoute roles={['supervisor','admin']}><InactiveDP /></PrivateRoute>} />
            <Route path="revenue-ramp" element={<PrivateRoute roles={['supervisor','admin']}><RevenueRamp /></PrivateRoute>} />
            <Route path="market-share" element={<PrivateRoute roles={['supervisor','admin']}><MarketShare /></PrivateRoute>} />
            <Route path="new-business" element={<PrivateRoute roles={['supervisor','admin']}><NewBusiness /></PrivateRoute>} />
            <Route path="rm-impact" element={<PrivateRoute roles={['supervisor','admin']}><RMImpact /></PrivateRoute>} />

            {/* Admin Routes */}
            <Route path="import" element={<PrivateRoute roles={['admin']}><ImportData /></PrivateRoute>} />
            <Route path="users" element={<PrivateRoute roles={['admin']}><Users /></PrivateRoute>} />
            <Route path="ai-scoring" element={<PrivateRoute roles={['admin']}><AiScoring /></PrivateRoute>} />
            <Route path="commission-rates" element={<PrivateRoute roles={['admin']}><CommissionRates /></PrivateRoute>} />
            <Route path="api-integrations" element={<PrivateRoute roles={['admin']}><ApiIntegrations /></PrivateRoute>} />
            <Route path="email-templates" element={<PrivateRoute roles={['admin']}><EmailTemplates /></PrivateRoute>} />
            <Route path="rm-pipeline" element={<PrivateRoute roles={['admin']}><RMPipeline /></PrivateRoute>} />
            <Route path="mis-settings" element={<PrivateRoute roles={['admin']}><MISSettings /></PrivateRoute>} />
            <Route path="client-insights" element={<PrivateRoute roles={['admin']}><ClientInsights /></PrivateRoute>} />
            <Route path="nudge-settings" element={<PrivateRoute roles={['admin']}><NudgeSettings /></PrivateRoute>} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;