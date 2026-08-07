import { useEffect, useState } from 'react';
import api from '../services/api';
import StatusBadge from './StatusBadge';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—';

const previewKindFromUrl = (url) => {
  const lower = (url || '').toLowerCase().split('?')[0];
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower)) return 'image';
  if (/\.pdf$/.test(lower)) return 'pdf';
  return 'other';
};

const isImageAttachment = (a) => (a.file_type || '').toLowerCase().startsWith('image/');
const canPreviewAttachment = (a) => Boolean(a?.file) && (isImageAttachment(a) || (a.file_type || '').toLowerCase().includes('pdf'));

const requestTypeLabel = (type) => {
  switch (type) {
    case 'REOPEN': return 'Reopen Request';
    case 'REJECTION_APPEAL': return 'Rejection Appeal';
    case 'SPAM_APPEAL': return 'Spam Appeal';
    case 'ESCALATION': return 'Escalation';
    default: return type || 'Request';
  }
};

const cleanReason = (reason) => {
  if (!reason) return '';
  const match = reason.match(/^HOD .+? escalated:\s*/);
  return match ? reason.slice(match[0].length) : reason;
};

const AdminRequestDetailModal = ({ requestItem, departments, onClose, onSuccess }) => {
  const [grievance, setGrievance] = useState(null);
  const [loadingGrievance, setLoadingGrievance] = useState(true);
  const [content, setContent] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('IN_PROGRESS');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fullScreenPreview, setFullScreenPreview] = useState(null);
  const [revealSensitive, setRevealSensitive] = useState(false);

  useEffect(() => {
    const loadGrievanceDetails = async () => {
      setLoadingGrievance(true);
      try {
        const { data } = await api.get(`grievances/${requestItem.grievance}/`);
        setGrievance(data);
      } catch {
        setError('Failed to load associated grievance details.');
      } finally {
        setLoadingGrievance(false);
      }
    };

    if (requestItem?.grievance) {
      loadGrievanceDetails();
    }
  }, [requestItem]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const gmsId = `GMS-${String(requestItem.grievance).padStart(4, '0')}`;
      if (selectedStatus === 'RESOLVED') {
        await api.post(`grievances/${requestItem.grievance}/resolve/`, {
          content: content.trim() || `Resolved by Campus Admin.`,
        });
      } else {
        await api.post(`grievances/${requestItem.grievance}/respond/`, {
          content: content.trim() || `Status updated to ${selectedStatus} by Campus Admin.`,
          status: selectedStatus,
        });
      }
      onSuccess(`Grievance ${gmsId} status updated to ${selectedStatus}.`);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || 'Action failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const isPending = requestItem.status === 'PENDING';
  const submitterName = grievance?.is_anonymous ? 'Anonymous' : grievance?.submitter_name || requestItem.student_name || '—';
  const needsSensitiveGate = Boolean(grievance?.is_sensitive) && !revealSensitive;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="admin-request-modal" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="arm-header">
          <div className="arm-header-top">
            <span className={`req-type-pill req-type-${requestItem.request_type.toLowerCase()}`}>{requestTypeLabel(requestItem.request_type)}</span>
          </div>
          <h2>Request Review: GMS-{String(requestItem.grievance).padStart(4, '0')}</h2>
          <button type="button" className="arm-close" onClick={onClose} aria-label="Close modal">&times;</button>
        </div>

        {error && <div className="arm-error" role="alert">{error}</div>}

        {/* Sensitive Gate */}
        {needsSensitiveGate ? (
          <div className="arm-body">
            <div className="sensitive-gate-overlay" role="alertdialog" aria-modal="true" aria-labelledby="arm-sensitive-gate-title">
              <div className="sensitive-gate-modal">
                <div className="sensitive-gate-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                </div>
                <h3 id="arm-sensitive-gate-title">Sensitive Grievance</h3>
                <p>This grievance has been marked as sensitive by the student. It may contain confidential, personal, or otherwise sensitive information.</p>
                <p className="sensitive-gate-confirm">Are you sure you want to view the sensitive content?</p>
                <div className="sensitive-gate-actions">
                  <button className="btn btn-outline" onClick={onClose}>Cancel</button>
                  <button className="btn btn-warning" onClick={() => setRevealSensitive(true)}>View Sensitive Content</button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="arm-body">
              {/* ── Original Grievance ── */}
              {loadingGrievance ? (
                <div className="arm-loading"><div className="spinner" /><p>Loading grievance record…</p></div>
              ) : grievance ? (
                <div className="arm-section arm-grievance">
                  <div className="arm-section-label">Original Grievance</div>
                  <div className="arm-grievance-header">
                    <h3 className="arm-grievance-title">{grievance.title}</h3>
                    <StatusBadge status={grievance.current_status} />
                  </div>
                  <dl className="arm-meta-grid arm-meta-minor">
                    <div><dt>Submitted By</dt><dd>{submitterName}</dd></div>
                    <div><dt>Submission Date</dt><dd>{formatDate(grievance.created_at)}</dd></div>
                    <div><dt>Assigned Department</dt><dd>{grievance.department_name || 'Unassigned'}</dd></div>
                  </dl>

                  <div className="arm-description-block">
                    <strong>Description</strong>
                    <p className="arm-grievance-description">{grievance.description}</p>
                  </div>

                  {grievance.attachments?.length > 0 && (
                    <div className="arm-grievance-attachments">
                      <strong>Attachments</strong>
                      <ul className="arm-attachment-list">
                        {grievance.attachments.map((att) => (
                          <li key={att.id}>
                            <span>{att.file_name}</span>
                            {att.file && canPreviewAttachment(att) && (
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => setFullScreenPreview(att)}>
                                Preview
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}

              {/* ── HOD Response ── */}
              <div className="arm-section arm-request-info">
                <div className="arm-section-label">HOD Response</div>
                <dl className="arm-meta-grid">
                  <div><dt>HOD</dt><dd>{requestItem.hod_name || '—'}</dd></div>
                  <div><dt>Date</dt><dd>{formatDate(requestItem.created_at)}</dd></div>
                  <div><dt>Request Type</dt><dd>{requestTypeLabel(requestItem.request_type)}</dd></div>
                </dl>
                <div className="arm-reason-box">
                  <strong>Reason:</strong>
                  <p>{cleanReason(requestItem.reason)}</p>
                </div>
                {requestItem.attachment && (
                  <div className="arm-attachment">
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setFullScreenPreview({ id: 'req', file: requestItem.attachment, file_name: 'Attachment', file_type: previewKindFromUrl(requestItem.attachment) === 'image' ? 'image/jpeg' : 'application/pdf' })}>
                      Preview Attachment
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Admin Action Panel ── */}
            {isPending ? (
              <form className="arm-footer" onSubmit={handleSubmit}>
                <div className="arm-status-select">
                  <label htmlFor="admin-status-select">Select New Status</label>
                  <select
                    id="admin-status-select"
                    className="status-select-dropdown"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                  >
                    <option value="UNDER_REVIEW">Under Review (Reviewing Submission)</option>
                    <option value="IN_PROGRESS">In Progress (Active Investigation)</option>
                    <option value="RESOLVED">Resolved (Mark Issue as Solved)</option>
                    <option value="REJECTED">Rejected (Decline / Reject Grievance)</option>
                  </select>
                </div>

                <div className="status-transition-preview">
                  <span>Current Status: <StatusBadge status={grievance?.current_status || 'ESCALATED'} /></span>
                  <span className="arrow">→</span>
                  <span>New Status: <StatusBadge status={selectedStatus} /></span>
                </div>

                <div className="form-group">
                  <label htmlFor="admin-content">Official Response / Remarks <span className="required-star">*</span></label>
                  <textarea
                    id="admin-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write your official response or remarks…"
                    rows="4"
                    autoFocus
                    required
                  />
                </div>

                <div className="arm-footer-actions">
                  <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Saving…' : 'Update Status & Post'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="arm-footer arm-resolved">
                <div>
                  <strong>Decision:</strong> {requestItem.status_display || requestItem.status}
                  {requestItem.reviewed_by_admin_name && <span> — by {requestItem.reviewed_by_admin_name} on {formatDate(requestItem.resolved_at)}</span>}
                  {requestItem.admin_remark && <p className="arm-admin-remark">"{requestItem.admin_remark}"</p>}
                </div>
                <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Full-screen Attachment Preview ── */}
      {fullScreenPreview && (
        <div className="preview-overlay" onClick={() => setFullScreenPreview(null)}>
          <button className="preview-close" onClick={() => setFullScreenPreview(null)} aria-label="Close preview">&times;</button>
          <div className="preview-content" onClick={(e) => e.stopPropagation()}>
            {(fullScreenPreview.file_type || '').toLowerCase().startsWith('image/') ? (
              <img src={fullScreenPreview.file} alt={fullScreenPreview.file_name || 'Preview'} />
            ) : (
              <iframe src={`${fullScreenPreview.file}#toolbar=0&download=0`} title={fullScreenPreview.file_name || 'Preview'} />
            )}
          </div>
          <div className="preview-footer" onClick={(e) => e.stopPropagation()}>
            {fullScreenPreview.file_name || 'Attachment'}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminRequestDetailModal;
