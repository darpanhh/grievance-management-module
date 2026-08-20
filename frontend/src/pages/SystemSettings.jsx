import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const SystemSettings = () => {
  const [settings, setSettings] = useState({
    daily_grievance_limit: 3,
    escalation_days: 7,
    escalation_interval_min: 60,
    updated_at: null,
    updated_by_name: null,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedSummary, setSavedSummary] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await api.get('admin/settings/');
      const hours = res.data.escalation_hours || 168;
      const days = Number((hours / 24).toFixed(2));
      setSettings({
        daily_grievance_limit: res.data.daily_grievance_limit,
        escalation_days: Number.isInteger(days) ? days : days,
        escalation_interval_min: res.data.escalation_interval_min,
        updated_at: res.data.updated_at,
        updated_by_name: res.data.updated_by_name,
      });
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to load system settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: value === '' ? '' : Number(value),
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');

    if (settings.daily_grievance_limit < 1 || settings.daily_grievance_limit > 100) {
      setErrorMsg('Daily limit must be between 1 and 100 submissions.');
      setSaving(false);
      return;
    }

    if (settings.escalation_days <= 0) {
      setErrorMsg('Escalation days must be greater than 0.');
      setSaving(false);
      return;
    }

    if (settings.escalation_interval_min <= 0) {
      setErrorMsg('Escalation check interval must be greater than 0 minutes.');
      setSaving(false);
      return;
    }

    try {
      const payload = {
        daily_grievance_limit: Number(settings.daily_grievance_limit),
        escalation_hours: Number(settings.escalation_days) * 24,
        escalation_interval_min: Number(settings.escalation_interval_min),
      };
      const res = await api.patch('admin/settings/', payload);
      const hours = res.data.escalation_hours || 168;
      const days = Number((hours / 24).toFixed(2));
      const updatedState = {
        daily_grievance_limit: res.data.daily_grievance_limit,
        escalation_days: Number.isInteger(days) ? days : days,
        escalation_interval_min: res.data.escalation_interval_min,
        updated_at: res.data.updated_at,
        updated_by_name: res.data.updated_by_name,
      };
      setSettings(updatedState);
      setSavedSummary({
        daily_limit: updatedState.daily_grievance_limit,
        escalation_days: updatedState.escalation_days,
        interval_min: updatedState.escalation_interval_min,
      });
      setShowSuccessModal(true);
    } catch (err) {
      const errData = err.response?.data;
      let msg = 'Failed to update settings.';
      if (typeof errData === 'object') {
        const firstKey = Object.keys(errData)[0];
        msg = Array.isArray(errData[firstKey]) ? errData[firstKey][0] : String(errData[firstKey]);
      }
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const formatLastUpdated = (dateStr) => {
    if (!dateStr) return 'Never modified (using system defaults)';
    try {
      return new Date(dateStr).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="dashboard-page admin-settings-page">
        <div className="dashboard-container">
          <div className="loading-spinner-container" style={{ padding: '4rem 0' }}>
            <div className="spinner"></div>
            <p>Loading system configuration...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="dashboard-page admin-settings-page">
      <div className="dashboard-container">
        {/* Top-Left Back Navigation */}
        <div className="page-back-nav">
          <Link to="/admin/grievances" className="btn btn-secondary back-nav-btn">
            ← Back to Dashboard
          </Link>
        </div>

        {/* Header */}
        <header className="dashboard-heading">
          <div>
            <h1>System Configuration &amp; Policies</h1>
            <p>
              Manage platform-wide rate limits and grievance auto-escalation parameters.
            </p>
          </div>
        </header>

        {/* Error Alert */}
        {errorMsg && (
          <div
            className="workflow-toast error"
            style={{ marginBottom: '1.5rem' }}
            role="alert"
          >
            <span>⚠️ {errorMsg}</span>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setErrorMsg('')}
            >
              ×
            </button>
          </div>
        )}

        <form onSubmit={handleSave} className="admin-settings-form">
          <div className="settings-grid">
            {/* Rate Limiting Card */}
            <div className="admin-setting-card">
              <div className="setting-card-header">
                <div className="setting-icon-badge primary">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div>
                  <h2>Rate Limiting Controls</h2>
                  <p>Prevent spamming and abuse by capping daily submissions</p>
                </div>
              </div>

              <div className="setting-card-body">
                <div className="form-group setting-field">
                  <label htmlFor="daily_grievance_limit">
                    Daily Grievance Submission Limit <span className="required-star">*</span>
                  </label>
                  <div className="setting-input-wrap">
                    <input
                      type="number"
                      id="daily_grievance_limit"
                      name="daily_grievance_limit"
                      min="1"
                      max="100"
                      step="1"
                      value={settings.daily_grievance_limit}
                      onChange={handleChange}
                      required
                    />
                    <span className="input-suffix">per user / day</span>
                  </div>
                  <small className="setting-hint">
                    Maximum number of grievances a student or staff member can submit in a 24-hour window.
                    Submissions beyond this return a <code>429 Too Many Requests</code> response.
                  </small>
                </div>

                {/* Quick Presets */}
                <div className="setting-presets">
                  <span className="preset-label">Quick presets:</span>
                  <div className="preset-buttons">
                    {[1, 3, 5, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        className={`preset-btn ${settings.daily_grievance_limit === num ? 'active' : ''}`}
                        onClick={() => setSettings((s) => ({ ...s, daily_grievance_limit: num }))}
                      >
                        {num} / day
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Escalation Policy Card */}
            <div className="admin-setting-card">
              <div className="setting-card-header">
                <div className="setting-icon-badge warning">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 17 10 11l4 4 6-7" />
                    <path d="M15 8h5v5" />
                  </svg>
                </div>
                <div>
                  <h2>Auto-Escalation Engine</h2>
                  <p>Configure automated escalation timelines for unattended grievances</p>
                </div>
              </div>

              <div className="setting-card-body">
                <div className="form-group setting-field">
                  <label htmlFor="escalation_days">
                    Inactivity Threshold <span className="required-star">*</span>
                  </label>
                  <div className="setting-input-wrap">
                    <input
                      type="number"
                      id="escalation_days"
                      name="escalation_days"
                      min="1"
                      max="90"
                      step="any"
                      value={settings.escalation_days}
                      onChange={handleChange}
                      required
                    />
                    <span className="input-suffix">days</span>
                  </div>
                  <small className="setting-hint">
                    If a department does not respond or take action on a grievance within this number of days,
                    the system automatically escalates it to Campus Admin.
                  </small>
                </div>

                {/* Inactivity presets */}
                <div className="setting-presets">
                  <span className="preset-label">Common thresholds:</span>
                  <div className="preset-buttons">
                    {[
                      { label: '5 days', val: 5 },
                      { label: '7 days', val: 7 },
                      { label: '14 days', val: 14 },
                      { label: '21 days', val: 21 },
                    ].map((p) => (
                      <button
                        key={p.val}
                        type="button"
                        className={`preset-btn ${settings.escalation_days === p.val ? 'active' : ''}`}
                        onClick={() => setSettings((s) => ({ ...s, escalation_days: p.val }))}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <hr className="setting-divider" />

                <div className="form-group setting-field">
                  <label htmlFor="escalation_interval_min">
                    Escalation Scanner Check Interval <span className="required-star">*</span>
                  </label>
                  <div className="setting-input-wrap">
                    <input
                      type="number"
                      id="escalation_interval_min"
                      name="escalation_interval_min"
                      min="1"
                      max="1440"
                      step="any"
                      value={settings.escalation_interval_min}
                      onChange={handleChange}
                      required
                    />
                    <span className="input-suffix">minutes</span>
                  </div>
                  <small className="setting-hint">
                    How frequently the background scheduler wakes up to scan the database for stale grievances.
                    New interval takes effect after the current cycle completes.
                  </small>
                </div>
              </div>
            </div>
          </div>

          {/* Audit & Action Footer */}
          <div className="admin-settings-footer">
            <div className="settings-audit-info">
              <span>🕒 <strong>Last Updated:</strong> {formatLastUpdated(settings.updated_at)}</span>
             </div>

            <div className="settings-actions">
              <Link to="/admin/grievances" className="btn btn-secondary">
                Cancel
              </Link>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving Changes...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </form>

        {/* Success Popup Modal with Tick Sign */}
        {showSuccessModal && (
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => setShowSuccessModal(false)}
          >
            <div
              className="confirmation-modal system-settings-success-modal"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="success-modal-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="success-mark setting-success-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <h2 id="success-modal-title">Settings Updated Successfully!</h2>
              <p>System policies and rate limits have been updated and are now live.</p>

              {savedSummary && (
                <div className="settings-success-summary">
                  <div className="summary-item">
                    <span className="summary-label">Daily Submission Limit:</span>
                    <strong>{savedSummary.daily_limit} grievance{savedSummary.daily_limit !== 1 ? 's' : ''} / user / day</strong>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Escalation Threshold:</span>
                    <strong>{savedSummary.escalation_days} day{savedSummary.escalation_days !== 1 ? 's' : ''}</strong>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Check Scanner Interval:</span>
                    <strong>Every {savedSummary.interval_min} minute{savedSummary.interval_min !== 1 ? 's' : ''}</strong>
                  </div>
                </div>
              )}

              <div className="modal-actions" style={{ marginTop: '1.75rem', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ minWidth: '140px' }}
                  onClick={() => setShowSuccessModal(false)}
                  autoFocus
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default SystemSettings;
