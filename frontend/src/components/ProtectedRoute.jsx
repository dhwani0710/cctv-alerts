import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { user, getDefaultRedirect } = useAuth();
  const location = useLocation();

  if (!user || !user.token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles.length > 0) {
    const userRole = (user.role || '').toLowerCase();
    const normalized = allowedRoles.map(r => r.toLowerCase());
    if (!normalized.includes(userRole)) {
      return <Navigate to={getDefaultRedirect(user.role)} replace />;
    }
  }

  return children;
};
