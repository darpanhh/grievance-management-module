import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—';
const statusLabel = (status) => (status || 'SUBMITTED').replace(/_/g, ' ');
const grievanceCode = (id) => `GMS-${String(id).padStart(4, '0')}`;
const errorMessage = (error) => error.response?.data?.error || error.response?.data?.detail || 'We could not find a grievance with those details. Check the ID and secret code and try again.';

const TrackGrievance = () => {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState({ id: '', secret_code: '' });
  const [grievance, setGrievance] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setGrievance(null);
    setLoading(true);
    try {
      const { data } = await api.post('grievances/track/', { id: Number(credentials.id), secret_code: credentials.secret_code.trim() });
      setGrievance(data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="track-page-redesign">
      <div className="track-hero">
        <div><span className="track-eyebrow">PRIVATE STATUS LOOKUP</span><h1>Track a grievance,<br /><em>your way.</em></h1><p>Use the unique Grievance ID and Secret Code you received when submitting your concern.</p></div>
        <div className="track-hero-art" aria-hidden="true"><span className="clip">▣</span><span className="paper">✓<i /> <i /> <i /></span><span className="lens" /></div>
      </div>

      <div className="track-workspace track-lookup-workspace">
        <section className="track-lookup-copy"><span className="track-copy-icon">⌁</span><h2>Safe, private tracking</h2><p>Your lookup code gives you access to updates without exposing your identity.</p><ul><li>View the latest status</li><li>Read official department responses</li><li>Access your record securely</li></ul>{user ? <Link className="track-dashboard-link" to="/dashboard">View my grievances in dashboard <span>→</span></Link> : <Link className="track-dashboard-link" to="/login">Sign in to view your dashboard <span>→</span></Link>}</section>
        <form className="anonymous-track-panel" onSubmit={submit}>
            <div className="panel-heading"><div><span className="form-eyebrow">ANONYMOUS LOOKUP</span><h2>Find your grievance</h2><p>Enter the details exactly as they were provided.</p></div></div>
            <div className="track-field"><label htmlFor="grievance-id">Grievance ID</label><div><input id="grievance-id" inputMode="numeric" type="number" min="1" required value={credentials.id} onChange={(event) => setCredentials((current) => ({ ...current, id: event.target.value }))} placeholder="For example: GMS-0007" /><span>▧</span></div></div>
            <div className="track-field"><label htmlFor="secret-code">Secret Code</label><div><input id="secret-code" required value={credentials.secret_code} onChange={(event) => setCredentials((current) => ({ ...current, secret_code: event.target.value }))} placeholder="Your 8-character code" autoCapitalize="characters" /><span>♙</span></div></div>
            {error && <div className="form-alert danger" role="alert">{error}</div>}
            <button className="track-submit" disabled={loading} type="submit">⌕ &nbsp; {loading ? 'Looking up…' : 'Track Grievance'}</button>
            <p className="privacy-message"><span>♢</span> Your identity is protected. No one, including admins, can see your personal information.</p>
          </form>
        </div>

      <section className="track-benefits" aria-label="Tracking benefits">
        <div><span className="benefit-icon purple">♙</span><p><strong>Anonymous &amp; Secure</strong>Your identity is protected at every step.</p></div>
        <div><span className="benefit-icon green">♢</span><p><strong>Track Anytime</strong>Check status 24/7 using ID and code.</p></div>
        <div><span className="benefit-icon orange">♧</span><p><strong>Stay Updated</strong>Get updates when there is a new response.</p></div>
        <div><span className="benefit-icon blue">◌</span><p><strong>Need Help?</strong>Contact the support team for assistance.</p></div>
      </section>
      <p className="secret-reminder">ⓘ &nbsp; Lost your secret code? Unfortunately, we cannot retrieve it. Please check your email or documents where you saved it.</p>

      {grievance && <article className="grievance-detail track-result" aria-live="polite">
        <header className="detail-header"><div><span className="detail-id">{grievanceCode(grievance.id)}</span><h2>{grievance.title}</h2><p>Submitted {formatDate(grievance.created_at)}</p></div><span className={`status-badge status-${(grievance.current_status || '').toLowerCase()}`}>{statusLabel(grievance.current_status)}</span></header>
        <dl className="detail-meta"><div><dt>Category</dt><dd>{grievance.category_name || '—'}</dd></div><div><dt>Department</dt><dd>{grievance.department_name || '—'}</dd></div><div><dt>Submitted by</dt><dd>{grievance.is_anonymous ? 'Anonymous' : grievance.submitter_name || 'Not available'}</dd></div><div><dt>Last updated</dt><dd>{formatDate(grievance.updated_at)}</dd></div></dl>
        <section><h3>Details</h3><p className="detail-description">{grievance.description}</p></section>
        <section><h3>Official responses</h3>{grievance.responses?.length ? <div className="response-list">{grievance.responses.map((response) => <article key={response.id} className="response-card"><header><strong>{response.responder_name || 'Department representative'}</strong><time>{formatDate(response.created_at)}</time></header><p>{response.content}</p></article>)}</div> : <p className="empty-note">No official response has been posted yet.</p>}</section>
      </article>}
    </section>
  );
};

export default TrackGrievance;
