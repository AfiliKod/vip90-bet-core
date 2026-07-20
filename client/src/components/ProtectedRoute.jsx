import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isLoading } = useAuthStore();
  const location = useLocation();
  if (isLoading) return (
    <div className="min-h-screen bg-bg-deep flex items-center justify-center text-text-2">
      Yükleniyor...
    </div>
  );
  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}
