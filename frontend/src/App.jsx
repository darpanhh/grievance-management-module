import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import PasswordReset from './pages/PasswordReset';
import SubmitGrievance from './pages/SubmitGrievance';
import TrackGrievance from './pages/TrackGrievance';
import StudentDashboard from './pages/StudentDashboard';
import GrievanceDetail from './pages/GrievanceDetail';
import DepartmentDashboard from './pages/DepartmentDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Profile from './pages/Profile';
import './App.css';

// Automatic redirect handler for /dashboard based on logged in user's role
const DashboardRedirect = () => {
  const { user } = useAuth();
  const role = (user?.role || '').toUpperCase();

  if (role === 'STUDENT' || role === 'STAFF') {
    return <StudentDashboard />;
  } else if (role === 'HOD' || role === 'DEPARTMENT_ADMIN') {
    return <Navigate to="/department/grievances" replace />;
  } else if (role === 'CAMPUS_ADMIN' || role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return <Navigate to="/admin/grievances" replace />;
  }

  return <Navigate to="/dashboard" replace />;
};

// Redirect that carries any router state through (e.g. a freshly submitted
// grievance's one-time secret code) instead of dropping it.
const PreserveStateRedirect = ({ to }) => {
  const location = useLocation();
  return <Navigate to={to} replace state={location.state} />;
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
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}

function AppShell() {
  const location = useLocation();
  const { user } = useAuth();
  const hideFooter = location.pathname.startsWith('/grievances/') || ['/dashboard', '/department/grievances', '/admin/grievances', '/login', '/register', '/password-reset'].includes(location.pathname) || (location.pathname === '/' && !!user);
  return (
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
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardRedirect />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['STUDENT', 'STAFF']}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/department/grievances"
            element={
              <ProtectedRoute allowedRoles={['HOD']}>
                <DepartmentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/grievances"
            element={
              <ProtectedRoute allowedRoles={['CAMPUS_ADMIN']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard/student" element={<PreserveStateRedirect to="/dashboard" />} />
          <Route path="/dashboard/department" element={<PreserveStateRedirect to="/department/grievances" />} />
          <Route path="/dashboard/admin" element={<PreserveStateRedirect to="/admin/grievances" />} />

          {/* 404 Catch-All */}
          <Route path="*" element={<NotFoundPlaceholder />} />
        </Routes>
      </main>
      {!hideFooter && (
        <footer className="app-footer">
          <p>
            IOE Pulchowk Campus Grievance Portal &bull; Institute of Engineering, Tribhuvan University © 2026
          </p>
        </footer>
      )}
    </div>
  );
}

export default App;
