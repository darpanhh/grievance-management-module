import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import './App.css'

function Home() {
  return (
    <div className="launchpad-container">
      <header className="launchpad-header">
        <div className="logo-badge">GMS</div>
        <h1>Grievance Management System</h1>
        <p className="subtitle">Pulchowk Campus &mdash; Department of Electronics and Computer Engineering</p>
      </header>
      <main className="launchpad-main" style={{ textAlign: 'center' }}>
        <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '2rem' }}>
          A platform for students and staff to submit, track, and resolve grievances.
        </p>
        <a href="/login" className="btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>
          Get Started
        </a>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app-layout">
          <Navbar />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={
                <div className="coming-soon"><h2>Register</h2><p>Registration page coming soon.</p></div>
              } />
              <Route path="/password-reset" element={
                <div className="coming-soon"><h2>Password Reset</h2><p>Password reset page coming soon.</p></div>
              } />
              <Route path="/grievances/new" element={
                <ProtectedRoute roles={['STUDENT', 'STAFF']}>
                  <div className="coming-soon"><h2>Submit Grievance</h2><p>Submission form coming soon.</p></div>
                </ProtectedRoute>
              } />
              <Route path="/grievances/track" element={
                <div className="coming-soon"><h2>Track Grievance</h2><p>Anonymous tracking page coming soon.</p></div>
              } />
              <Route path="/grievances/:id" element={
                <ProtectedRoute roles={['STUDENT', 'STAFF', 'HOD', 'CAMPUS_ADMIN']}>
                  <div className="coming-soon"><h2>Grievance Detail</h2><p>Detail page coming soon.</p></div>
                </ProtectedRoute>
              } />
              <Route path="/dashboard/student" element={
                <ProtectedRoute roles={['STUDENT']}>
                  <div className="coming-soon"><h2>Student Dashboard</h2><p>Dashboard coming soon.</p></div>
                </ProtectedRoute>
              } />
              <Route path="/dashboard/department" element={
                <ProtectedRoute roles={['HOD', 'STAFF']}>
                  <div className="coming-soon"><h2>Department Dashboard</h2><p>Dashboard coming soon.</p></div>
                </ProtectedRoute>
              } />
              <Route path="/dashboard/admin" element={
                <ProtectedRoute roles={['CAMPUS_ADMIN']}>
                  <div className="coming-soon"><h2>Admin Dashboard</h2><p>Dashboard coming soon.</p></div>
                </ProtectedRoute>
              } />
              <Route path="/admin/spam-queue" element={
                <ProtectedRoute roles={['CAMPUS_ADMIN']}>
                  <div className="coming-soon"><h2>Spam Queue</h2><p>Spam queue management coming soon.</p></div>
                </ProtectedRoute>
              } />
              <Route path="/reports" element={
                <ProtectedRoute roles={['CAMPUS_ADMIN']}>
                  <div className="coming-soon"><h2>Reports</h2><p>Export reports page coming soon.</p></div>
                </ProtectedRoute>
              } />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
