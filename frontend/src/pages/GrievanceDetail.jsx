import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—';

const GrievanceDetail = () => {
  const { id } = useParams();
  const [grievance, setGrievance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadGrievance = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get(`grievances/${id}/`); setGrievance(data); }
    catch (requestError) { setError(requestError.response?.status === 404 ? 'This grievance was not found or you do not have access to it.' : 'We could not load this grievance. Please try again.'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { loadGrievance(); }, [loadGrievance]);

  if (loading) return <div className="dashboard-state"><div className="spinner" /><p>Loading grievance…</p></div>;
  if (error) return <div className="dashboard-state error-state"><h1>Unable to load grievance</h1><p>{error}</p><div className="detail-actions"><button className="btn btn-primary" onClick={loadGrievance}>Try again</button><Link className="btn btn-outline" to="/dashboard/student">Back to dashboard</Link></div></div>;

  return <section className="dashboard-page"><div className="dashboard-container detail-page-container"><Link className="back-link" to="/dashboard/student">← Back to my grievances</Link><article className="grievance-detail">
    <header className="detail-header"><div><span className="detail-id">GMS-{String(grievance.id).padStart(4, '0')}</span><h1>{grievance.title}</h1><p>Submitted {formatDate(grievance.created_at)}</p></div><StatusBadge status={grievance.current_status} /></header>
    <dl className="detail-meta"><div><dt>Category</dt><dd>{grievance.category_name || '—'}</dd></div><div><dt>Department</dt><dd>{grievance.department_name || '—'}</dd></div><div><dt>Submitted by</dt><dd>{grievance.is_anonymous ? 'Anonymous' : grievance.submitter_name || 'Not available'}</dd></div><div><dt>Last updated</dt><dd>{formatDate(grievance.updated_at)}</dd></div></dl>
    <section><h2>Grievance details</h2><p className="detail-description">{grievance.description}</p></section>
    <section><h2>Attachments</h2>{grievance.attachments?.length ? <ul className="attachment-list">{grievance.attachments.map((attachment) => <li key={attachment.id}><span><strong>{attachment.file_name}</strong><small>{attachment.file_type || 'Attachment'} · uploaded {formatDate(attachment.uploaded_at)}</small></span>{attachment.file && <a className="btn btn-outline attachment-download" href={attachment.file} target="_blank" rel="noreferrer" download>Download</a>}</li>)}</ul> : <p className="empty-note">No files were attached to this grievance.</p>}</section>
    {grievance.ai_analysis && <section className={`ai-analysis ${grievance.ai_analysis.spam_prediction ? 'is-spam' : ''}`}><h2>AI analysis</h2><dl><div><dt>Classification</dt><dd>{grievance.ai_analysis.spam_prediction ? 'Flagged as spam' : 'Not flagged as spam'}</dd></div><div><dt>Confidence</dt><dd>{Math.round((Number(grievance.ai_analysis.confidence_score) || 0) * 100)}%</dd></div>{grievance.ai_analysis.sentiment && <div><dt>Sentiment</dt><dd>{grievance.ai_analysis.sentiment}</dd></div>}</dl><p>{grievance.ai_analysis.classification_reason || 'No explanation was provided.'}</p></section>}
    <section><h2>Official responses</h2>{grievance.responses?.length ? <div className="response-list">{grievance.responses.map((response) => <article key={response.id} className="response-card"><header><strong>{response.responder_name || 'Department representative'}</strong><time>{formatDate(response.created_at)}</time></header><p>{response.content}</p></article>)}</div> : <p className="empty-note">No official response has been posted yet.</p>}</section>
    <section><h2>Status history</h2>{grievance.status_history?.length ? <ol className="history-list">{grievance.status_history.map((entry) => <li key={entry.id}><span className="history-dot" /><div><StatusBadge status={entry.new_status} /><time>{formatDate(entry.created_at)}</time>{entry.remarks && <p>{entry.remarks}</p>}</div></li>)}</ol> : <p className="empty-note">No status history is available yet.</p>}</section>
    <div className="detail-actions"><button className="btn btn-outline" disabled>Reply (coming soon)</button><button className="btn btn-outline" disabled>Reopen (coming soon)</button></div>
  </article></div></section>;
};

export default GrievanceDetail;
