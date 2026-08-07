import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import RequestModal from '../components/RequestModal';

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
  const { user } = useAuth();
  const backTo = location.state?.backTo || '/dashboard';
  const backLabel = location.state?.backLabel || 'Back to grievances';
  const [grievance, setGrievance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null);
  const [requestModalType, setRequestModalType] = useState(null); // 'REJECTION_APPEAL' | 'REOPEN'
  const [previewId, setPreviewId] = useState(null);
  const [revealSensitive, setRevealSensitive] = useState(false);
  const [content, setContent] = useState('');
  const [escalateReason, setEscalateReason] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('IN_PROGRESS');
  const [submitting, setSubmitting] = useState(false);

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
  ];
  const previewIndex = previewId !== null ? previewAttachments.findIndex((a) => `reopen-${a.id}` === previewId || a.id === previewId) : -1;
  const previewAttachment = previewIndex >= 0 ? previewAttachments[previewIndex] : null;

  const closePreview = () => setPreviewId(null);
  const prevPreview = () => { if (previewAttachments.length > 1) { const prev = previewAttachments[(previewIndex - 1 + previewAttachments.length) % previewAttachments.length]; setPreviewId((grievance?.attachments || []).includes(prev) ? prev.id : `reopen-${prev.id}`); } };
  const nextPreview = () => { if (previewAttachments.length > 1) { const next = previewAttachments[(previewIndex + 1) % previewAttachments.length]; setPreviewId((grievance?.attachments || []).includes(next) ? next.id : `reopen-${next.id}`); } };

  useEffect(() => {
    if (previewAttachment === null) return;
    const handler = (e) => { if (e.key === 'Escape') closePreview(); if (e.key === 'ArrowLeft') prevPreview(); if (e.key === 'ArrowRight') nextPreview(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewAttachment, previewIndex]);

  const closeModal = () => { setModal(null); setContent(''); setEscalateReason(''); setSelectedStatus('IN_PROGRESS'); };
  const openModal = (action) => { setToast(''); setContent(''); setEscalateReason(''); setSelectedStatus('IN_PROGRESS'); setModal(action); };

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
        : { reason: escalateReason.trim() };
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

  // Submitter capabilities
  const isSubmitter = Number(grievance.submitter) === Number(user?.id);
  const needsSensitiveGate = Boolean(grievance.is_sensitive) && !isSubmitter && !revealSensitive;
  const canSubmitterReopen = isSubmitter && (status === 'RESOLVED' || status === 'REJECTED');
  const canSubmitterAppealRejection = isSubmitter && status === 'REJECTED';
  const canSubmitterClose = isSubmitter && status === 'RESOLVED';

  // HOD capabilities
  const canRespond = (isHOD && ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'REOPENED'].includes(status) && (isSameDept || !userDeptId || !grievanceDeptId))
    || (isAdmin && status === 'ESCALATED');
  const canHodEscalate = isHOD && ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'REOPENED'].includes(status);

  const pendingRequest = grievance.requests?.find(r => r.status === 'PENDING');

  return (
    <section className="dashboard-page">
      <div className="dashboard-container detail-page-container">
        <Link className="back-link" to={backTo}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          {backLabel}
        </Link>
        {toast && <div className="workflow-toast success" role="status">{toast}<button aria-label="Dismiss success message" onClick={() => setToast('')}>×</button></div>}
        {error && <div className="workflow-toast error" role="alert">{error}<button aria-label="Dismiss error message" onClick={() => setError('')}>×</button></div>}

        

        {needsSensitiveGate ? (
          <div className="sensitive-gate-overlay" role="alertdialog" aria-modal="true" aria-labelledby="sensitive-gate-title">
            <div className="sensitive-gate-modal">
              <div className="sensitive-gate-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              </div>
              <h2 id="sensitive-gate-title">Sensitive Grievance</h2>
              <p>The student has marked this grievance as sensitive. It may contain confidential, personal, or otherwise sensitive information. Please ensure that you are authorized to access and handle this information confidentially.</p>
              <p className="sensitive-gate-confirm">Are you sure you want to view the sensitive content?</p>
              <div className="sensitive-gate-actions">
                <button className="btn btn-outline" onClick={() => setRevealSensitive(false)}>Cancel</button>
                <button className="btn btn-warning" onClick={() => setRevealSensitive(true)}>View Sensitive Content</button>
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
              <span><strong>Assigned Dept:</strong> {grievance.department_name || 'Not assigned'}</span>
              <span className="dot">•</span>
              <span><strong>Category:</strong> {grievance.category_name || 'Uncategorized'}</span>
              <span className="dot">•</span>
              <span>Submitted by: <strong>{grievance.is_anonymous ? 'Anonymous' : grievance.submitter_name || 'Not available'}</strong></span>
        
              <span className="dot">•<time>{formatDate(grievance.created_at)}</time></span>
              
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
                          <small>{attachment.file_type || 'Attachment'} · uploaded {formatDate(attachment.uploaded_at)}</small>
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

          {/* Reopen Details */}
          {(() => {
            const reopenReq = grievance.requests?.find(r => r.request_type === 'REOPEN');
            const hasReopenData = reopenReq || grievance.reopen_attachments?.length > 0;
            if (!hasReopenData) return null;
            return (
              <section className="detail-section">
                <h2 className="section-title">
                  <span className="section-title-accent" />
                  Reopen Request
                </h2>
                {reopenReq?.reason && (
                  <div className="reopen-reason-box">
                    <strong>Reason for reopening:</strong>
                    <p>{reopenReq.reason}</p>
                  </div>
                )}
                {grievance.reopen_attachments?.length > 0 && (
                  <>
                    <h3 className="reopen-docs-subtitle">Supporting Documents ({grievance.reopen_attachments.length})</h3>
                    <ul className="attachment-list">
                      {grievance.reopen_attachments.map((attachment) => (
                          <li key={attachment.id}>
                            <div className="attachment-row">
                              <span>
                                <strong>{attachment.file_name}</strong>
                                <small>{attachment.file_type || 'Attachment'} · uploaded {formatDate(attachment.uploaded_at)}</small>
                              </span>
                              <div className="attachment-actions">
                                {attachment.file && canPreviewAttachment(attachment) && (
                                  <button className="btn btn-outline attachment-preview" onClick={() => setPreviewId(`reopen-${attachment.id}`)}>Preview</button>
                                )}
                              </div>
                            </div>
                          </li>
                        ))
                      }
                    </ul>
                  </>
                )}
              </section>
            );
          })()}

          {/* Student Requests & Appeals Audit History */}
          {grievance.requests?.filter(r => r.request_type !== 'ESCALATION').length > 0 && (
            <section className="detail-section">
              <h2 className="section-title">
                <span className="section-title-accent" />
                Student Appeals & Reopen Requests
              </h2>
              <div className="request-audit-list">
                {grievance.requests.filter(r => r.request_type !== 'ESCALATION').map((req) => (
                  <article key={req.id} className="request-audit-card">
                    <div className="request-audit-header">
                      <strong>{req.request_type_display}</strong>
                      <span className={`status-badge req-status-${req.status.toLowerCase()}`}>{req.status}</span>
                    </div>
                    <p className="request-audit-reason"><strong>Reason:</strong> "{req.reason}"</p>
                    {req.attachment && (
                      <div className="request-attachment-snippet">
                        <span>Supporting Document:</span>
                        <button className="btn btn-outline btn-sm request-preview-toggle" onClick={() => setPreviewId(previewId === `req-${req.id}` ? null : `req-${req.id}`)}>
                          {previewId === `req-${req.id}` ? 'Close' : 'Preview'}
                        </button>
                      </div>
                    )}
                    {req.attachment && previewId === `req-${req.id}` && (
                      <div className="attachment-inline-preview">
                        {previewKindFromUrl(req.attachment) === 'image' ? (
                          <img src={req.attachment} alt="Supporting document preview" />
                        ) : (
                          <iframe src={`${req.attachment}#toolbar=0&download=0`} title="Supporting document preview" />
                        )}
                      </div>
                    )}
                    <div className="request-audit-meta">
                      <span>Submitted: {formatDate(req.created_at)}</span>
                      {req.reviewed_by_admin_name && <span>Reviewed by: {req.reviewed_by_admin_name}</span>}
                    </div>
                    {req.admin_remark && <p className="request-admin-remark"><strong>Campus Admin Remark:</strong> {req.admin_remark}</p>}
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="detail-section">
            <h2 className="section-title">
              <span className="section-title-accent" />
              Official Responses
            </h2>
            {grievance.responses?.length ? (
              <div className="response-list">
                {grievance.responses.map((response) => (
                  <article key={response.id} className="response-card">
                    <header>
                      <strong>{response.responder_name || (response.responder_role === 'Campus Admin' ? 'Campus Administrator' : 'Department Representative')}</strong>
                      <time>{formatDate(response.created_at)}</time>
                    </header>
                    <p>{response.content}</p>
                  </article>
                ))}
              </div>
            ) : <p className="empty-note">No official response has been posted yet.</p>}
          </section>

          {isHOD && status === 'UNDER_REVIEW' && grievance.ai_analysis && (
            <section className="detail-section ai-analysis-section">
              <h2 className="section-title">
                <span className="section-title-accent" />
                AI Analysis
              </h2>
              <div className="ai-analysis-card">
                <div className="ai-analysis-header">
                  <span className={`ai-badge ${grievance.ai_analysis.spam_prediction ? 'ai-badge-spam' : 'ai-badge-ham'}`}>
                    {grievance.ai_analysis.spam_prediction ? 'Spam' : 'Not Spam'}
                  </span>
                  <span className="ai-confidence">
                    Confidence: <strong>{(grievance.ai_analysis.confidence_score * 100).toFixed(0)}%</strong>
                  </span>
                </div>
                {grievance.ai_analysis.classification_reason && (
                  <p className="ai-reason">{grievance.ai_analysis.classification_reason}</p>
                )}
                <p className="ai-disclaimer">AI-generated assessment — for reference only. Final decision must be made by the department.</p>
              </div>
            </section>
          )}

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
                      {index < grievance.status_history.length - 1 && <span className="timeline-line" />}
                    </div>
                    <div className="timeline-card">
                      <div className="timeline-card-header">
                        <div className="timeline-transition">
                          <span className="from-status-tag">{statusLabel(entry.previous_status)}</span>
                          <svg className="transition-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                          <StatusBadge status={entry.new_status} />
                        </div>
                        <time className="timeline-timestamp">{formatDate(entry.created_at)}</time>
                      </div>
                      <div className="timeline-actor-row">
                        <span className="actor-badge">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
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

          {/* Bottom Grievance Controls & Actions */}

          {/* Rejected Grievance Appeal Banner */}
          {status === 'REJECTED' && isSubmitter && (
            <div className="hod-action-panel warning-state" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
              <div className="hod-action-panel-header">
                <div>
                  <h3 style={{ color: '#92400e' }}>Grievance Rejected</h3>
                  <p style={{ color: '#b45309' }}>If you disagree with the department decision, you can reopen the grievance and send it back to the assigned department for further review. If satisfied, you may close it.</p>
                </div>
              </div>
              <div className="detail-actions">
                <button className="btn btn-outline" onClick={() => setRequestModalType('REOPEN')} disabled={Boolean(pendingRequest)}>
                  {pendingRequest ? 'Reopen Request Pending' : 'Reopen & Send to Department'}
                </button>
                <button className="btn btn-primary" onClick={() => runAction('close')} disabled={submitting}>
                  Close Grievance
                </button>
              </div>
            </div>
          )}

          {/* HOD / Campus Admin Action Panel */}
          {canRespond && (
            <div className="hod-action-panel">
              <div className="hod-action-panel-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                <div>
                  <h3>{isAdmin && status === 'ESCALATED' ? 'Campus Admin Action' : 'Department HOD Action & Status Management'}</h3>
                  <p>Provide an official response and update the status for this grievance (Currently: <strong>{statusLabel(status)}</strong>).</p>
                </div>
              </div>
              <div className="detail-actions">
                <button className="btn btn-primary" onClick={() => openModal('respond')}>Respond & Update Status</button>
              </div>
            </div>
          )}

          {/* Submitter Actions - only show for RESOLVED (REJECTED has its own banner above) */}
          {canSubmitterClose && (
            <div className="hod-action-panel">
              <div className="hod-action-panel-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                <div>
                  <h3>Grievance Controls</h3>
                  <p>Review the response. You can reopen the grievance to send it back to the department, or close it if satisfied.</p>
                </div>
              </div>
              <div className="detail-actions">
                <button className="btn btn-outline" onClick={() => setRequestModalType('REOPEN')} disabled={Boolean(pendingRequest)}>
                  {pendingRequest ? 'Reopen Request Pending' : 'Reopen & Send to Department'}
                </button>
                <button className="btn btn-primary" onClick={() => runAction('close')} disabled={submitting}>
                  Close Grievance
                </button>
              </div>
            </div>
          )}
        </article>
        )}

        {/* HOD/Admin Modal */}
        {modal && (
          <div className="modal-backdrop" role="presentation">
            <form className="workflow-modal" onSubmit={(event) => { event.preventDefault(); runAction(modal); }}>
              <h2>{isAdmin && status === 'ESCALATED' ? 'Campus Admin Response & Status Update' : 'HOD Response & Status Update'}</h2>

              {modal === 'respond' && (
                <>
                  <label htmlFor="workflow-status">Select New Status</label>
                  <select
                    id="workflow-status"
                    className="status-select-dropdown"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                  >
                    {isAdmin && status === 'ESCALATED' ? (
                      <>
                        <option value="IN_PROGRESS">In Progress (Active Investigation)</option>
                        <option value="RESOLVED">Resolved (Mark Issue as Solved)</option>
                        <option value="REJECTED">Rejected (Decline / Reject Grievance)</option>
                      </>
                    ) : (
                      <>
                        <option value="UNDER_REVIEW">Under Review (Reviewing Submission)</option>
                        <option value="IN_PROGRESS">In Progress (Active Investigation)</option>
                        <option value="RESOLVED">Resolved (Mark Issue as Solved)</option>
                        <option value="REJECTED">Rejected (Decline / Reject Grievance)</option>
                        <option value="ESCALATED">Escalated (Forward to Campus Admin)</option>
                      </>
                    )}
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
              {isImageAttachment(previewAttachment) ? (
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
      </div>
    </section>
  );
};

export default GrievanceDetail;
