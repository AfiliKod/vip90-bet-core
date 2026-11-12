import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { usePlatformAuthStore } from './store/authStore.js';
import { authApi } from './api/client.js';
import Layout from './components/layout/Layout.jsx';
import Login from './pages/Login.jsx';
import Setup2fa from './pages/Setup2fa.jsx';
import AcceptInvite from './pages/AcceptInvite.jsx';
import Dashboard from './pages/Dashboard.jsx';
import TenantsList from './pages/TenantsList.jsx';
import TenantProvision from './pages/TenantProvision.jsx';
import TenantDetail from './pages/TenantDetail.jsx';
import DomainsList from './pages/DomainsList.jsx';
import PartnersList from './pages/PartnersList.jsx';
import PartnerDetail from './pages/PartnerDetail.jsx';
import PartnerDashboard from './pages/partner/PartnerDashboard.jsx';
import PartnerTenantsList from './pages/partner/PartnerTenantsList.jsx';
import PartnerTenantProvision from './pages/partner/PartnerTenantProvision.jsx';
import PartnerTenantDetail from './pages/partner/PartnerTenantDetail.jsx';
import PartnerStaff from './pages/partner/PartnerStaff.jsx';
import BillingDashboard from './pages/billing/BillingDashboard.jsx';
import StatementsList from './pages/billing/StatementsList.jsx';
import StatementDetail from './pages/billing/StatementDetail.jsx';
import OperatorFeePlans from './pages/billing/OperatorFeePlans.jsx';
import PlatformReports from './pages/reports/PlatformReports.jsx';

function ProtectedRoute({ children }) {
  const { isAuthenticated, requires2faSetup } = usePlatformAuthStore();

  if (requires2faSetup) {
    return <Navigate to="/setup-2fa" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function TenantDetailRoute() {
  const { id } = useParams();
  return <TenantDetail key={id} tenantId={id} />;
}

function PartnerDetailRoute() {
  const { id } = useParams();
  return <PartnerDetail key={id} partnerId={id} />;
}

function PartnerTenantDetailRoute() {
  const { id } = useParams();
  return <PartnerTenantDetail key={id} tenantId={id} />;
}

function StatementDetailRoute() {
  const { id } = useParams();
  return <StatementDetail key={id} statementId={id} />;
}

function PlatformRoute({ children }) {
  const staff = usePlatformAuthStore((s) => s.staff);
  if (staff?.scope === 'partner') {
    return <Navigate to="/partner" replace />;
  }
  return children;
}

function PartnerRoute({ children }) {
  const staff = usePlatformAuthStore((s) => s.staff);
  if (staff?.scope !== 'partner') {
    return <Navigate to="/" replace />;
  }
  return children;
}

function IndexRoute() {
  const staff = usePlatformAuthStore((s) => s.staff);
  if (staff?.scope === 'partner') {
    return <Navigate to="/partner" replace />;
  }
  return <Dashboard />;
}

export default function App() {
  const { accessToken, setStaff, isAuthenticated } = usePlatformAuthStore();

  useEffect(() => {
    if (accessToken && isAuthenticated) {
      authApi.me().then((data) => {
        if (data?.staff) setStaff(data.staff);
      }).catch(() => {
        // Handled by client interceptor if token is expired
      });
    }
  }, [accessToken, isAuthenticated, setStaff]);

  return (
    <BrowserRouter basename="/console">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup-2fa" element={<Setup2fa />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {/* Platform views */}
          <Route index element={<IndexRoute />} />
          <Route path="tenants" element={<PlatformRoute><TenantsList /></PlatformRoute>} />
          <Route path="tenants/new" element={<PlatformRoute><TenantProvision /></PlatformRoute>} />
          <Route path="tenants/:id" element={<PlatformRoute><TenantDetailRoute /></PlatformRoute>} />
          <Route path="partners" element={<PlatformRoute><PartnersList /></PlatformRoute>} />
          <Route path="partners/:id" element={<PlatformRoute><PartnerDetailRoute /></PlatformRoute>} />
          <Route path="domains" element={<PlatformRoute><DomainsList /></PlatformRoute>} />
          <Route path="scope-gates" element={<PlatformRoute><Dashboard /></PlatformRoute>} />
          <Route path="billing" element={<PlatformRoute><BillingDashboard /></PlatformRoute>} />
          <Route path="billing/plans" element={<PlatformRoute><OperatorFeePlans /></PlatformRoute>} />
          <Route path="billing/statements" element={<PlatformRoute><StatementsList /></PlatformRoute>} />
          <Route path="billing/statements/:id" element={<PlatformRoute><StatementDetailRoute /></PlatformRoute>} />
          <Route path="reports" element={<PlatformRoute><PlatformReports /></PlatformRoute>} />

          {/* Partner views under /console/partner/* */}
          <Route path="partner" element={<PartnerRoute><PartnerDashboard /></PartnerRoute>} />
          <Route path="partner/overview" element={<PartnerRoute><PartnerDashboard /></PartnerRoute>} />
          <Route path="partner/operators" element={<PartnerRoute><PartnerTenantsList /></PartnerRoute>} />
          <Route path="partner/operators/new" element={<PartnerRoute><PartnerTenantProvision /></PartnerRoute>} />
          <Route path="partner/operators/:id" element={<PartnerRoute><PartnerTenantDetailRoute /></PartnerRoute>} />
          <Route path="partner/staff" element={<PartnerRoute><PartnerStaff /></PartnerRoute>} />

          {/* Fallback aliases for partner convenience */}
          <Route path="operators" element={<PartnerRoute><Navigate to="/partner/operators" replace /></PartnerRoute>} />
          <Route path="operators/new" element={<PartnerRoute><Navigate to="/partner/operators/new" replace /></PartnerRoute>} />
          <Route path="operators/:id" element={<PartnerRoute><PartnerTenantDetailRoute /></PartnerRoute>} />
          <Route path="staff" element={<PartnerRoute><Navigate to="/partner/staff" replace /></PartnerRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
