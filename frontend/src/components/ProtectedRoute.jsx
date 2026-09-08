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
    const effectiveRoles = [userRole];
    if (['ceo', 'owner', 'admin'].includes(userRole)) {
      effectiveRoles.push('admin', 'ceo', 'owner');
    }
    if (['manager', 'hr'].includes(userRole) || ['ceo', 'owner', 'admin'].includes(userRole)) {
      effectiveRoles.push('manager', 'hr');
    }

    const normalizedAllowed = allowedRoles.map(r => r.toLowerCase());
    const hasAccess = effectiveRoles.some(r => normalizedAllowed.includes(r));

    if (!hasAccess) {
      const redirectPath = getDefaultRedirect(user.role);
      if (location.pathname === redirectPath) {
        return <Navigate to="/dashboard" replace />;
      }
      return <Navigate to={redirectPath} replace />;
    }
  }

  return children;
};
