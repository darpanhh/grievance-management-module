import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import PasswordReset from './pages/PasswordReset';
import SubmitGrievance from './pages/SubmitGrievance';
import TrackGrievance from './pages/TrackGrievance';
import Faq from './pages/Faq';
import StudentDashboard from './pages/StudentDashboard';
import GrievanceDetail from './pages/GrievanceDetail';
import DepartmentDashboard from './pages/DepartmentDashboard';
import CampusAdminDashboard from './pages/CampusAdminDashboard';
import AdminDashboard from './pages/AdminDashboard';
import './App.css';

// Automatic redirect handler for /dashboard based on logged in user's role
const DashboardRedirect = () => {
  const { user } = useAuth();
  const role = (user?.role || '').toUpperCase();

  if (role === 'STUDENT' || role === 'STAFF') {
    return <Navigate to="/dashboard/student" replace />;
  } else if (role === 'HOD' || role === 'DEPARTMENT_ADMIN') {
    return <Navigate to="/dashboard/department" replace />;
  } else if (role === 'SYSTEM_ADMIN') {
    return <Navigate to="/dashboard/admin" replace />;
  } else if (role === 'CAMPUS_ADMIN') {
    return <Navigate to="/dashboard/campus" replace />;
  }

  return <Navigate to="/dashboard/student" replace />;
};

const NotFoundPlaceholder = () => (
  <div className="placeholder-page">
    <div className="placeholder-card error-card">
      <div className="placeholder-badge danger">404 Error</div>
      <h2>Page Not Found</h2>
      <p>The requested IOE Pulchowk portal route does not exist.</p>
      <Link to="/" className="btn btn-primary">Go to Home</Link>
    </div>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app-layout">
          <Navbar />
          <main className="app-main">
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/password-reset" element={<PasswordReset />} />
              <Route path="/grievances/track" element={<TrackGrievance />} />
              <Route path="/track" element={<Navigate to="/grievances/track" replace />} />
              <Route path="/faq" element={<Faq />} />

              {/* Protected Routes */}
              <Route
                path="/grievances/new"
                element={
                  <ProtectedRoute allowedRoles={['STUDENT', 'STAFF']}>
                    <SubmitGrievance />
                  </ProtectedRoute>
                }
              />
              <Route path="/submit" element={<Navigate to="/grievances/new" replace />} />
              <Route path="/grievances/:id" element={<ProtectedRoute><GrievanceDetail /></ProtectedRoute>} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardRedirect />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/student"
                element={
                  <ProtectedRoute allowedRoles={['STUDENT', 'STAFF']}>
                    <StudentDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/department"
                element={
                  <ProtectedRoute allowedRoles={['HOD']}>
                    <DepartmentDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/campus"
                element={
                  <ProtectedRoute allowedRoles={['CAMPUS_ADMIN']}>
                    <CampusAdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/admin"
                element={
                  <ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />

              {/* 404 Catch-All */}
              <Route path="*" element={<NotFoundPlaceholder />} />
            </Routes>
          </main>
          <footer className="app-footer">
            <p>
              IOE Pulchowk Campus Grievance Portal &bull; <Link to="/faq">FAQ</Link> &bull; Institute of Engineering, Tribhuvan University © 2026
            </p>
          </footer>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
