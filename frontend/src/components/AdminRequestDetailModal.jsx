import { useEffect, useState } from 'react';
import api from '../services/api';
import StatusBadge from './StatusBadge';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—';

const requestTypeLabel = (type) => {
  switch (type) {
    case 'REOPEN': return 'Reopen Request';
    case 'REJECTION_APPEAL': return 'Rejection Appeal';
    case 'SPAM_APPEAL': return 'Spam Appeal';
    case 'ESCALATION': return 'Escalation';
    default: return type || 'Request';
  }
};

const AdminRequestDetailModal = ({ requestItem, departments, onClose, onSuccess }) => {
  const [grievance, setGrievance] = useState(null);
  const [loadingGrievance, setLoadingGrievance] = useState(true);
  const [selectedDept, setSelectedDept] = useState('');
  const [adminRemark, setAdminRemark] = useState('');
  const [actionType, setActionType] = useState('forward'); // 'forward' | 'reject' | 'close'
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadGrievanceDetails = async () => {
      setLoadingGrievance(true);
      try {
        const { data } = await api.get(`grievances/${requestItem.grievance}/`);
        setGrievance(data);
        setSelectedDept(data.department || requestItem.forwarded_department || '');
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

  const handleAction = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const gmsId = `GMS-${String(requestItem.grievance).padStart(4, '0')}`;
      if (actionType === 'forward') {
        await api.post(`admin/requests/${requestItem.id}/forward/`, {
          department_id: selectedDept || undefined,
          admin_remark: adminRemark.trim(),
        });
        onSuccess(`Request ${gmsId} successfully forwarded to department.`);
      } else {
        if (!adminRemark.trim()) {
          setError('Please provide an admin remark for this action.');
          setSubmitting(false);
          return;
        }
        if (actionType === 'close') {
          await api.post(`admin/requests/${requestItem.id}/close/`, {
            admin_remark: adminRemark.trim(),
          });
          onSuccess(`Escalation for ${gmsId} has been closed.`);
        } else {
          await api.post(`admin/requests/${requestItem.id}/reject/`, {
            admin_remark: adminRemark.trim(),
          });
          onSuccess(`Request ${gmsId} has been rejected.`);
        }
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || 'Action failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const isPending = requestItem.status === 'PENDING';
  const isEscalation = requestItem.request_type === 'ESCALATION';

  return (
    <div className="modal-backdrop" role="presentation">
      <form className={`workflow-modal admin-request-modal admin-request-${requestItem.request_type.toLowerCase()}`} onSubmit={handleAction}>
        <div className="modal-header">
          <div>
            <span className="req-type-pill">{requestTypeLabel(requestItem.request_type)}</span>
            <h2>Request Review: GMS-{String(requestItem.grievance).padStart(4, '0')}</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close modal">×</button>
        </div>

        {error && <div className="workflow-toast error">{error}</div>}

        {/* Student Submission Card */}
        <section className="request-section-card highlight">
          <div className="section-card-header">
            <h3>Student Request Details</h3>
            <span className={`status-badge req-status-${requestItem.status.toLowerCase()}`}>{requestItem.status}</span>
          </div>
          <dl className="request-meta-grid">
            <div><dt>Submitted By</dt><dd>{requestItem.student_name}</dd></div>
            <div><dt>Submission Date</dt><dd>{formatDate(requestItem.request_type === 'ESCALATION' ? requestItem.grievance_created_at : requestItem.created_at)}</dd></div>
            <div><dt>Request Type</dt><dd><strong>{requestTypeLabel(requestItem.request_type)}</strong></dd></div>
          </dl>
          <div className="request-reason-box">
            <strong>Student Reason:</strong>
            <p>{requestItem.reason}</p>
          </div>
          {requestItem.attachment && (
            <div className="request-attachment-snippet">
              <span>Attachment:</span>
              <a href={requestItem.attachment} target="_blank" rel="noreferrer" download className="btn btn-outline btn-sm">
                Download Attachment
              </a>
            </div>
          )}
        </section>

        {/* Original Grievance Snippet */}
        {loadingGrievance ? (
          <div className="dashboard-state"><div className="spinner" /><p>Loading grievance record...</p></div>
        ) : grievance ? (
          <section className="request-section-card">
            <div className="section-card-header">
              <h3>Original Grievance Record</h3>
              <StatusBadge status={grievance.current_status} />
            </div>
            <h4>{grievance.title}</h4>
            <p className="grievance-desc-preview">{grievance.description}</p>
            <div className="grievance-meta-row">
              <span>Category: <strong>{grievance.category_name || '—'}</strong></span>
              <span>Current Dept: <strong>{grievance.department_name || 'Unassigned'}</strong></span>
              <span>Reopened: <strong>{grievance.is_reopened ? 'Yes' : 'No'}</strong></span>
            </div>

            {/* Department Responses */}
            {grievance.responses?.length > 0 && (
              <div className="dept-response-snippet">
                <strong>Latest Department Response:</strong>
                <p>{grievance.responses[grievance.responses.length - 1].content}</p>
              </div>
            )}
          </section>
        ) : null}

        {/* Admin Action Review Panel */}
        {isPending ? (
          <section className="request-action-panel">
            <h3>Campus Admin Review Action</h3>
            <div className="action-toggle-row">
              <button
                type="button"
                className={`btn ${actionType === 'forward' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setActionType('forward')}
              >
                Forward to Department
              </button>
              {isEscalation && (
                <button
                  type="button"
                  className={`btn ${actionType === 'close' ? 'btn-success' : 'btn-outline'}`}
                  onClick={() => setActionType('close')}
                >
                  Close Request
                </button>
              )}
              <button
                type="button"
                className={`btn ${actionType === 'reject' ? 'btn-danger' : 'btn-outline'}`}
                onClick={() => setActionType('reject')}
              >
                Reject Request
              </button>
            </div>

            {actionType === 'forward' && (
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label htmlFor="forward-dept-select">Target Department</label>
                <select
                  id="forward-dept-select"
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="status-select-dropdown"
                >
                  <option value="">-- Select Department --</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="admin-remark">
                Campus Admin Remarks {actionType !== 'forward' && <span className="required-star">*</span>}
              </label>
              <textarea
                id="admin-remark"
                value={adminRemark}
                onChange={(e) => setAdminRemark(e.target.value)}
                placeholder={
                  actionType === 'forward'
                    ? 'Instructions or note for the department HOD...'
                    : actionType === 'reject'
                      ? 'Reason for rejecting student request...'
                      : 'Reason for closing the escalated grievance...'
                }
                rows="3"
                required={actionType !== 'forward'}
              />
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>Cancel</button>
              <button
                type="submit"
                className={`btn ${
                  actionType === 'forward' ? 'btn-primary'
                    : actionType === 'reject' ? 'btn-danger'
                      : 'btn-success'
                }`}
                disabled={submitting}
              >
                {submitting
                  ? 'Processing...'
                  : actionType === 'forward' ? 'Forward to Department'
                    : actionType === 'reject' ? 'Reject Request'
                      : 'Close Request'}
              </button>
            </div>
          </section>
        ) : (
          <section className="request-section-card resolved-summary">
            <h3>Admin Decision Record</h3>
            <p>Decision: <strong>{requestItem.status_display || requestItem.status}</strong></p>
            <p>Reviewed by: <strong>{requestItem.reviewed_by_admin_name || 'Campus Admin'}</strong> on {formatDate(requestItem.resolved_at)}</p>
            {requestItem.forwarded_department_name && <p>Forwarded to: <strong>{requestItem.forwarded_department_name}</strong></p>}
            {requestItem.admin_remark && <p>Admin Remark: <em>"{requestItem.admin_remark}"</em></p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
            </div>
          </section>
        )}
      </form>
    </div>
  );
};

export default AdminRequestDetailModal;
