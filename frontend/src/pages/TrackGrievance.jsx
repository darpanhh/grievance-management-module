import { useState } from 'react';
import api from '../services/api';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—';
const statusLabel = (status) => (status || 'SUBMITTED').replace(/_/g, ' ');
const grievanceCode = (id) => `GMS-${String(id).padStart(4, '0')}`;
const errorMessage = (error) => error.response?.data?.error || error.response?.data?.detail || 'We could not find a grievance with those details. Check the ID and secret code and try again.';

const TrackGrievance = () => {
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
        <div><h1>Track a grievance</h1><p>Enter the Grievance ID and Secret Code you received when submitting your concern.</p></div>
      </div>

      <div className="track-workspace track-lookup-workspace">
        <form className="anonymous-track-panel" onSubmit={submit}>
          <div className="panel-heading"><div><h2>Find your grievance</h2><p>Enter the details exactly as they were provided.</p></div></div>
          <div className="track-fields-row">
            <div className="track-field"><label htmlFor="grievance-id">Grievance ID</label><input id="grievance-id" inputMode="numeric" type="number" min="1" required value={credentials.id} onChange={(event) => setCredentials((current) => ({ ...current, id: event.target.value }))} placeholder="e.g. GMS-0007" /></div>
            <div className="track-field"><label htmlFor="secret-code">Secret Code</label><input id="secret-code" required value={credentials.secret_code} onChange={(event) => setCredentials((current) => ({ ...current, secret_code: event.target.value }))} placeholder="Your 8-character code" autoCapitalize="characters" /></div>
          </div>
          {error && <div className="form-alert danger" role="alert">{error}</div>}
          <button className="track-submit" disabled={loading} type="submit">⌕ &nbsp; {loading ? 'Looking up…' : 'Track Grievance'}</button>
          
        </form>
      </div>

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