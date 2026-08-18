import { useState } from 'react';
import api from '../services/api';
import FileUpload from './FileUpload';

const REQUEST_META = {
  REOPEN: {
    title: 'Reopen Grievance',
    tag: 'Reopen Request',
    description: 'Explain why the resolution was unsatisfactory. The grievance will be sent back to the assigned department.',
  },
};

const RequestModal = ({ grievance, requestType, onClose, onSuccess }) => {
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const meta = REQUEST_META[requestType] || REQUEST_META.REOPEN;

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
      formData.append('content', reason.trim());

      if (requestType === 'REOPEN') {
        files.forEach((file) => formData.append('uploaded_files', file));
        await api.post(`grievances/${grievance.id}/reopen/`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      const successMsg = 'Your grievance has been reopened and forwarded to the assigned department.';
      onSuccess(successMsg);
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
            <span className="modal-tag">{meta.tag}</span>
            <h2>{meta.title}</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close modal">×</button>
        </div>

        <div className="grievance-context-snippet">
          <strong>GMS-{String(grievance.id).padStart(4, '0')}: {grievance.title}</strong>
          <p>{meta.description}</p>
        </div>

        {error && <div className="workflow-toast error">{error}</div>}

        <div className="form-group">
          <label htmlFor="request-reason">
            Reason <span className="required-star">*</span>
          </label>
          <textarea
            id="request-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Write your justification here..."
            rows="4"
            required
            autoFocus
          />
        </div>

        <div className="form-group">
          <label>Supporting Documents <small>(optional, max 3)</small></label>
          <FileUpload files={files} onChange={setFiles} disabled={submitting} hideDropZone={files.length >= 3} />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Reopen & Send to Department'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RequestModal;
