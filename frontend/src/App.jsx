import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPage } from './pages/AdminPage';
import { Attendance } from './pages/Attendance';
import { Records } from './pages/Records';
import { SettingsPage } from './pages/SettingsPage';

const RootRedirect = () => {
  const { user, getDefaultRedirect } = useAuth();
  if (!user || !user.token) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={getDefaultRedirect(user.role)} replace />;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager', 'guard']}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager']}>
                <AdminPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/attendance"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager']}>
                <Attendance />
              </ProtectedRoute>
            }
          />

          <Route
            path="/records"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager', 'guard']}>
                <Records />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/settings"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
