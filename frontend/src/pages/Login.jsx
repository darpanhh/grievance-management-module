import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';

const postLoginRoute = (role) => {
  const userRole = (role || '').toUpperCase();
  if (userRole === 'HOD') return '/department/grievances';
  if (userRole === 'CAMPUS_ADMIN') return '/admin/grievances';
  return '/';
};

const Login = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { user, loading, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !loading) {
      navigate(postLoginRoute(user.role), { replace: true });
    }
  }, [user, loading, navigate]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    if (errorMessage) setErrorMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.password) {
      setErrorMessage('Please provide both username and password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = await login({
        username: formData.username.trim(),
        password: formData.password,
      });

      navigate(postLoginRoute(res.user?.role), { replace: true });
    } catch (err) {
      setErrorMessage(err.message || 'Invalid credentials. Check your username or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-spinner-container">
        <div className="spinner"></div>
        <p>Checking session...</p>
      </div>
    );
  }

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-header">
          <Link to="/" className="auth-logo-link">
            <img src={logo} alt="IOE Pulchowk Logo" className="auth-logo" />
          </Link>
          <h2>IOE Pulchowk Login</h2>
          <p>Sign in with your Pulchowk Campus account credentials</p>
        </div>

        {errorMessage && (
          <div className="auth-alert danger">
            <span className="alert-icon">⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="username">Username or Roll No -</label>
            <input
              type="text"
              id="username"
              name="username"
              placeholder="e.g. 077BCT001 or staff.username"
              value={formData.username}
              onChange={handleChange}
              required
              disabled={isSubmitting}
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <div className="label-with-link">
              <label htmlFor="password">Password</label>
              <Link to="/password-reset" className="forgot-link">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              id="password"
              name="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange}
              required
              disabled={isSubmitting}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <span className="button-spinner"></span>
                Signing In...
              </>
            ) : (
              'Sign In to Portal'
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            New student or staff at Pulchowk?{' '}
            <Link to="/register" className="auth-link">
              Register Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
