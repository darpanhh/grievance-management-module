import { useState } from 'react';
import api from '../services/api';

const REQUEST_TITLES = {
  REJECTION_APPEAL: 'Appeal Rejected Grievance',
  SPAM_APPEAL: 'Appeal Spam Classification',
  REOPEN: 'Request Grievance Reopening',
};

const REQUEST_DESCRIPTIONS = {
  REJECTION_APPEAL: 'Please provide a clear reason why the rejection should be reconsidered by the Campus Admin.',
  SPAM_APPEAL: 'Explain why your grievance is genuine and should not be classified as spam.',
  REOPEN: 'Explain why the resolution was unsatisfactory or why this grievance requires further department review.',
};

const RequestModal = ({ grievance, requestType, onClose, onSuccess }) => {
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Reason is mandatory. Please explain your request before submitting.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('request_type', requestType);
      formData.append('reason', reason.trim());
      if (attachment) {
        formData.append('attachment', attachment);
      }

      await api.post(`grievances/${grievance.id}/request/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      onSuccess(`Your ${REQUEST_TITLES[requestType] || 'request'} has been submitted and is pending Campus Admin review.`);
      onClose();
    } catch (err) {
      const respData = err.response?.data;
      const msg = typeof respData === 'string'
        ? respData
        : respData?.error || respData?.detail || 'Failed to submit request. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className={`workflow-modal request-modal request-modal-${requestType.toLowerCase()}`} onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <span className="modal-tag">Student Request &amp; Appeal</span>
            <h2>{REQUEST_TITLES[requestType] || 'Submit Request'}</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close modal">×</button>
        </div>

        <div className="grievance-context-snippet">
          <strong>GMS-{String(grievance.id).padStart(4, '0')}: {grievance.title}</strong>
          <p>{REQUEST_DESCRIPTIONS[requestType]}</p>
        </div>

        {error && <div className="workflow-toast error">{error}</div>}

        <div className="form-group">
          <label htmlFor="request-reason">
            Reason / Justification <span className="required-star">*</span>
          </label>
          <textarea
            id="request-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Write your detailed justification here (mandatory)..."
            rows="5"
            required
            autoFocus
          />
        </div>

        <div className="form-group">
          <label htmlFor="request-attachment">Supporting Document (Optional)</label>
          <div className="request-file-picker">
            <input id="request-attachment" type="file" onChange={(e) => setAttachment(e.target.files[0] || null)} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />
            <label htmlFor="request-attachment"><span className="request-file-icon" aria-hidden="true">↑</span><span>{attachment ? attachment.name : 'Choose a supporting document'}</span><b>{attachment ? 'Change file' : 'Browse files'}</b></label>
          </div>
          <small className="form-help">Accepted formats: PDF, DOC, DOCX, PNG, JPG (Max 5MB)</small>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Submitting Request...' : 'Submit to Campus Admin'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RequestModal;
