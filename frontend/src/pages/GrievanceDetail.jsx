import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import RequestModal from '../components/RequestModal';
import { ReminderCommentList, ReminderCommentForm } from '../components/ReminderComment';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—';
const statusLabel = (status) => status ? status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Initial submission';
const isImageAttachment = (attachment) => (attachment.file_type || '').toLowerCase().startsWith('image/');
const canPreviewAttachment = (attachment) => Boolean(attachment?.file) && (isImageAttachment(attachment) || (attachment.file_type || '').toLowerCase().includes('pdf'));
const previewKindFromUrl = (url) => {
  const lower = (url || '').toLowerCase().split('?')[0];
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower)) return 'image';
  if (/\.pdf$/.test(lower)) return 'pdf';
  return 'other';
};

const GrievanceDetail = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const backTo = location.state?.backTo || '/dashboard';
  const backLabel = location.state?.backLabel || 'Back to grievances';
  const [grievance, setGrievance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null);
  const [requestModalType, setRequestModalType] = useState(null); // 'REOPEN'
  const [previewId, setPreviewId] = useState(null);
  const [revealSensitive, setRevealSensitive] = useState(false);
  const [content, setContent] = useState('');
  const [escalateReason, setEscalateReason] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('UNDER_REVIEW');
  const [submitting, setSubmitting] = useState(false);
  const [spamSubmitting, setSpamSubmitting] = useState(false);

  const loadGrievance = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    setRevealSensitive(false);
    try {
      const { data } = await api.get(`grievances/${id}/`);
      setGrievance(data);
    } catch (requestError) {
      setError(requestError.response?.status === 404 ? 'not-found' : 'We could not load this grievance. Please try again.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadGrievance(); }, [loadGrievance]);

  const previewAttachments = [
    ...(grievance?.attachments || []).filter((a) => a.file && canPreviewAttachment(a)),
    ...(grievance?.reopen_attachments || []).filter((a) => a.file && canPreviewAttachment(a)),
    ...(grievance?.requests || []).filter(r => r.attachment && r.request_type !== 'ESCALATION').map(r => ({
      id: `req-${r.id}`,
      file: r.attachment,
      file_name: r.attachment.split('/').pop() || 'Supporting Document',
    })),
  ];
  const previewIndex = previewId !== null ? previewAttachments.findIndex((a) => {
    if (previewId.startsWith('req-')) return a.id === previewId;
    return `reopen-${a.id}` === previewId || a.id === previewId;
  }) : -1;
  const previewAttachment = previewIndex >= 0 ? previewAttachments[previewIndex] : null;

  const closePreview = () => setPreviewId(null);
  const prevPreview = () => { if (previewAttachments.length > 1) { const prev = previewAttachments[(previewIndex - 1 + previewAttachments.length) % previewAttachments.length]; setPreviewId(prev.id); } };
  const nextPreview = () => { if (previewAttachments.length > 1) { const next = previewAttachments[(previewIndex + 1) % previewAttachments.length]; setPreviewId(next.id); } };

  useEffect(() => {
    if (previewAttachment === null) return;
    const handler = (e) => { if (e.key === 'Escape') closePreview(); if (e.key === 'ArrowLeft') prevPreview(); if (e.key === 'ArrowRight') nextPreview(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewAttachment, previewIndex]);

  const closeModal = () => { setModal(null); setContent(''); setEscalateReason(''); setSelectedStatus('UNDER_REVIEW'); };
  const openModal = (action) => {
    setToast('');
    setContent('');
    setEscalateReason('');
    let defaultStatus = 'UNDER_REVIEW';
    if (action === 'respond' && status) {
      if (isAdminRequestReview) {
        defaultStatus = status === 'UNDER_REVIEW' ? 'IN_PROGRESS' : 'UNDER_REVIEW';
      } else if (status === 'IN_PROGRESS') {
        defaultStatus = 'RESOLVED';
      } else if (status === 'UNDER_REVIEW') {
        defaultStatus = 'IN_PROGRESS';
      }
    }
    setSelectedStatus(defaultStatus);
    setModal(action);
  };

  const actionError = (requestError) => {
    const data = requestError.response?.data;
    if (typeof data === 'string') return data;
    return data?.error || data?.detail || data?.content?.[0] || 'The action could not be completed. Please try again.';
  };

  const runAction = async (action) => {
    const endpoints = {
      respond: `grievances/${id}/respond/`,
      resolve: `grievances/${id}/resolve/`,
      close: `grievances/${id}/close/`,
      hodEscalate: `grievances/${id}/hod-escalate/`,
    };

    // Route to escalation endpoint if ESCALATED is selected
    const isEscalate = action === 'respond' && selectedStatus === 'ESCALATED';
    const actualAction = isEscalate ? 'hodEscalate' : action;

    if (actualAction === 'respond' && !content.trim()) {
      setError('Please enter a response before submitting.');
      return;
    }

    if (actualAction === 'hodEscalate' && !escalateReason.trim()) {
      setError('Please provide a reason for escalation.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const payload = actualAction === 'respond'
        ? { content: content.trim(), status: selectedStatus }
        : actualAction === 'hodEscalate'
          ? { reason: escalateReason.trim() }
          : {};
      await api.post(endpoints[actualAction], payload);
      const messages = {
        respond: `Response posted. Status updated to ${statusLabel(selectedStatus)}.`,
        resolve: 'Grievance resolved successfully.',
        close: 'Grievance closed successfully.',
        hodEscalate: 'Grievance forwarded to Campus Admin.',
      };
      closeModal();
      setToast(messages[actualAction]);
      await loadGrievance(false);
    } catch (requestError) {
      setError(actionError(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSpamReview = async (decision) => {
    setSpamSubmitting(true);
    setError('');
    setToast('');
    try {
      const { data } = await api.post(`grievances/${id}/spam-review/`, { decision });
      setToast(data.message || (decision === 'SPAM' ? 'Grievance marked as spam.' : 'Grievance accepted as genuine.'));
      await loadGrievance(false);
    } catch (requestError) {
      setError(actionError(requestError));
    } finally {
      setSpamSubmitting(false);
    }
  };

  if (loading) return <div className="dashboard-state"><div className="spinner" /><p>Loading grievance…</p></div>;
  if (error === 'not-found') return <div className="dashboard-state error-state"><h1>Grievance not found</h1><p>This grievance does not exist or you do not have access to it.</p><Link className="btn btn-primary" to={backTo}>{backLabel}</Link></div>;
  if (!grievance) return <div className="dashboard-state error-state"><h1>Unable to load grievance</h1><p>{error}</p><button className="btn btn-primary" onClick={() => loadGrievance()}>Try again</button></div>;

  const role = (user?.role || '').toUpperCase();
  const status = grievance.current_status;
  const isHOD = ['HOD', 'DEPARTMENT_ADMIN'].includes(role);
  const isAdmin = role === 'CAMPUS_ADMIN';
  const userDeptId = user?.department?.id || user?.department;
  const grievanceDeptId = grievance?.department?.id || grievance?.department;
  const isSameDept = Boolean(userDeptId && grievanceDeptId && Number(userDeptId) === Number(grievanceDeptId));
  const isStaff = role === 'STAFF';
  const isDepartmentOfficer = (isHOD || isStaff) && (isSameDept || !userDeptId || !grievanceDeptId);
  const spamStatus = grievance.spam_status || null;
  const isSpamHandled = ['REVIEW', 'SPAM'].includes(spamStatus);

  // Submitter capabilities
  const isSubmitter = Number(grievance.submitter) === Number(user?.id);
  const needsSensitiveGate = Boolean(grievance.is_sensitive) && !isSubmitter && !revealSensitive;
  const hasReopenedOnce = Boolean(grievance.is_reopened || grievance.requests?.some(r => r.request_type === 'REOPEN'));
  const spamRejected = Boolean(grievance.spam_rejected);
  const canSubmitterReopen = isSubmitter && !hasReopenedOnce && !spamRejected && (status === 'RESOLVED' || status === 'REJECTED');
  const canSubmitterClose = isSubmitter && status === 'RESOLVED';

  // HOD capabilities
  const hasPendingRequest = Boolean(grievance.requests?.some(r => r.status === 'PENDING'));
  const hasPendingEscalation = Boolean(grievance.requests?.some(r => r.request_type === 'ESCALATION' && r.status === 'PENDING'));
  const adminInvolved = Boolean(grievance.requests?.some(r => r.reviewed_by_admin));
  const adminTerminalStatus = ['RESOLVED', 'REJECTED', 'CLOSED'].includes(status);
  // Once forwarded to Campus Admin (ESCALATED or a pending escalation), the
  // HOD can only view the grievance — respond/update is disabled.
  const hodBlockedAfterEscalation = status === 'ESCALATED' || hasPendingEscalation || Number(grievance?.escalation_level) > 0;
  const canHodAct = isHOD && !hodBlockedAfterEscalation && !isSpamHandled && ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'REOPENED'].includes(status) && (isSameDept || !userDeptId || !grievanceDeptId);
  const canRespond = canHodAct
    || (isAdmin && !adminTerminalStatus && status !== 'REOPENED' && (status === 'ESCALATED' || hasPendingEscalation));
  const canHodEscalate = canHodAct;

  // Campus Admin reviews only escalations.
  const isAdminRequestReview = isAdmin && !adminTerminalStatus && status !== 'REOPENED' && (status === 'ESCALATED' || hasPendingEscalation);

  const pendingRequest = grievance.requests?.find(r => r.status === 'PENDING');

  return (
    <section className="dashboard-page">
      <div className="dashboard-container detail-page-container">
        {!needsSensitiveGate && (
          <Link className="back-link" to={backTo}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
            {backLabel}
          </Link>
        )}
        {error && <div className="workflow-toast error" role="alert">{error}<button aria-label="Dismiss error message" onClick={() => setError('')}>×</button></div>}



        {needsSensitiveGate ? (
          <div className="sensitive-gate-blur-wrapper">
            <article className="grievance-detail sensitive-blurred">
              <header className="detail-header">
                <div className="detail-header-top">
                  <StatusBadge status={status} />
                </div>
                <h1>{grievance.title}</h1>
                <div className="detail-subtext">
                  <span><strong>Department:</strong> {grievance.department_name || 'Not assigned'}</span>
                  <span className="dot">•</span>
                  <span><strong>Category:</strong> {grievance.category_name || 'Uncategorized'}</span>
                  <span className="dot">•</span>
                  <span><strong>Submitted by:</strong> {grievance.is_anonymous ? 'Anonymous' : grievance.submitter_name || 'Not available'}</span>
                  <span className="dot">•</span>
                  <span>Submitted on: <time>{formatDate(grievance.created_at)}</time></span>
                </div>
              </header>
              <section className="detail-section">
                <h2 className="section-title"><span className="section-title-accent" />Grievance Description</h2>
                <p className="detail-description">{grievance.description}</p>
              </section>
              <section className="detail-section">
                <h2 className="section-title"><span className="section-title-accent" />Attachments ({grievance.attachments?.length || 0})</h2>
                {grievance.attachments?.length ? (
                  <ul className="attachment-list">
                    {grievance.attachments.map((attachment) => (
                      <li key={attachment.id}>
                        <div className="attachment-row">
                          <span><strong>{attachment.file_name}</strong><small>uploaded {formatDate(attachment.uploaded_at)}</small></span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="empty-note">No files were attached to this grievance.</p>}
              </section>
              <SpamReviewCard
                grievance={grievance}
                canReview={grievance.spam_status === 'REVIEW' && isDepartmentOfficer}
                submitting={spamSubmitting}
                onReview={handleSpamReview}
              />
              <section className="detail-section">
                <h2 className="section-title"><span className="section-title-accent" />Status History & Audit Trail</h2>
                {grievance.status_history?.length ? (
                  <div className="audit-timeline">
                    {grievance.status_history.map((entry, index) => (
                      <div key={entry.id || index} className="timeline-item">
                        <div className="timeline-marker-col">
                          <span className="timeline-marker-dot" />
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
            </article>
            <div className="sensitive-gate-overlay">
              <div className="sensitive-gate-modal">
                <div className="sensitive-gate-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                </div>
                <h2 id="sensitive-gate-title">Sensitive Grievance</h2>
                <p>This grievance contains confidential or sensitive information. Please ensure you are authorized to access this content.</p>
                <div className="sensitive-gate-actions">
                  <button className="btn btn-outline" onClick={() => navigate(backTo)}>Go Back</button>
                  <button className="btn btn-warning" onClick={() => setRevealSensitive(true)}>Reveal Content</button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <article className="grievance-detail">
            <header className="detail-header">
              <div className="detail-header-top">
                <StatusBadge status={status} />
              </div>
              <h1>{grievance.title}</h1>
              <div className="detail-subtext">
                <span><strong>Department:</strong> {grievance.department_name || 'Not assigned'}</span>
                <span className="dot">•</span>
                <span><strong>Category:</strong> {grievance.category_name || 'Uncategorized'}</span>
                <span className="dot">•</span>
                <span><strong>Submitted by:</strong> {grievance.is_anonymous ? 'Anonymous' : grievance.submitter_name || 'Not available'}</span>
                <span><strong>Submitted on:</strong> <time>{formatDate(grievance.created_at)}</time></span>

              </div>
            </header>

            <section className="detail-section">
              <h2 className="section-title">
                <span className="section-title-accent" />
                Grievance Description
              </h2>
              <p className="detail-description">{grievance.description}</p>
            </section>

            <section className="detail-section">
              <h2 className="section-title">
                <span className="section-title-accent" />
                Attachments ({grievance.attachments?.length || 0})
              </h2>
              {grievance.attachments?.length ? (
                <ul className="attachment-list">
                  {grievance.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <div className="attachment-row">
                        <span>
                          <strong>{attachment.file_name}</strong>
                          <small>uploaded {formatDate(attachment.uploaded_at)}</small>
                        </span>
                        <div className="attachment-actions">
                          {attachment.file && canPreviewAttachment(attachment) && (
                            <button className="btn btn-outline attachment-preview" onClick={() => setPreviewId(attachment.id)}>Preview</button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))
                  }
                </ul>
              ) : <p className="empty-note">No files were attached to this grievance.</p>}
            </section>

            {/* Student Requests & Appeals Audit History */}
            {grievance.requests?.filter(r => r.request_type !== 'ESCALATION').length > 0 && (
              <section className="detail-section">
                <h2 className="section-title">
                  <span className="section-title-accent" />
                  Student Requests & Appeals
                </h2>
                <div className="request-audit-list">
                  {grievance.requests.filter(r => r.request_type !== 'ESCALATION').map((req) => (
                    <article key={req.id} className="request-audit-card">
                      <div className="request-audit-header">
                        <strong>{req.request_type_display}</strong>
                      </div>
                      <p className="request-audit-reason"><strong>Reason:</strong> "{req.reason}"</p>
                      {req.request_type === 'REOPEN' && grievance.reopen_attachments?.length > 0 && (
                        <div className="reopen-docs-in-card">
                          <h3 className="reopen-docs-subtitle">Supporting Documents ({grievance.reopen_attachments.length})</h3>
                          <ul className="attachment-list">
                            {grievance.reopen_attachments.map((attachment) => (
                              <li key={attachment.id}>
                                <div className="attachment-row">
                                  <span>
                                    <strong>{attachment.file_name}</strong>
                                    <small>uploaded {formatDate(attachment.uploaded_at)}</small>
                                  </span>
                                  <div className="attachment-actions">
                                    {attachment.file && canPreviewAttachment(attachment) && (
                                      <button className="btn btn-outline attachment-preview" onClick={() => setPreviewId(`reopen-${attachment.id}`)}>Preview</button>
                                    )}
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {req.attachment && (
                        <div className="request-attachment-snippet">
                          <span>Supporting Document:</span>
                          <button className="btn btn-outline btn-sm request-preview-toggle" onClick={() => setPreviewId(`req-${req.id}`)}>
                            Preview
                          </button>
                        </div>
                      )}
                      <div className="request-audit-meta">
                        <span>Submitted: {formatDate(req.created_at)}</span>
                        {req.reviewed_by_admin_name && <span>Reviewed by: Campus Admin</span>}
                      </div>
                      {req.admin_remark && <p className="request-admin-remark"><strong>Campus Admin Remark:</strong> {req.admin_remark}</p>}
                    </article>
                  ))}
                </div>
              </section>
            )}

            <ReminderCommentList grievance={grievance} />

            <SpamReviewCard
              grievance={grievance}
              canReview={grievance.spam_status === 'REVIEW' && isDepartmentOfficer}
              submitting={spamSubmitting}
              onReview={handleSpamReview}
            />

            <section className="detail-section">
              <h2 className="section-title">
                <span className="section-title-accent" />
                Status History & Audit Trail
              </h2>
              {grievance.status_history?.length ? (
                <div className="audit-timeline">
                  {grievance.status_history.map((entry, index) => (
                    <div key={entry.id || index} className="timeline-item">
                      <div className="timeline-marker-col">
                        <span className="timeline-marker-dot" />
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
                        {entry.remarks && (
                          <div className="timeline-remarks-box">
                            <p>{entry.remarks}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="empty-note">No status history available.</p>}
            </section>

            {/* Reminder Comment Form — appears at end for submitter to post */}
            <ReminderCommentForm
              grievance={grievance}
              isSubmitter={isSubmitter}
              onCommented={() => {
                setToast('Your reminder comment was posted. The department has been notified.');
                loadGrievance(false);
              }}
            />

            {/* Bottom Grievance Controls & Actions */}

            {/* HOD / Campus Admin Action Panel */}
            {canRespond && (
              <div className="hod-action-panel">
                <div className="hod-action-panel-header">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  <div>
                    <h3>{isAdminRequestReview ? 'Campus Admin Action' : 'Department HOD Action & Status Management'}</h3>
                    <p>Provide an official response and update the status for this grievance.</p>
                  </div>
                </div>
                <div className="detail-actions">
                  <button className="btn btn-primary" onClick={() => openModal('respond')}>Respond & Update Status</button>
                </div>
              </div>
            )}

            {/* Submitter Actions - RESOLVED (reopen + close) or REJECTED (reopen only) */}
            {canSubmitterClose || canSubmitterReopen ? (
              <div className="hod-action-panel">
                <div className="hod-action-panel-header">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                  <div>
                    <h3>Grievance Controls</h3>
                    <p>{hasReopenedOnce ? 'This grievance has already been reopened once and cannot be reopened again. You can close it if satisfied.' : 'Review the response. You can reopen the grievance to send it back to the department, or close it if satisfied.'}</p>
                  </div>
                </div>
                <div className="detail-actions">
                  {!hasReopenedOnce && canSubmitterReopen && (
                    <button className="btn btn-outline" onClick={() => setRequestModalType('REOPEN')} disabled={Boolean(pendingRequest)}>
                      {pendingRequest ? 'Reopen Request Pending' : 'Reopen & Send to Department'}
                    </button>
                  )}
                  {canSubmitterClose && (
                    <button className="btn btn-primary" onClick={() => runAction('close')} disabled={submitting}>
                      Close Grievance
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </article>
        )}

        {/* HOD/Admin Modal */}
        {modal && (
          <div className="modal-backdrop" role="presentation">
            <form className="workflow-modal" onSubmit={(event) => { event.preventDefault(); runAction(modal); }}>
              <h2>{isAdminRequestReview ? 'Campus Admin Response & Status Update' : 'HOD Response & Status Update'}</h2>

              {modal === 'respond' && (
                <>
                  <label htmlFor="workflow-status">Select New Status</label>
                  <select
                    id="workflow-status"
                    className="status-select-dropdown"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                  >
                    {(isAdminRequestReview
                      ? [
                          ['UNDER_REVIEW', 'Under Review (Reviewing Submission)'],
                          ['IN_PROGRESS', 'In Progress (Active Investigation)'],
                          ['RESOLVED', 'Resolved (Mark Issue as Solved)'],
                          ['REJECTED', 'Rejected (Decline / Reject Grievance)'],
                        ]
                      : [
                          ...(status !== 'IN_PROGRESS' ? [['UNDER_REVIEW', 'Under Review (Reviewing Submission)']] : []),
                          ['IN_PROGRESS', 'In Progress (Active Investigation)'],
                          ['RESOLVED', 'Resolved (Mark Issue as Solved)'],
                          ['REJECTED', 'Rejected (Decline / Reject Grievance)'],
                          ['ESCALATED', 'Escalated (Forward to Campus Admin)'],
                        ]
                    )
                      .filter(([optionValue]) => optionValue !== status)
                      .map(([optionValue, optionLabel]) => (
                        <option key={optionValue} value={optionValue}>{optionLabel}</option>
                      ))}
                  </select>

                  <div className="status-transition-preview">
                    <span>Current Status: <StatusBadge status={status} /></span>
                    <span className="arrow">→</span>
                    <span>New Status: <StatusBadge status={selectedStatus} /></span>
                  </div>
                </>
              )}

              <p>{selectedStatus === 'ESCALATED' ? 'Explain why this grievance should be forwarded to Campus Admin.' : 'Write your response and select the target status for this grievance.'}</p>

              <label htmlFor="workflow-content">{selectedStatus === 'ESCALATED' ? 'Escalation Reason' : 'Official Response / Remarks'}</label>
              <textarea id="workflow-content" value={selectedStatus === 'ESCALATED' ? escalateReason : content} onChange={(event) => selectedStatus === 'ESCALATED' ? setEscalateReason(event.target.value) : setContent(event.target.value)} placeholder={selectedStatus === 'ESCALATED' ? 'Explain why this grievance should be forwarded to Campus Admin…' : 'Write your official response or remarks…'} required rows="6" autoFocus />

              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={closeModal} disabled={submitting}>Cancel</button>
                <button type="submit" className={`btn ${selectedStatus === 'ESCALATED' ? 'btn-warning' : 'btn-primary'}`} disabled={submitting}>{submitting ? 'Saving…' : selectedStatus === 'ESCALATED' ? 'Forward to Campus Admin' : 'Update Status & Post'}</button>
              </div>
            </form>
          </div>
        )}

        {/* Student Request Modal (Reason Mandatory) */}
        {requestModalType && (
          <RequestModal
            grievance={grievance}
            requestType={requestModalType}
            onClose={() => setRequestModalType(null)}
            onSuccess={(msg) => {
              setToast(msg);
              loadGrievance(false);
            }}
          />
        )}

        {/* Full-screen Attachment Preview Modal */}
        {previewAttachment && (
          <div className="preview-overlay" onClick={closePreview}>
            <button className="preview-close" onClick={closePreview} aria-label="Close preview">&times;</button>
            <button className="preview-nav preview-prev" onClick={(e) => { e.stopPropagation(); if (previewIndex > 0) prevPreview(); }} disabled={previewIndex <= 0} aria-label="Previous">&lsaquo;</button>
            <button className="preview-nav preview-next" onClick={(e) => { e.stopPropagation(); if (previewIndex < previewAttachments.length - 1) nextPreview(); }} disabled={previewIndex >= previewAttachments.length - 1} aria-label="Next">&rsaquo;</button>
            <div className="preview-content" onClick={(e) => e.stopPropagation()}>
              {isImageAttachment(previewAttachment) || previewKindFromUrl(previewAttachment.file) === 'image' ? (
                <img src={previewAttachment.file} alt={previewAttachment.file_name} />
              ) : (
                <iframe src={`${previewAttachment.file}#toolbar=0&download=0`} title={previewAttachment.file_name} />
              )}
            </div>
            <div className="preview-footer" onClick={(e) => e.stopPropagation()}>
              <span className="preview-filename">{previewAttachment.file_name}</span>
              {previewAttachments.length > 1 && (
                <span className="preview-counter">{previewIndex + 1} / {previewAttachments.length}</span>
              )}
            </div>
          </div>
        )}

        {/* Success popup after status updates / grievance actions */}
        {toast && (
          <div className="modal-backdrop" role="presentation">
            <div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="action-success-title">
              <div className="success-mark">✓</div>
              <h2 id="action-success-title">Success</h2>
              <p>{toast}</p>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={() => setToast('')}>OK</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

function SpamReviewCard({ grievance, canReview, submitting, onReview }) {
  const spamStatus = grievance.spam_status;
  if (!spamStatus) return null;

  const tones = {
    REVIEW: 'review',
    SPAM: 'spam',
    NOT_SPAM: 'accepted',
  };
  const labels = {
    REVIEW: 'AI Flagged: Possible Spam',
    SPAM: 'Marked as Spam',
    NOT_SPAM: 'Accepted as Genuine',
  };

  return (
    <section className="detail-section" aria-label="AI spam detection">
      <h2 className="section-title"><span className="section-title-accent" />AI Spam Detection</h2>
      <div className={`ai-spam-card ${tones[spamStatus]}`}>
        <div className="ai-spam-row">
          <span className="ai-spam-label">{labels[spamStatus]}</span>
          {spamStatus !== 'REVIEW' && (grievance.spam_reviewed_by_name || grievance.spam_reviewed_at) && (
            <span className="ai-spam-reviewer">
              {grievance.spam_reviewed_by_name ? `by ${grievance.spam_reviewed_by_name}` : ''}
              {grievance.spam_reviewed_at ? ` · ${formatDate(grievance.spam_reviewed_at)}` : ''}
            </span>
          )}
        </div>
        {spamStatus === 'REVIEW' && canReview && (
          <div className="ai-spam-actions">
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => onReview('SPAM')}
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Mark as Spam'}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onReview('NOT_SPAM')}
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Accept'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default GrievanceDetail;
