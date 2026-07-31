import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—';

const GrievanceDetail = () => {
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const backTo = location.state?.backTo || '/dashboard/student';
  const backLabel = location.state?.backLabel || 'Back to my grievances';
  const [grievance, setGrievance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Action state
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [respondOpen, setRespondOpen] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenText, setReopenText] = useState('');

  const loadGrievance = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get(`grievances/${id}/`); setGrievance(data); }
    catch (requestError) { setError(requestError.response?.status === 404 ? 'This grievance was not found or you do not have access to it.' : 'We could not load this grievance. Please try again.'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { loadGrievance(); }, [loadGrievance]);

  // ----- Role / ownership helpers -----
  const userRole = (user?.role || '').toUpperCase();
  const isSubmitter = Boolean(user && grievance && grievance.user === user.id);
  const isDeptMatch = Boolean(user && grievance && grievance.department === user.department);
  const isCampusAdmin = userRole === 'CAMPUS_ADMIN';

  const runAction = async (endpoint, label) => {
    setBusy(label); setActionError(''); setNotice('');
    try {
      const { data } = await api.post(`grievances/${id}/${endpoint}/`);
      if (data?.id) {
        // Most transitions return the updated grievance.
        setGrievance(data);
      } else {
        // Confirmation-only responses (e.g. appeal-spam) return a message
        // instead of the grievance — reload and show the server's note.
        await loadGrievance();
        setNotice(data?.detail || `${label} done.`);
      }
      setRespondOpen(false);
    } catch (err) {
      setActionError(err.response?.data?.error || err.response?.data?.detail || `Could not ${label.toLowerCase()}. Please try again.`);
    } finally { setBusy(''); }
  };

  const submitResponse = async (event) => {
    event.preventDefault();
    if (!responseText.trim()) return;
    setBusy('respond'); setActionError(''); setNotice('');
    try {
      const { data } = await api.post(`grievances/${id}/respond/`, { content: responseText.trim() });
      setGrievance(data);
      setResponseText('');
      setRespondOpen(false);
    } catch (err) {
      setActionError(err.response?.data?.error || err.response?.data?.detail || 'Could not post the response. Please try again.');
    } finally { setBusy(''); }
  };

  const submitReopen = async (event) => {
    event.preventDefault();
    if (!reopenText.trim()) return;
    setBusy('reopen'); setActionError(''); setNotice('');
    try {
      const { data } = await api.post(`grievances/${id}/reopen/`, { comment: reopenText.trim() });
      setGrievance(data);
      setReopenText('');
      setReopenOpen(false);
    } catch (err) {
      setActionError(err.response?.data?.error || err.response?.data?.detail || 'Could not reopen the grievance. Please try again.');
    } finally { setBusy(''); }
  };

  // ----- Build the action set for the current role + status -----
  let canRespond = false;
  const actions = [];

  if (grievance) {
    const status = grievance.current_status;

    if (isSubmitter) {
      if (status === 'SPAM') actions.push({ key: 'appeal', label: 'Appeal spam classification', endpoint: 'appeal-spam' });
      if (status === 'RESPONDED') {
        actions.push({ key: 'resolve', label: 'Mark as resolved', endpoint: 'resolve' });
        actions.push({ key: 'reopen', label: 'Reopen for further review', endpoint: 'reopen', needsComment: true });
      }
      if (status === 'RESOLVED') {
        // The submitter already marked it resolved (satisfied) — only
        // closing remains; reopening is no longer offered at this stage.
        actions.push({ key: 'close', label: 'Close grievance', endpoint: 'resolve' });
      }
    }

    if (userRole === 'HOD' && isDeptMatch) {
      if (status === 'SUBMITTED') actions.push({ key: 'review', label: 'Start review', endpoint: 'review' });
      if (status === 'SPAM') {
        actions.push({ key: 'reinstate', label: 'Reinstate from spam', endpoint: 'reinstate-spam' });
        actions.push({ key: 'review', label: 'Review (keep open)', endpoint: 'review' });
      }
      if (status === 'UNDER_REVIEW' || status === 'REOPENED') canRespond = true;
    }

    if (isCampusAdmin) {
      if (status === 'ESCALATED') actions.push({ key: 'review', label: 'Take into review', endpoint: 'review' });
      if (status === 'UNDER_REVIEW' || status === 'REOPENED') canRespond = true;
    }
  }

  if (loading) return <div className="dashboard-state"><div className="spinner" /><p>Loading grievance…</p></div>;
  if (error) return <div className="dashboard-state error-state"><h1>Unable to load grievance</h1><p>{error}</p><div className="detail-actions"><button className="btn btn-primary" onClick={loadGrievance}>Try again</button><Link className="btn btn-outline" to={backTo}>{backLabel}</Link></div></div>;

  return <section className="dashboard-page"><div className="dashboard-container detail-page-container"><Link className="back-link" to={backTo}>← {backLabel}</Link><article className="grievance-detail">
    <header className="detail-header"><div><span className="detail-id">GMS-{String(grievance.id).padStart(4, '0')}</span><h1>{grievance.title}</h1><p>Submitted {formatDate(grievance.created_at)}</p></div><StatusBadge status={grievance.current_status} /></header>
    <dl className="detail-meta"><div><dt>Category</dt><dd>{grievance.category_name || '—'}</dd></div><div><dt>Department</dt><dd>{grievance.department_name || '—'}</dd></div><div><dt>Submitted by</dt><dd>{grievance.is_anonymous ? 'Anonymous' : grievance.submitter_name || 'Not available'}</dd></div><div><dt>Last updated</dt><dd>{formatDate(grievance.updated_at)}</dd></div>{grievance.escalation_level > 0 && <><div><dt>Escalation level</dt><dd>{grievance.escalation_level}</dd></div><div><dt>Escalated to</dt><dd>{grievance.escalated_to_name || 'Campus administration'}</dd></div></>}</dl>
    <section><h2>Grievance details</h2><p className="detail-description">{grievance.description}</p></section>
    <section><h2>Attachments</h2>{grievance.attachments?.length ? <ul className="attachment-list">{grievance.attachments.map((attachment) => <li key={attachment.id}><span><strong>{attachment.file_name}</strong><small>{attachment.file_type || 'Attachment'} · uploaded {formatDate(attachment.uploaded_at)}</small></span>{attachment.file && <a className="btn btn-outline attachment-download" href={attachment.file} target="_blank" rel="noreferrer" download>Download</a>}</li>)}</ul> : <p className="empty-note">No files were attached to this grievance.</p>}</section>
    {grievance.ai_analysis && <section className={`ai-analysis ${grievance.ai_analysis.spam_prediction ? 'is-spam' : ''}`}><h2>AI analysis</h2><dl><div><dt>Classification</dt><dd>{grievance.ai_analysis.spam_prediction ? 'Flagged as spam' : 'Not flagged as spam'}</dd></div><div><dt>Confidence</dt><dd>{Math.round((Number(grievance.ai_analysis.confidence_score) || 0) * 100)}%</dd></div>{grievance.ai_analysis.sentiment && <div><dt>Sentiment</dt><dd>{grievance.ai_analysis.sentiment}</dd></div>}</dl><p>{grievance.ai_analysis.classification_reason || 'No explanation was provided.'}</p></section>}
    <section><h2>Official responses</h2>{grievance.responses?.length ? <div className="response-list">{grievance.responses.map((response) => <article key={response.id} className="response-card"><header><strong>{response.responder_name || 'Department representative'}</strong><time>{formatDate(response.created_at)}</time></header><p>{response.content}</p></article>)}</div> : <p className="empty-note">No official response has been posted yet.</p>}</section>
    <section><h2>Status history</h2>{grievance.status_history?.length ? <ol className="history-list">{grievance.status_history.map((entry) => <li key={entry.id}><span className="history-dot" /><div><StatusBadge status={entry.new_status} /><time>{formatDate(entry.created_at)}</time>{entry.remarks && <p>{entry.remarks}</p>}</div></li>)}</ol> : <p className="empty-note">No status history is available yet.</p>}</section>
    {(actions.length > 0 || canRespond) && <section><h2>Actions</h2>
      {notice && <div className="form-alert success" role="status">{notice}</div>}
      {actionError && <div className="form-alert danger" role="alert">{actionError}</div>}
      <div className="detail-actions">
        {actions.map((action) => action.needsComment
          ? <button key={action.key} className="btn btn-outline" disabled={busy === action.label} onClick={() => { setReopenOpen((open) => !open); setActionError(''); setNotice(''); }}>{reopenOpen ? 'Cancel reopen' : action.label}</button>
          : <button key={action.key} className="btn btn-primary" disabled={busy === action.label} onClick={() => runAction(action.endpoint, action.label)}>{busy === action.label ? 'Working…' : action.label}</button>)}
        {canRespond && <button className="btn btn-outline" onClick={() => setRespondOpen((open) => !open)} disabled={busy === 'respond'}>{respondOpen ? 'Cancel response' : 'Post response'}</button>}
      </div>
      {reopenOpen && <form className="grievance-form" onSubmit={submitReopen} style={{ marginTop: '1rem' }}>
        <div className="form-group"><label htmlFor="reopen-comment">Reason for reopening</label><textarea id="reopen-comment" value={reopenText} onChange={(event) => setReopenText(event.target.value)} minLength="5" required placeholder="Explain why this grievance needs further review." rows="5" /><small>{reopenText.length}/2000 characters</small></div>
        <button className="btn btn-primary" type="submit" disabled={busy === 'reopen' || reopenText.trim().length < 5}>{busy === 'reopen' ? 'Reopening…' : 'Confirm reopen'}</button>
      </form>}
      {canRespond && respondOpen && <form className="grievance-form" onSubmit={submitResponse} style={{ marginTop: '1rem' }}>
        <div className="form-group"><label htmlFor="response-content">Official response</label><textarea id="response-content" value={responseText} onChange={(event) => setResponseText(event.target.value)} minLength="5" required placeholder="Post an official response on behalf of the department or campus administration." rows="5" /><small>{responseText.length}/2000 characters</small></div>
        <button className="btn btn-primary" type="submit" disabled={busy === 'respond' || responseText.trim().length < 5}>{busy === 'respond' ? 'Posting…' : 'Post response'}</button>
      </form>}
    </section>}
  </article></div></section>;
};

export default GrievanceDetail;
