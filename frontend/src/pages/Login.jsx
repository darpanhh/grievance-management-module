import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { login, isAuthenticated, user, loading } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return (
      <div className="page-loader">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    )
  }

  if (isAuthenticated && user) {
    const target = (() => {
      switch (user.role) {
        case 'STUDENT': return '/dashboard/student'
        case 'HOD':
        case 'STAFF': return '/dashboard/department'
        case 'CAMPUS_ADMIN': return '/dashboard/admin'
        default: return '/login'
      }
    })()
    return <Navigate to={target} replace />
  }

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.username || !form.password) {
      setError('Please fill in all fields.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const userData = await login(form.username, form.password)
      const target = (() => {
        switch (userData.role) {
          case 'STUDENT': return '/dashboard/student'
          case 'HOD':
          case 'STAFF': return '/dashboard/department'
          case 'CAMPUS_ADMIN': return '/dashboard/admin'
          default: return '/login'
        }
      })()
      navigate(target, { replace: true })
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Invalid credentials. Please try again.'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">GMS</div>
          <h1>Welcome Back</h1>
          <p className="auth-subtitle">Sign in to your Grievance Management account</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="form-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="username">Email / Username</label>
            <input
              id="username"
              name="username"
              type="text"
              value={form.username}
              onChange={handleChange}
              placeholder="Enter your college email"
              autoComplete="username"
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={submitting}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don&apos;t have an account? <Link to="/register">Register here</Link>
          </p>
          <p>
            <Link to="/password-reset">Forgot your password?</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
