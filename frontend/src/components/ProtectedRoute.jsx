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

    if (userRole === 'owner') {
      effectiveRoles.push('owner', 'ceo', 'admin', 'hr', 'manager', 'guard');
    } else if (userRole === 'ceo' || userRole === 'admin') {
      effectiveRoles.push('ceo', 'admin', 'hr', 'manager', 'guard');
    } else if (userRole === 'hr' || userRole === 'manager') {
      effectiveRoles.push('hr', 'manager');
    } else if (userRole === 'guard') {
      effectiveRoles.push('guard');
    }

    const normalizedAllowed = allowedRoles.map(r => r.toLowerCase());
    const hasAccess = effectiveRoles.some(r => normalizedAllowed.includes(r));

    if (!hasAccess) {
      const redirectPath = getDefaultRedirect(user.role);
      if (location.pathname === redirectPath) {
        return <Navigate to="/login" replace />;
      }
      return <Navigate to={redirectPath} replace />;
    }
  }

  return children;
};
