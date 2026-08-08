import { useState } from 'react';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—';
const statusLabel = (status) => status ? status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Initial submission';
const responderLabel = (response) => {
  if (response.responder_role === 'Head of Department') return 'HOD';
  if (response.responder_role === 'Campus Admin') return 'Campus Admin';
  return response.responder_name || 'Department Representative';
};
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

      {!grievance && (
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
      )}

      {grievance && <article className="grievance-detail track-result" aria-live="polite">
        <button className="track-result-close" onClick={() => setGrievance(null)} aria-label="Close grievance result">&times;</button>
        <header className="track-result-head">
          <h1>{grievance.title}</h1>
          <StatusBadge status={grievance.current_status} />
        </header>

        <section className="detail-section">
          <h2 className="section-title"><span className="section-title-accent" />Official Responses</h2>
          {grievance.responses?.length ? (
            <div className="response-list">
              {[...grievance.responses].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((response) => (
                <article key={response.id} className="response-card">
                  <header><strong>{responderLabel(response)}</strong><time>{formatDate(response.created_at)}</time></header>
                  <p>{response.content}</p>
                </article>
              ))}
            </div>
          ) : <p className="empty-note">No official response has been posted yet.</p>}
        </section>

        <section className="detail-section">
          <h2 className="section-title"><span className="section-title-accent" />Status History & Audit Trail</h2>
          {grievance.status_history?.length ? (
            <div className="audit-timeline">
              {grievance.status_history.map((entry, index) => (
                <div key={entry.id || index} className="timeline-item">
                  <div className="timeline-marker-col">
                    <span className="timeline-marker-dot" />
                    {index < grievance.status_history.length - 1 && <span className="timeline-line" />}
                  </div>
                  <div className="timeline-card">
                    <div className="timeline-card-header">
                      <div className="timeline-transition">
                        <span className="from-status-tag">{statusLabel(entry.previous_status)}</span>
                        <svg className="transition-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                        <StatusBadge status={entry.new_status} />
                      </div>
                      <time className="timeline-timestamp">{formatDate(entry.created_at)}</time>
                    </div>
                    <div className="timeline-actor-row">
                      <span className="actor-badge">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                        Action by <strong>{entry.action_by_name || 'System'}</strong>
                      </span>
                    </div>
                    {entry.remarks && <div className="timeline-remarks-box"><p>{entry.remarks}</p></div>}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="empty-note">No status history available.</p>}
        </section>
      </article>}
    </section>
  );
};

export default TrackGrievance;