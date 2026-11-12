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
          <Route index element={<Dashboard />} />
          <Route path="tenants" element={<TenantsList />} />
          <Route path="tenants/new" element={<TenantProvision />} />
          <Route path="tenants/:id" element={<TenantDetailRoute />} />
          <Route path="domains" element={<DomainsList />} />
          <Route path="scope-gates" element={<Dashboard />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
