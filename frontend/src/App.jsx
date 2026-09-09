import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, dashboardFor } from './context/AuthContext.jsx';
import { StatusProvider } from './context/StatusContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import EmployeeDashboard from './pages/EmployeeDashboard.jsx';
import CamerasAlerts from './pages/CamerasAlerts.jsx';
import Records from './pages/Records.jsx';
import AdminEmployees from './pages/AdminEmployees.jsx';
import Attendance from './pages/Attendance.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <AuthProvider>
      <StatusProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />

          <Route
            path="/admin-dashboard"
            element={<ProtectedRoute allowedRoles={['ceo', 'owner']}><AdminDashboard /></ProtectedRoute>}
          />
          <Route
            path="/guard-dashboard"
            element={<ProtectedRoute allowedRoles={['guard']}><EmployeeDashboard /></ProtectedRoute>}
          />
          <Route
            path="/hr-dashboard"
            element={<ProtectedRoute allowedRoles={['hr']}><EmployeeDashboard /></ProtectedRoute>}
          />

          <Route
            path="/admin-employees"
            element={<ProtectedRoute allowedRoles={['ceo', 'owner']}><AdminEmployees /></ProtectedRoute>}
          />
          <Route
            path="/admin-users"
            element={<ProtectedRoute allowedRoles={['ceo', 'owner']}><AdminUsers /></ProtectedRoute>}
          />

          <Route
            path="/cameras-alerts"
            element={<ProtectedRoute allowedRoles={['ceo', 'owner', 'guard']}><CamerasAlerts /></ProtectedRoute>}
          />
          <Route
            path="/records"
            element={<ProtectedRoute allowedRoles={['ceo', 'owner', 'guard']}><Records /></ProtectedRoute>}
          />

          <Route
            path="/attendance"
            element={<ProtectedRoute allowedRoles={['ceo', 'owner', 'hr']}><Attendance /></ProtectedRoute>}
          />

          <Route
            path="/settings" element={<ProtectedRoute allowedRoles={['ceo', 'owner', 'guard', 'hr']}><Settings /></ProtectedRoute>}
          />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </StatusProvider>
    </AuthProvider>
  );
}