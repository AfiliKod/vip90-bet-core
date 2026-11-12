import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { usePlatformAuthStore } from './store/authStore.js';
import { authApi } from './api/client.js';
import Layout from './components/layout/Layout.jsx';
import Login from './pages/Login.jsx';
import Setup2fa from './pages/Setup2fa.jsx';

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

function DashboardPlaceholder() {
  return (
    <div className="space-y-6">
      <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
        <h2 className="text-xl font-bold text-white mb-2">Platform Overview</h2>
        <p className="text-slate-400 text-sm">
          Welcome to the Multi-Tenant Platform Management Console. Select a section from the navigation menu to manage operators, domains, and security gates.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800 p-5 rounded-lg border border-slate-700">
          <h3 className="text-sm font-medium text-slate-400">Environment</h3>
          <p className="text-2xl font-semibold text-emerald-400 mt-1">Multi-Tenant</p>
        </div>
        <div className="bg-slate-800 p-5 rounded-lg border border-slate-700">
          <h3 className="text-sm font-medium text-slate-400">Security Gate</h3>
          <p className="text-2xl font-semibold text-indigo-400 mt-1">2FA Enforced</p>
        </div>
        <div className="bg-slate-800 p-5 rounded-lg border border-slate-700">
          <h3 className="text-sm font-medium text-slate-400">Staff Access</h3>
          <p className="text-2xl font-semibold text-amber-400 mt-1">Platform Scope</p>
        </div>
      </div>
    </div>
  );
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
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup-2fa" element={<Setup2fa />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPlaceholder />} />
          <Route path="tenants/*" element={<DashboardPlaceholder />} />
          <Route path="domains/*" element={<DashboardPlaceholder />} />
          <Route path="scope-gates" element={<DashboardPlaceholder />} />
          <Route path="audit-logs" element={<DashboardPlaceholder />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
