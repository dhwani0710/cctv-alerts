import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext.jsx';
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
          {/* Default route */}
          <Route
            path="/"
            element={<Navigate to="/login" replace />}
          />

          {/* Login */}
          <Route
            path="/login"
            element={<Login />}
          />

          {/* CEO / Owner Dashboard */}
          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute allowedRoles={['ceo', 'owner']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Security Guard Dashboard */}
          <Route
            path="/guard-dashboard"
            element={
              <ProtectedRoute allowedRoles={['guard']}>
                <EmployeeDashboard />
              </ProtectedRoute>
            }
          />

          {/* HR Dashboard */}
          <Route
            path="/hr-dashboard"
            element={
              <ProtectedRoute allowedRoles={['hr']}>
                <EmployeeDashboard />
              </ProtectedRoute>
            }
          />

          {/* Employee Management - CEO, Owner and HR */}
          <Route
            path="/admin-employees"
            element={
              <ProtectedRoute allowedRoles={['ceo', 'owner', 'hr']}>
                <AdminEmployees />
              </ProtectedRoute>
            }
          />

          {/* User Management - CEO and Owner only */}
          <Route
            path="/admin-users"
            element={
              <ProtectedRoute allowedRoles={['ceo', 'owner']}>
                <AdminUsers />
              </ProtectedRoute>
            }
          />

          {/* Cameras and Alerts */}
          <Route
            path="/cameras-alerts"
            element={
              <ProtectedRoute allowedRoles={['ceo', 'owner', 'guard']}>
                <CamerasAlerts />
              </ProtectedRoute>
            }
          />

          {/* Records */}
          <Route
            path="/records"
            element={
              <ProtectedRoute allowedRoles={['ceo', 'owner', 'guard']}>
                <Records />
              </ProtectedRoute>
            }
          />

          {/* Attendance - CEO, Owner and HR */}
          <Route
            path="/attendance"
            element={
              <ProtectedRoute allowedRoles={['ceo', 'owner', 'hr']}>
                <Attendance />
              </ProtectedRoute>
            }
          />

          {/* Settings */}
          <Route
            path="/settings"
            element={
              <ProtectedRoute
                allowedRoles={['ceo', 'owner', 'guard', 'hr']}
              >
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* Unknown route */}
          <Route
            path="*"
            element={<Navigate to="/login" replace />}
          />
        </Routes>
      </StatusProvider>
    </AuthProvider>
  );
}