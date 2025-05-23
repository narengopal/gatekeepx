import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Register from './components/Register';
import Dashboard from './pages/Dashboard';
import InviteGuest from './pages/InviteGuest';
import ScanQR from './pages/ScanQR';
import AdminPanel from './pages/AdminPanel';
import Notifications from './pages/Notifications';
import VisitorLog from './pages/VisitorLog';
import ApartmentManagement from './pages/ApartmentManagement';
import PendingUsers from './pages/admin/PendingUsers';
import SecurityGuards from './pages/admin/SecurityGuards';
import AdminVisitorLog from './pages/admin/VisitorLog';
import Layout from './Layout';
import PrivateRoute from './components/PrivateRoute';
import AdminRoute from './components/AdminRoute';
import theme from './theme';

const PrivateRouteComponent = ({ children, roles }) => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" />;
  }

  return children;
};

function App() {
  return (
    <ChakraProvider theme={theme} resetCSS={true}>
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-100">
          <Routes>
              {/* Public Routes */}
              <Route path="/register" element={<Register />} />
            <Route path="/login" element={<Login />} />

              {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <Layout><Dashboard /></Layout>
                </PrivateRoute>
              }
            />
            <Route
              path="/invite-guest"
              element={
                <PrivateRoute roles={['resident']}>
                  <Layout><InviteGuest /></Layout>
                </PrivateRoute>
              }
            />
            <Route
              path="/scan-qr"
              element={
                <PrivateRoute roles={['security']}>
                  <Layout><ScanQR /></Layout>
                </PrivateRoute>
              }
            />
              <Route
                path="/notifications"
                element={
                  <PrivateRoute>
                    <Layout><Notifications /></Layout>
                  </PrivateRoute>
                }
              />
              <Route
                path="/visitor-log"
                element={
                  <PrivateRoute roles={['security', 'admin']}>
                    <Layout><VisitorLog /></Layout>
                  </PrivateRoute>
                }
              />

              {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <PrivateRoute roles={['admin']}>
                  <Layout><AdminPanel /></Layout>
                </PrivateRoute>
              }
            />
            <Route
              path="/admin/apartment-management"
              element={
                <PrivateRoute roles={['admin']}>
                  <Layout><ApartmentManagement /></Layout>
                </PrivateRoute>
              }
            />
            <Route
              path="/admin/pending-users"
              element={
                  <AdminRoute>
                  <Layout><PendingUsers /></Layout>
                  </AdminRoute>
              }
            />
            <Route
              path="/admin/security-guards"
              element={
                <PrivateRoute roles={['admin']}>
                  <Layout><SecurityGuards /></Layout>
                </PrivateRoute>
              }
            />
            <Route
              path="/admin/visitor-log"
              element={
                <PrivateRoute roles={['admin']}>
                  <Layout><AdminVisitorLog /></Layout>
                </PrivateRoute>
              }
            />

              {/* Redirect root to login */}
              <Route path="/" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
    </ChakraProvider>
  );
}

export default App; 