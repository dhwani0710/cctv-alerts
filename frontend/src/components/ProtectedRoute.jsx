import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, dashboardFor } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ allowedRoles, children }) {
  const { session } = useAuth();

  if (!session) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(session.role)) {
    return <Navigate to={`${dashboardFor(session.role)}?denied=1`} replace />;
  }
  return children;
}
