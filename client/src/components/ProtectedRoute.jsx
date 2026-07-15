import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isLoading } = useAuthStore();
  if (isLoading) return (
    <div className="min-h-screen bg-bg-deep flex items-center justify-center text-text-2">
      Yükleniyor...
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}
