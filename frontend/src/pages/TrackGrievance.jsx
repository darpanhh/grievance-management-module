import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—';
const statusLabel = (status) => (status || 'SUBMITTED').replace(/_/g, ' ');

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

  const viewMyGrievance = async (id) => {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.get(`grievances/${id}/`);
      setGrievance(data);
      document.querySelector('.grievance-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="grievance-page track-page">
      <div className="grievance-container">
        <div className="page-heading"><span>Grievance tracking</span><h1>Track a grievance</h1><p>{user ? 'All grievances submitted from your account, including anonymous ones, are listed below. No ID or secret code is needed.' : 'Enter the grievance ID and the secret code you received after anonymous submission.'}</p></div>
        {user && <section className="my-grievances" aria-labelledby="my-grievances-title">
          <div className="my-grievances-heading"><div><h2 id="my-grievances-title">My grievances</h2><p>Signed in as {user.email || user.username}</p></div></div>
          {loadingMine ? <p className="empty-note">Loading your grievances…</p> : myGrievancesError ? <div className="form-alert danger" role="alert">{myGrievancesError}</div> : myGrievances.length ? <ul className="my-grievance-list">{myGrievances.map((item) => <li key={item.id}><div><span className="detail-id">GMS-{String(item.id).padStart(4, '0')}</span><strong>{item.title}</strong><small>{item.department_name || 'Department not assigned'} · Submitted {formatDate(item.created_at)}</small></div><div className="my-grievance-actions"><span className={`status-badge status-${(item.current_status || '').toLowerCase()}`}>{statusLabel(item.current_status)}</span><button type="button" className="btn btn-outline" onClick={() => viewMyGrievance(item.id)} disabled={loading}>View details</button></div></li>)}</ul> : <p className="empty-note">You have not submitted any grievances yet.</p>}
        </section>}
        {user && <div className="tracking-divider"><span>Or use an anonymous tracking code</span></div>}
        <form className="tracking-form" onSubmit={submit}>
          <div className="form-group"><label htmlFor="grievance-id">Grievance ID</label><input id="grievance-id" inputMode="numeric" type="number" min="1" required value={credentials.id} onChange={(event) => setCredentials((current) => ({ ...current, id: event.target.value }))} placeholder="For example: 42" /></div>
          <div className="form-group"><label htmlFor="secret-code">Secret code</label><input id="secret-code" required value={credentials.secret_code} onChange={(event) => setCredentials((current) => ({ ...current, secret_code: event.target.value }))} placeholder="Your 8-character code" autoCapitalize="characters" /></div>
          {error && <div className="form-alert danger" role="alert">{error}</div>}
          <button className="btn btn-primary" disabled={loading} type="submit">{loading ? 'Looking up…' : 'Track grievance'}</button>
        </form>

        {grievance && <article className="grievance-detail" aria-live="polite">
          <header className="detail-header"><div><span className="detail-id">GMS-{String(grievance.id).padStart(4, '0')}</span><h2>{grievance.title}</h2><p>Submitted {formatDate(grievance.created_at)}</p></div><span className={`status-badge status-${(grievance.current_status || '').toLowerCase()}`}>{statusLabel(grievance.current_status)}</span></header>
          <dl className="detail-meta"><div><dt>Category</dt><dd>{grievance.category_name || '—'}</dd></div><div><dt>Department</dt><dd>{grievance.department_name || '—'}</dd></div><div><dt>Submitted by</dt><dd>{grievance.is_anonymous ? 'Anonymous' : grievance.submitter_name || 'Not available'}</dd></div><div><dt>Last updated</dt><dd>{formatDate(grievance.updated_at)}</dd></div></dl>
          <section><h3>Details</h3><p className="detail-description">{grievance.description}</p></section>
          {grievance.attachments?.length > 0 && <section><h3>Attachments</h3><ul className="attachment-list">{grievance.attachments.map((attachment) => <li key={attachment.id}>{attachment.file ? <a href={attachment.file} target="_blank" rel="noreferrer">{attachment.file_name}</a> : attachment.file_name} <small>uploaded {formatDate(attachment.uploaded_at)}</small></li>)}</ul></section>}
          <section><h3>Official responses</h3>{grievance.responses?.length ? <div className="response-list">{grievance.responses.map((response) => <article key={response.id} className="response-card"><header><strong>{response.responder_name || 'Department representative'}</strong><time>{formatDate(response.created_at)}</time></header><p>{response.content}</p></article>)}</div> : <p className="empty-note">No official response has been posted yet.</p>}</section>
          <section><h3>Status history</h3>{grievance.status_history?.length ? <ol className="history-list">{grievance.status_history.map((entry) => <li key={entry.id}><span className="history-dot" /><div><strong>{statusLabel(entry.new_status)}</strong><time>{formatDate(entry.created_at)}</time>{entry.remarks && <p>{entry.remarks}</p>}</div></li>)}</ol> : <p className="empty-note">No status history is available yet.</p>}</section>
        </article>}
      </div>
    </section>
  );
};

export default TrackGrievance;
