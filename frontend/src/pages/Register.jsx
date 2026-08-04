import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import logo from '../assets/logo.png';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    password: '',
    password2: '',
    role: 'STUDENT',
    department: '',
    contact_number: '',
  });

  const [departments, setDepartments] = useState([]);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { user, loading: authLoading, register } = useAuth();
  const navigate = useNavigate();

  // If already logged in, redirect to user's dashboard immediately
  useEffect(() => {
    if (user && !authLoading) {
      const userRole = (user.role || '').toUpperCase();
      if (userRole === 'STUDENT' || userRole === 'STAFF') {
        navigate('/dashboard/student', { replace: true });
      } else if (userRole === 'HOD' || userRole === 'DEPARTMENT_ADMIN') {
        navigate('/dashboard/department', { replace: true });
      } else if (userRole === 'CAMPUS_ADMIN' || userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
        navigate('/dashboard/admin', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await api.get('departments/');
        if (Array.isArray(res.data) && res.data.length > 0) {
          setDepartments(res.data);
          setFormData((prev) => ({ ...prev, department: String(res.data[0].id) }));
        } else {
          throw new Error('Empty department list');
        }
      } catch (err) {
        console.error('Failed to load departments from API, using default list:', err);
        const fallbackDepts = [
          { id: 1, name: 'Department of Electronics & Computer Engineering (DOECE)', code: 'DOECE' },
          { id: 2, name: 'Department of Civil Engineering (DOCE)', code: 'DOCE' },
          { id: 3, name: 'Department of Mechanical & Aerospace Engineering (DOMAE)', code: 'DOMAE' },
          { id: 4, name: 'Department of Electrical Engineering (DOEE)', code: 'DOEE' },
          { id: 5, name: 'Department of Architecture & Urban Planning', code: 'DOAUP' },
          { id: 6, name: 'Department of Science & Humanities', code: 'DOSH' },
          { id: 7, name: 'Examination & Student Administration Wing', code: 'EXAM' },
          { id: 8, name: 'Hostel & Campus Infrastructure Maintenance', code: 'INFRA' },
          { id: 9, name: 'Administrative Department', code: 'ADMIN' },
        ];
        setDepartments(fallbackDepts);
        setFormData((prev) => ({ ...prev, department: String(fallbackDepts[0].id) }));
      } finally {
        setLoadingDepartments(false);
      }
    };

    fetchDepartments();
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    if (errorMessage) setErrorMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (formData.password !== formData.password2) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    if (formData.password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (!formData.department) {
      setErrorMessage('Please select a department.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        username: formData.username.trim(),
        email: formData.email.trim(),
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        password: formData.password,
        password2: formData.password2,
        role: formData.role.toUpperCase(),
        department: parseInt(formData.department, 10),
        contact_number: formData.contact_number.trim(),
      };

      await register(payload);
      navigate('/login', { state: { registered: true, username: formData.username } });
    } catch (err) {
      setErrorMessage(err.message || 'Registration failed. Please review your input.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="loading-spinner-container">
        <div className="spinner"></div>
        <p>Checking session...</p>
      </div>
    );
  }

  return (
    <div className="auth-page-container">
      <div className="auth-card register-card">
        <div className="auth-header">
          <Link to="/" className="auth-logo-link">
            <img src={logo} alt="IOE Pulchowk Logo" className="auth-logo" />
          </Link>
          <h2>Pulchowk Account Registration</h2>
          <p>Register as a student or staff member of IOE Pulchowk Campus</p>
        </div>

        {errorMessage && (
          <div className="auth-alert danger">
            <span className="alert-icon">⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" autoComplete="off">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="first_name">First Name *</label>
              <input
                type="text"
                id="first_name"
                name="first_name"
                placeholder="First name"
                value={formData.first_name}
                onChange={handleChange}
                required
                disabled={isSubmitting}
                autoComplete="given-name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="last_name">Last Name *</label>
              <input
                type="text"
                id="last_name"
                name="last_name"
                placeholder="Last name"
                value={formData.last_name}
                onChange={handleChange}
                required
                disabled={isSubmitting}
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="username">Username / Roll No *</label>
              <input
                type="text"
                id="username"
                name="username"
                placeholder="e.g. 077bct001"
                value={formData.username}
                onChange={handleChange}
                required
                disabled={isSubmitting}
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address *</label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="077bct001@pcampus.edu.np"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={isSubmitting}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="role">Account Role *</label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                required
                disabled={isSubmitting}
              >
                <option value="STUDENT">Student</option>
                <option value="STAFF">Staff</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="department">Department *</label>
              <select
                id="department"
                name="department"
                value={formData.department}
                onChange={handleChange}
                required
                disabled={isSubmitting || loadingDepartments}
              >
                <option value="">-- Select Department --</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="contact_number">Contact Number *</label>
            <input
              type="tel"
              id="contact_number"
              name="contact_number"
              placeholder="98XXXXXXXX"
              value={formData.contact_number}
              onChange={handleChange}
              required
              disabled={isSubmitting}
              autoComplete="tel"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="password">Password (min 8 chars) *</label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="Enter new password"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={isSubmitting}
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password2">Confirm Password *</label>
              <input
                type="password"
                id="password2"
                name="password2"
                placeholder="Confirm new password"
                value={formData.password2}
                onChange={handleChange}
                required
                disabled={isSubmitting}
                autoComplete="new-password"
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <span className="button-spinner"></span>
                Creating Account...
              </>
            ) : (
              'Register Account'
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already registered?{' '}
            <Link to="/login" className="auth-link">
              Sign In Here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
