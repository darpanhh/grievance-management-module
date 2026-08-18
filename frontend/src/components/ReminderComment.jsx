import { useState } from 'react';
import api from '../services/api';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—';
const statusLabel = (status) => status ? status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : '';

const POSTABLE_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'REOPENED'];
const MAX_LENGTH = 2000;

const ReminderCommentList = ({ grievance }) => {
  const comments = grievance.status_comments || [];

  if (!comments.length) return null;

  return (
    <section className="detail-section">
      <h2 className="section-title">
        <span className="section-title-accent" />
        Reminder Comments
      </h2>
      <div className="status-comment-list">
        {comments.map((comment) => (
          <article key={comment.id} className="status-comment-card">
            <header className="status-comment-header">
              <span className="status-comment-tag">{comment.status_display || statusLabel(comment.status)}</span>
            </header>
            <p>{comment.content}</p>
            <div className="request-audit-meta">
              <span>{comment.user_name || (grievance.is_anonymous ? 'Anonymous' : 'Submitter')}</span>
              <span>Posted {formatDate(comment.created_at)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

const ReminderCommentForm = ({ grievance, isSubmitter, canPost = true, onCommented }) => {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const comments = grievance.status_comments || [];
  const status = grievance.current_status;
  const alreadyPosted = comments.some((comment) => comment.status === status);
  const showForm = canPost && isSubmitter && POSTABLE_STATUSES.includes(status) && !alreadyPosted;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const value = content.trim();
    if (!value) {
      setError('Please write your reminder comment before posting.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await api.post(`grievances/${grievance.id}/comment/`, { content: value });
      setContent('');
      if (onCommented) onCommented();
    } catch (err) {
      const respData = err.response?.data;
      const msg = typeof respData === 'string'
        ? respData
        : respData?.error || respData?.detail || 'Failed to post your comment. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!showForm) {
    return null;
  }

  return (
    <section className="detail-section">
      <form className="status-comment-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="status-comment-content">
            Remind the department <small>(one comment per status)</small>
          </label>
          <textarea
            id="status-comment-content"
            value={content}
            onChange={(e) => {
              setContent(e.target.value.slice(0, MAX_LENGTH));
              if (error) setError('');
            }}
            placeholder={`Write a short reminder asking for an update on this ${statusLabel(status).toLowerCase()} grievance...`}
            rows="3"
            maxLength={MAX_LENGTH}
            required
          />
          {error && <div className="workflow-toast error">{error}</div>}
        </div>
        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Posting...' : 'Post Reminder'}
          </button>
        </div>
      </form>
    </section>
  );
};

export { ReminderCommentList, ReminderCommentForm };