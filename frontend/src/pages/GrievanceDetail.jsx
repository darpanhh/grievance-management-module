import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import RequestModal from '../components/RequestModal';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—';
const statusLabel = (status) => status ? status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Initial submission';

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
  const [requestModalType, setRequestModalType] = useState(null); // 'REJECTION_APPEAL' | 'SPAM_APPEAL' | 'REOPEN'
  const [content, setContent] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('UNDER_REVIEW');
  const [submitting, setSubmitting] = useState(false);

  const loadGrievance = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
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

  const closeModal = () => { setModal(null); setContent(''); setSelectedStatus('UNDER_REVIEW'); };
  const openModal = (action) => { setToast(''); setContent(''); setSelectedStatus('UNDER_REVIEW'); setModal(action); };
  
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
      adminClose: `grievances/${id}/close/`,
      adminResolve: `admin/escalated/${id}/resolve/`,
      reinstateSpam: `admin/spam-queue/${id}/reinstate/`,
    };

    if ((action === 'respond' || action === 'adminClose') && !content.trim()) {
      setError('Please enter a response before submitting.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await api.post(endpoints[action], action === 'respond' ? { content: content.trim(), status: selectedStatus } : action === 'adminResolve' ? { content: content.trim() } : action === 'adminClose' ? { remarks: content.trim() } : {});
      const messages = {
        respond: `Response posted. Status updated to ${statusLabel(selectedStatus)}.`,
        resolve: 'Grievance resolved successfully.',
        close: 'Grievance closed successfully.',
        adminResolve: 'Escalated grievance resolved successfully.',
        adminClose: 'Grievance closed successfully with your remarks.',
        reinstateSpam: 'Grievance reinstated from Spam queue and set to Submitted.',
      };
      closeModal();
      setToast(messages[action]);
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
  const canSubmitterReopen = isSubmitter && ['RESOLVED', 'RESPONDED'].includes(status);
  const canSubmitterAppealRejection = isSubmitter && status === 'REJECTED';
  const canSubmitterAppealSpam = isSubmitter && status === 'SPAM';
  const canSubmitterClose = isSubmitter && ['RESPONDED', 'RESOLVED'].includes(status);

  // HOD & Admin capabilities
  const canRespond = isHOD && ['SUBMITTED', 'UNDER_REVIEW', 'REOPENED'].includes(status) && (isSameDept || !userDeptId || !grievanceDeptId);
  const canAdminResolve = isAdmin && status === 'ESCALATED';
  const canAdminClose = isAdmin && status !== 'CLOSED';
  const canAdminReinstate = isAdmin && status === 'SPAM';

  const pendingRequest = grievance.requests?.find(r => r.status === 'PENDING');

  return (
    <section className="dashboard-page">
      <div className="dashboard-container detail-page-container">
        <Link className="back-link" to={backTo}>← {backLabel}</Link>
        {toast && <div className="workflow-toast success" role="status">{toast}<button aria-label="Dismiss success message" onClick={() => setToast('')}>×</button></div>}
        {error && <div className="workflow-toast error" role="alert">{error}<button aria-label="Dismiss error message" onClick={() => setError('')}>×</button></div>}

        {/* Pending Request Notice Banner */}
        {pendingRequest && (
          <div className="workflow-toast warning pending-review-banner" role="status">
            <span className="pending-review-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 8v4l2.5 1.5M12 3a9 9 0 1 0 9 9" /><path d="M18 3v4h-4" /></svg>
            </span>
            <div className="pending-review-copy">
              <strong>Campus Admin review in progress</strong>
              <p><em>{pendingRequest.request_type_display}</em> request submitted <time dateTime={pendingRequest.created_at}>{formatDate(pendingRequest.created_at)}</time></p>
            </div>
            <span className="pending-review-state">Pending</span>
          </div>
        )}

        <article className="grievance-detail">
          <header className="detail-header">
            <div>
              <span className="detail-id">GMS-{String(grievance.id).padStart(4, '0')}</span>
              <h1>{grievance.title}</h1>
              <p>Submitted {formatDate(grievance.created_at)}</p>
            </div>
            <StatusBadge status={status} />
          </header>

          <dl className="detail-meta">
            <div><dt>Category</dt><dd>{grievance.category_name || '—'}</dd></div>
            <div><dt>Department</dt><dd>{grievance.department_name || '—'}</dd></div>
            <div><dt>Submitted by</dt><dd>{grievance.is_anonymous ? 'Anonymous' : grievance.submitter_name || 'Not available'}</dd></div>
            <div><dt>Created</dt><dd>{formatDate(grievance.created_at)}</dd></div>
            <div><dt>Last updated</dt><dd>{formatDate(grievance.updated_at)}</dd></div>
            <div><dt>Reopened</dt><dd>{grievance.is_reopened ? 'Yes' : 'No'}</dd></div>
            <div><dt>Escalation level</dt><dd>{grievance.escalation_level || 0}</dd></div>
            <div><dt>Escalated to</dt><dd>{grievance.escalated_to_name || 'Not escalated'}</dd></div>
          </dl>

          {/* AI Analysis Section */}
          {grievance.ai_analysis && (
            <section className={`ai-analysis ${grievance.ai_analysis.spam_prediction ? 'is-spam' : ''}`}>
              <h2>AI Spam & Sentiment Analysis</h2>
              <dl>
                <div>
                  <dt>Spam Prediction</dt>
                  <dd style={{ color: grievance.ai_analysis.spam_prediction ? '#b91c1c' : '#166534' }}>
                    {grievance.ai_analysis.spam_prediction ? 'SPAM DETECTED' : 'CLEAN'}
                  </dd>
                </div>
                {grievance.ai_analysis.sentiment && (
                  <div>
                    <dt>Sentiment</dt>
                    <dd>{grievance.ai_analysis.sentiment}</dd>
                  </div>
                )}
              </dl>
              <p><strong>Reason:</strong> {grievance.ai_analysis.classification_reason || 'Automated text evaluation.'}</p>
            </section>
          )}

          <section>
            <h2>Grievance Details</h2>
            <p className="detail-description">{grievance.description}</p>
          </section>

          <section>
            <h2>Attachments</h2>
            {grievance.attachments?.length ? (
              <ul className="attachment-list">
                {grievance.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <span>
                      <strong>{attachment.file_name}</strong>
                      <small>{attachment.file_type || 'Attachment'} · uploaded {formatDate(attachment.uploaded_at)}</small>
                    </span>
                    {attachment.file && <a className="btn btn-outline attachment-download" href={attachment.file} target="_blank" rel="noreferrer" download>Download</a>}
                  </li>
                ))}
              </ul>
            ) : <p className="empty-note">No files were attached to this grievance.</p>}
          </section>

          {/* Student Requests & Appeals Audit History */}
          {grievance.requests?.length > 0 && (
            <section>
              <h2>Student Appeals & Reopen Requests</h2>
              <div className="request-audit-list">
                {grievance.requests.map((req) => (
                  <article key={req.id} className="request-audit-card">
                    <div className="request-audit-header">
                      <strong>{req.request_type_display}</strong>
                      <span className={`status-badge req-status-${req.status.toLowerCase()}`}>{req.status}</span>
                    </div>
                    <p className="request-audit-reason"><strong>Reason:</strong> "{req.reason}"</p>
                    {req.attachment && (
                      <div className="request-attachment-snippet">
                        <span>Supporting Document:</span>
                        <a href={req.attachment} target="_blank" rel="noreferrer" download className="btn btn-outline btn-sm">
                          Download Attachment
                        </a>
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

          <section>
            <h2>Official Responses</h2>
            {grievance.responses?.length ? (
              <div className="response-list">
                {grievance.responses.map((response) => (
                  <article key={response.id} className="response-card">
                    <header>
                      <strong>{response.responder_name || 'Department Representative'}</strong>
                      <time>{formatDate(response.created_at)}</time>
                    </header>
                    <p>{response.content}</p>
                  </article>
                ))}
              </div>
            ) : <p className="empty-note">No official response has been posted yet.</p>}
          </section>

          <section>
            <h2>Status History & Audit Trail</h2>
            {grievance.status_history?.length ? (
              <ol className="history-list">
                {grievance.status_history.map((entry) => (
                  <li key={entry.id}>
                    <span className="history-dot" />
                    <div>
                      <p className="history-transition">
                        <span>{statusLabel(entry.previous_status)}</span>
                        <span aria-hidden="true">→</span>
                        <StatusBadge status={entry.new_status} />
                      </p>
                      <strong>{entry.action_by_name || 'System'}</strong>
                      <time>{formatDate(entry.created_at)}</time>
                      {entry.remarks && <p>{entry.remarks}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="empty-note">No status history available.</p>}
          </section>

          {/* Bottom Grievance Controls & Actions */}

          {/* Spam Alert & Action Banner */}
          {status === 'SPAM' && (
            <div className="hod-action-panel error-state" style={{ borderColor: '#fecaca', background: '#fef2f2' }}>
              <div className="hod-action-panel-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div>
                  <h3 style={{ color: '#991b1b' }}>Flagged as Spam</h3>
                  <p style={{ color: '#b91c1c' }}>This grievance was flagged by the automated AI spam filter and requires Campus Admin review.</p>
                </div>
              </div>
              <div className="detail-actions">
                {canAdminReinstate && (
                  <button className="btn btn-primary" onClick={() => runAction('reinstateSpam')} disabled={submitting}>
                    {submitting ? 'Reinstating…' : 'Restore Grievance (Not Spam)'}
                  </button>
                )}
                {canSubmitterAppealSpam && (
                  <button className="btn btn-outline" onClick={() => setRequestModalType('SPAM_APPEAL')} disabled={Boolean(pendingRequest)}>
                    {pendingRequest ? 'Spam Appeal Pending' : 'Appeal Spam Classification'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Rejected Grievance Appeal Banner */}
          {status === 'REJECTED' && isSubmitter && (
            <div className="hod-action-panel warning-state" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
              <div className="hod-action-panel-header">
                <div>
                  <h3 style={{ color: '#92400e' }}>Grievance Rejected</h3>
                  <p style={{ color: '#b45309' }}>If you disagree with the department decision, you can submit an Appeal to the Campus Admin with your justification.</p>
                </div>
              </div>
              <div className="detail-actions">
                {canSubmitterAppealRejection && (
                  <button className="btn btn-primary" onClick={() => setRequestModalType('REJECTION_APPEAL')} disabled={Boolean(pendingRequest)}>
                    {pendingRequest ? 'Rejection Appeal Pending' : 'Appeal Rejection to Campus Admin'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* HOD Action Panel (HOD only) */}
          {canRespond && (
            <div className="hod-action-panel">
              <div className="hod-action-panel-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <div>
                  <h3>Department HOD Action & Status Management</h3>
                  <p>Provide an official response and update the status for this grievance (Currently: <strong>{statusLabel(status)}</strong>).</p>
                </div>
              </div>
              <div className="detail-actions">
                <button className="btn btn-primary" onClick={() => openModal('respond')}>Respond & Update Status</button>
              </div>
            </div>
          )}

          {/* Submitter & Admin Actions */}
          {(canSubmitterReopen || canSubmitterClose || canAdminResolve || (canAdminClose && status !== 'SPAM')) && (
            <div className="hod-action-panel">
              <div className="hod-action-panel-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                <div>
                  <h3>Grievance Controls</h3>
                  <p>{isSubmitter ? 'Review the response. You can submit a Reopen request to Campus Admin or Close the grievance.' : 'Campus Admin lifecycle controls.'}</p>
                </div>
              </div>
              <div className="detail-actions">
                {canSubmitterReopen && (
                  <button className="btn btn-outline" onClick={() => setRequestModalType('REOPEN')} disabled={Boolean(pendingRequest)}>
                    {pendingRequest ? 'Reopen Request Pending' : 'Request Grievance Reopen'}
                  </button>
                )}
                {canSubmitterClose && (
                  <button className="btn btn-primary" onClick={() => runAction('close')} disabled={submitting}>
                    Close Grievance
                  </button>
                )}
                {canAdminResolve && (
                  <button className="btn btn-primary" onClick={() => openModal('adminResolve')} disabled={submitting}>Resolve Escalated Grievance</button>
                )}
                {canAdminClose && !isSubmitter && (
                  <button className="btn btn-outline" onClick={() => openModal('adminClose')} disabled={submitting}>Close with Remarks</button>
                )}
              </div>
            </div>
          )}
        </article>

        {/* HOD/Admin Modal */}
        {modal && (
          <div className="modal-backdrop" role="presentation">
            <form className={`workflow-modal ${modal === 'adminClose' ? 'admin-close-modal' : ''}`} onSubmit={(event) => { event.preventDefault(); runAction(modal); }}>
              <h2>{modal === 'respond' ? 'HOD Response & Status Update' : modal === 'adminClose' ? 'Close Grievance with Remarks' : 'Resolve Escalated Grievance'}</h2>
              
              {modal === 'respond' ? (
                <>
                  <label htmlFor="workflow-status">Select New Status</label>
                  <select
                    id="workflow-status"
                    className="status-select-dropdown"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                  >
                    <option value="UNDER_REVIEW">In Progress / Under Review (Active Investigation)</option>
                    <option value="RESOLVED">Resolved (Mark Issue as Solved)</option>
                    <option value="REJECTED">Rejected (Decline / Reject Grievance)</option>
                  </select>

                  <div className="status-transition-preview">
                    <span>Current Status: <StatusBadge status={status} /></span>
                    <span className="arrow">→</span>
                    <span>New Status: <StatusBadge status={selectedStatus} /></span>
                  </div>
                </>
              ) : (
                <div className="status-transition-preview">
                  <span>Current Status: <StatusBadge status={status} /></span>
                  <span className="arrow">→</span>
                  <span>New Status: <StatusBadge status={modal === 'adminClose' ? 'CLOSED' : 'RESOLVED'} /></span>
                </div>
              )}

              <p>{modal === 'respond' ? 'Write your response and select the target status for this grievance.' : modal === 'adminClose' ? 'Add a clear closure remark for the student and the audit trail.' : 'Optionally add a final resolution note.'}</p>
              
              <label htmlFor="workflow-content">{modal === 'adminClose' ? 'Closure Remarks' : 'Official Response / Remarks'} {modal === 'adminClose' && <span className="required-star">*</span>}</label>
              <textarea id="workflow-content" value={content} onChange={(event) => setContent(event.target.value)} placeholder={modal === 'adminClose' ? 'Explain why this grievance is being closed…' : 'Write your official response or remarks…'} required={modal === 'respond' || modal === 'adminClose'} rows="6" autoFocus />
              
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={closeModal} disabled={submitting}>Cancel</button>
                <button type="submit" className={`btn ${modal === 'adminClose' ? 'btn-danger' : 'btn-primary'}`} disabled={submitting}>{submitting ? 'Saving…' : modal === 'respond' ? 'Update Status & Post' : modal === 'adminClose' ? 'Close Grievance' : 'Confirm Resolution'}</button>
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
      </div>
    </section>
  );
};

export default GrievanceDetail;
