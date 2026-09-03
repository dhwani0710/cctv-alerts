import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import EmployeeDashboard from './pages/EmployeeDashboard.jsx';
import CamerasAlerts from './pages/CamerasAlerts.jsx';
import Records from './pages/Records.jsx';
import AdminEmployees from './pages/AdminEmployees.jsx';
import Attendance from './pages/Attendance.jsx';
import Settings from './pages/Settings.jsx';

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
          path="/admin-employees"
          element={<ProtectedRoute allowedRoles={['admin']}><AdminEmployees /></ProtectedRoute>}
        />
        <Route
          path="/cameras-alerts"
          element={<ProtectedRoute allowedRoles={['admin', 'employee']}><CamerasAlerts /></ProtectedRoute>}
        />
        <Route
          path="/records"
          element={<ProtectedRoute allowedRoles={['admin', 'employee']}><Records /></ProtectedRoute>}
        />
        <Route
          path="/attendance"
          element={<ProtectedRoute allowedRoles={['admin']}><Attendance /></ProtectedRoute>}
        />
        <Route
          path="/settings"
          element={<ProtectedRoute allowedRoles={['admin', 'employee']}><Settings /></ProtectedRoute>}
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}