import { useEffect, useMemo, useState } from 'react';
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
  const [myGrievances, setMyGrievances] = useState([]);
  const [loadingMine, setLoadingMine] = useState(Boolean(user));
  const [myGrievancesError, setMyGrievancesError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!user) {
      setMyGrievances([]);
      setLoadingMine(false);
      return;
    }
    setLoadingMine(true);
    setMyGrievancesError('');
    api.get('grievances/')
      .then(({ data }) => setMyGrievances(Array.isArray(data) ? data : data.results || []))
      .catch(() => setMyGrievancesError('Unable to load your grievances right now. Please refresh and try again.'))
      .finally(() => setLoadingMine(false));
  }, [user]);

  const visibleGrievances = useMemo(() => myGrievances
    .filter((item) => !statusFilter || item.current_status === statusFilter)
    .slice(0, showAll ? undefined : 3), [myGrievances, showAll, statusFilter]);

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
        <div>
          <h1>Track a Grievance</h1>
          <p>Track the status of your submitted grievances using your Grievance ID and Secret Code.</p>
          <small>Your privacy and anonymity are always protected.</small>
        </div>
        <div className="track-hero-art" aria-hidden="true"><span className="clip">▣</span><span className="paper">✓<i /> <i /> <i /></span><span className="lens" /></div>
      </div>

      <div className="track-workspace">
        <div className="track-tabs" aria-label="Tracking options">
          <span className="active">▧ &nbsp; My Grievances</span>
          <span>◉ &nbsp; Track Anonymously</span>
        </div>
        <div className="track-panels">
          <section className="student-grievances" aria-labelledby="my-grievances-title">
            <div className="panel-heading">
              <div><h2 id="my-grievances-title">My Grievances</h2><p>{user ? 'View and track all grievances you have submitted.' : 'Sign in to view grievances submitted from your account.'}</p></div>
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setShowAll(false); }} aria-label="Filter grievances by status">
                <option value="">All Status</option>
                {[...new Set(myGrievances.map((item) => item.current_status).filter(Boolean))].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
              </select>
            </div>
            {!user ? <p className="empty-note track-empty">Please sign in to see your submitted grievances.</p> : loadingMine ? <p className="empty-note track-empty">Loading your grievances…</p> : myGrievancesError ? <div className="form-alert danger" role="alert">{myGrievancesError}</div> : visibleGrievances.length ? <>
              <ul className="student-grievance-list">
                {visibleGrievances.map((item) => <li key={item.id}>
                  <span className="grievance-type-icon" aria-hidden="true">▤</span>
                  <div className="grievance-summary"><span>{grievanceCode(item.id)}</span><strong>{item.title}</strong><small>{item.department_name || 'Department not assigned'}<b>◷</b>{formatDate(item.created_at)}</small></div>
                  <span className={`status-badge status-${(item.current_status || '').toLowerCase()}`}>{statusLabel(item.current_status)}</span>
                  <Link to={`/grievances/${item.id}`} state={{ backTo: '/grievances/track', backLabel: 'Back to track grievance' }} className="track-details-button">◉ &nbsp; View Details</Link><i className="row-arrow">›</i>
                </li>)}
              </ul>
              {myGrievances.filter((item) => !statusFilter || item.current_status === statusFilter).length > 3 && <button className="show-more" type="button" onClick={() => setShowAll((current) => !current)}>{showAll ? 'Show less' : 'Show more'}⌄</button>}
            </> : <p className="empty-note track-empty">You have not submitted any grievances yet.</p>}
          </section>

          <form className="anonymous-track-panel" onSubmit={submit}>
            <div className="panel-heading"><div><h2><span>♢</span> Track Anonymously</h2><p>Enter your Grievance ID and Secret Code to track anonymously.</p></div></div>
            <div className="track-field"><label htmlFor="grievance-id">Grievance ID</label><div><input id="grievance-id" inputMode="numeric" type="number" min="1" required value={credentials.id} onChange={(event) => setCredentials((current) => ({ ...current, id: event.target.value }))} placeholder="For example: GMS-0007" /><span>▧</span></div></div>
            <div className="track-field"><label htmlFor="secret-code">Secret Code</label><div><input id="secret-code" required value={credentials.secret_code} onChange={(event) => setCredentials((current) => ({ ...current, secret_code: event.target.value }))} placeholder="Your 8-character code" autoCapitalize="characters" /><span>♙</span></div></div>
            {error && <div className="form-alert danger" role="alert">{error}</div>}
            <button className="track-submit" disabled={loading} type="submit">⌕ &nbsp; {loading ? 'Looking up…' : 'Track Grievance'}</button>
            <p className="privacy-message"><span>♢</span> Your identity is protected. No one, including admins, can see your personal information.</p>
          </form>
        </div>
      </div>

      <section className="track-benefits" aria-label="Tracking benefits">
        <div><span className="benefit-icon purple">♙</span><p><strong>Anonymous &amp; Secure</strong>Your identity is protected at every step.</p></div>
        <div><span className="benefit-icon green">♢</span><p><strong>Track Anytime</strong>Check status 24/7 using ID and code.</p></div>
        <div><span className="benefit-icon orange">♧</span><p><strong>Stay Updated</strong>Get updates when there is a new response.</p></div>
        <div><span className="benefit-icon blue">◌</span><p><strong>Need Help?</strong>Contact the support team for assistance.</p></div>
      </section>
      <p className="secret-reminder">ⓘ &nbsp; Lost your secret code? Unfortunately, we cannot retrieve it. Please check your email or documents where you saved it.</p>

      {grievance && <article className="grievance-detail" aria-live="polite">
        <header className="detail-header"><div><span className="detail-id">{grievanceCode(grievance.id)}</span><h2>{grievance.title}</h2><p>Submitted {formatDate(grievance.created_at)}</p></div><span className={`status-badge status-${(grievance.current_status || '').toLowerCase()}`}>{statusLabel(grievance.current_status)}</span></header>
        <dl className="detail-meta"><div><dt>Category</dt><dd>{grievance.category_name || '—'}</dd></div><div><dt>Department</dt><dd>{grievance.department_name || '—'}</dd></div><div><dt>Submitted by</dt><dd>{grievance.is_anonymous ? 'Anonymous' : grievance.submitter_name || 'Not available'}</dd></div><div><dt>Last updated</dt><dd>{formatDate(grievance.updated_at)}</dd></div></dl>
        <section><h3>Details</h3><p className="detail-description">{grievance.description}</p></section>
        <section><h3>Official responses</h3>{grievance.responses?.length ? <div className="response-list">{grievance.responses.map((response) => <article key={response.id} className="response-card"><header><strong>{response.responder_name || 'Department representative'}</strong><time>{formatDate(response.created_at)}</time></header><p>{response.content}</p></article>)}</div> : <p className="empty-note">No official response has been posted yet.</p>}</section>
      </article>}
    </section>
  );
};

export default TrackGrievance;
