import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';

const Navbar = () => {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    setDropdownOpen(false);
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  const userRole = (user?.role || '').toUpperCase();
  const isAdminOrHOD = ['HOD', 'DEPARTMENT_ADMIN', 'CAMPUS_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(userRole);

  const getDashboardUrl = () => {
    if (!user) return '/dashboard';
    if (userRole === 'STUDENT' || userRole === 'STAFF') return '/dashboard';
    if (userRole === 'HOD' || userRole === 'DEPARTMENT_ADMIN') return '/department/grievances';
    if (userRole === 'CAMPUS_ADMIN') return '/admin/grievances';
    return '/dashboard';
  };

  const dashboardUrl = getDashboardUrl();
  const dashboardOnlyRole = userRole === 'HOD' || userRole === 'CAMPUS_ADMIN';

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Brand / Logo */}
        <Link to={dashboardOnlyRole ? dashboardUrl : '/'} className="navbar-brand">
          <img src={logo} alt="IOE Pulchowk Campus Logo" className="navbar-logo" />
          <div className="brand-text-container">
            <span className="navbar-subtitle">Grievance Portal</span>
          </div>
        </Link>

        {/* Mobile menu toggle button */}
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>

        {/* Navigation Links */}
        <div className={`navbar-menu ${mobileMenuOpen ? 'active' : ''}`}>
          <div className="navbar-links">
            {!dashboardOnlyRole && (
              <Link
                to="/"
                className={`nav-link ${isActive('/') ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Home
              </Link>
            )}

            {/* Show public tracking only for guests (hide for all logged-in users) */}
            {!user && (
              <>
                <Link
                  to="/grievances/track"
                  className={`nav-link ${isActive('/grievances/track') ? 'active' : ''}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Track Grievance
                </Link>
              </>
            )}

            {user && (
              <Link
                to={dashboardUrl}
                className={`nav-link ${isActive(dashboardUrl) || isActive('/dashboard') ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Dashboard
              </Link>
            )}
          </div>

          {/* User Auth Controls / Dropdown */}
          <div className="navbar-auth">
            {user ? (
              <div className="user-dropdown-container">
                <button
                  className="user-profile-btn"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                >
                  <div className="avatar-circle">
                    {(user.email || user.username || 'U')[0].toUpperCase()}
                  </div>
                  <span className="user-name">{user.username || user.email}</span>
                  <span className={`dropdown-caret ${dropdownOpen ? 'open' : ''}`}>▼</span>
                </button>

                {dropdownOpen && (
                  <div className="dropdown-menu">
                    <div className="dropdown-header">
                      <p className="dropdown-user-email">{user.email || user.username}</p>
                      <span className="role-badge">{user.role || 'User'}</span>
                    </div>
                    <div className="dropdown-divider"></div>
                    <Link
                      to={dashboardUrl}
                      className="dropdown-item"
                      onClick={() => setDropdownOpen(false)}
                    >
                      📊 Dashboard
                    </Link>
                    <button className="dropdown-item logout-btn" onClick={handleLogout}>
                      🚪 Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="auth-buttons">
                <Link to="/login" className="btn btn-outline" onClick={() => setMobileMenuOpen(false)}>
                  Log In
                </Link>
                <Link to="/register" className="btn btn-primary" onClick={() => setMobileMenuOpen(false)}>
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
