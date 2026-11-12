import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatformAuthStore } from '../../store/authStore.js';
import { authApi } from '../../api/client.js';

export default function Header() {
  const navigate = useNavigate();
  const staff = usePlatformAuthStore((state) => state.staff);
  const logout = usePlatformAuthStore((state) => state.logout);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      logout();
    } finally {
      navigate('/login');
    }
  };

  return (
    <header className="h-16 bg-slate-800 border-b border-slate-700 px-6 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <h1 className="text-lg font-semibold text-slate-100">Platform Management Console</h1>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800">
          Scope: Platform
        </span>
      </div>

      <div className="flex items-center space-x-4">
        <div className="text-right">
          <p className="text-sm font-medium text-slate-200">
            {staff?.username || staff?.email || 'Platform Staff'}
          </p>
          <p className="text-xs text-slate-400">{staff?.email || 'staff@example.com'}</p>
        </div>

        <button
          onClick={handleLogout}
          type="button"
          className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded border border-slate-600 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
