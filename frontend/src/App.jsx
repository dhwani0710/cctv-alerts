import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, dashboardFor } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import EmployeeDashboard from './pages/EmployeeDashboard.jsx';
import CamerasAlerts from './pages/CamerasAlerts.jsx';
import Records from './pages/Records.jsx';
import AdminEmployees from './pages/AdminEmployees.jsx';
import Attendance from './pages/Attendance.jsx';

function SettingsRedirect() {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={dashboardFor(session.role)} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />

        <Route
          path="/admin-dashboard"
          element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>}
        />
        <Route
          path="/employee-dashboard"
          element={<ProtectedRoute allowedRoles={['employee']}><EmployeeDashboard /></ProtectedRoute>}
        />
        <Route
          path="/hr-dashboard"
          element={<ProtectedRoute allowedRoles={['hr']}><EmployeeDashboard /></ProtectedRoute>}
        />
        <Route
          path="/guard-dashboard"
          element={<ProtectedRoute allowedRoles={['guard']}><EmployeeDashboard /></ProtectedRoute>}
        />

        <Route
          path="/admin-employees"
          element={<ProtectedRoute allowedRoles={['admin']}><AdminEmployees /></ProtectedRoute>}
        />

        <Route
          path="/cameras-alerts"
          element={<ProtectedRoute allowedRoles={['admin', 'guard']}><CamerasAlerts /></ProtectedRoute>}
        />
        <Route
          path="/records"
          element={<ProtectedRoute allowedRoles={['admin', 'guard']}><Records /></ProtectedRoute>}
        />

        <Route
          path="/attendance"
          element={<ProtectedRoute allowedRoles={['admin', 'hr']}><Attendance /></ProtectedRoute>}
        />

        {/* Settings is now a modal opened from the nav rail icon, not a routed page.
            Anyone who lands on /settings directly (old bookmark, typed URL) gets
            bounced to their dashboard instead of a blank/broken page. */}
        <Route path="/settings" element={<SettingsRedirect />} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}