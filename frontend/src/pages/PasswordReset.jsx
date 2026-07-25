import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import logo from '../assets/logo.png';

const PasswordReset = () => {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  const [message, setMessage] = useState('');
  const [devTokenNotice, setDevTokenNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const handleStep1Submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setMessage('');

    try {
      const res = await api.post('auth/password-reset/', { email: email.trim() });
      setMessage(res.data.message || 'If your email is registered, a reset token has been issued.');

      if (res.data.dev_token) {
        setDevTokenNotice(res.data.dev_token);
        setToken(res.data.dev_token);
      }

      setStep(2);
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Failed to process password reset request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStep2Submit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!token.trim()) {
      setErrorMessage('Please enter your reset token.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('New password must be at least 8 characters long.');
      return;
    }

    if (password !== password2) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await api.post('auth/password-reset/confirm/', {
        email: email.trim(),
        token: token.trim(),
        password,
        password2,
      });

      setMessage(res.data.message || 'Your password has been successfully reset.');
      setIsCompleted(true);
    } catch (err) {
      const serverErr = err.response?.data;
      let msg = 'Failed to reset password. Please check your token and inputs.';
      if (serverErr) {
        if (typeof serverErr === 'string') msg = serverErr;
        else if (serverErr.detail) msg = serverErr.detail;
        else if (serverErr.password) msg = `Password error: ${serverErr.password[0]}`;
        else if (serverErr.token) msg = `Token error: ${serverErr.token[0]}`;
      }
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-header">
          <Link to="/" className="auth-logo-link">
            <img src={logo} alt="Grievance Portal Logo" className="auth-logo" />
          </Link>
          <h2>Reset Password</h2>
          <p>
            {isCompleted
              ? 'Password Reset Complete'
              : step === 1
              ? 'Step 1: Request Reset Token'
              : 'Step 2: Enter Token & Set New Password'}
          </p>
        </div>

        {errorMessage && (
          <div className="auth-alert danger">
            <span className="alert-icon">⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {message && !errorMessage && (
          <div className="auth-alert success">
            <span className="alert-icon">✅</span>
            <span>{message}</span>
          </div>
        )}

        {devTokenNotice && step === 2 && !isCompleted && (
          <div className="auth-alert info">
            <span className="alert-icon">💡</span>
            <span>
              <strong>Development Token Auto-filled:</strong> <code>{devTokenNotice}</code>
            </span>
          </div>
        )}

        {isCompleted ? (
          <div className="reset-completed-view">
            <p className="success-description">
              Your password has been updated. You can now log in using your new password.
            </p>
            <Link to="/login" className="btn btn-primary btn-block">
              Proceed to Sign In
            </Link>
          </div>
        ) : step === 1 ? (
          <form onSubmit={handleStep1Submit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="Enter registered account email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <span className="button-spinner"></span>
                  Requesting Token...
                </>
              ) : (
                'Request Reset Token'
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleStep2Submit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="token">Reset Token</label>
              <input
                type="text"
                id="token"
                name="token"
                placeholder="Paste token or enter reset code"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">New Password (min 8 chars)</label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password2">Confirm New Password</label>
              <input
                type="password"
                id="password2"
                name="password2"
                placeholder="••••••••"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="form-actions-split">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setStep(1)}
                disabled={isSubmitting}
              >
                ← Back
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Resetting...' : 'Confirm Reset'}
              </button>
            </div>
          </form>
        )}

        <div className="auth-footer">
          <p>
            Remember your password?{' '}
            <Link to="/login" className="auth-link">
              Back to Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PasswordReset;
