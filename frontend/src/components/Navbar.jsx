import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const dashboardLink = () => {
    if (!user) return '/login'
    switch (user.role) {
      case 'STUDENT': return '/dashboard/student'
      case 'HOD':
      case 'STAFF': return '/dashboard/department'
      case 'CAMPUS_ADMIN': return '/dashboard/admin'
      default: return '/login'
    }
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to={isAuthenticated ? dashboardLink() : '/'} className="navbar-brand">
          <span className="navbar-logo">GMS</span>
          <span className="navbar-title">Grievance Management</span>
        </Link>

        {isAuthenticated && (
          <div className="navbar-links">
            {user.role === 'STUDENT' && (
              <Link to="/grievances/new" className="nav-link">Submit Grievance</Link>
            )}
            {(user.role === 'HOD' || user.role === 'STAFF') && (
              <Link to="/grievances" className="nav-link">Grievances</Link>
            )}
            {user.role === 'CAMPUS_ADMIN' && (
              <>
                <Link to="/admin/spam-queue" className="nav-link">Spam Queue</Link>
                <Link to="/reports" className="nav-link">Reports</Link>
              </>
            )}
          </div>
        )}

        <div className="navbar-right">
          {isAuthenticated ? (
            <div className="navbar-user">
              <span className="user-name">{user.first_name || user.username}</span>
              <span className="user-role">{user.role.replace('_', ' ')}</span>
              <button onClick={handleLogout} className="btn-logout">Logout</button>
            </div>
          ) : (
            <Link to="/login" className="nav-link">Login</Link>
          )}
        </div>
      </div>
    </nav>
  )
}
