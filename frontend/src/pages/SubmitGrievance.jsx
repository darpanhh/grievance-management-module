import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import FileUpload from '../components/FileUpload';

const initialForm = { title: '', description: '', category: '', department: '', is_anonymous: false };

const getErrorMessage = (error) => {
  const data = error.response?.data;
  if (error.response?.status === 429) return data?.detail || 'You have reached the daily limit of 3 grievances. Please try again after midnight.';
  if (typeof data === 'string') return data;
  if (data?.detail || data?.message || data?.error) return data.detail || data.message || data.error;
  if (data && typeof data === 'object') {
    const [field, value] = Object.entries(data)[0] || [];
    return field ? `${field}: ${Array.isArray(value) ? value[0] : value}` : 'We could not submit your grievance.';
  }
  return 'We could not submit your grievance. Please try again.';
};

const SubmitGrievance = () => {
  const [form, setForm] = useState(initialForm);
  const [files, setFiles] = useState([]);
  const [options, setOptions] = useState({ categories: [], departments: [] });
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    Promise.all([api.get('categories/'), api.get('departments/')])
      .then(([categories, departments]) => setOptions({ categories: categories.data, departments: departments.data }))
      .catch(() => setError('Unable to load categories and departments. Please refresh and try again.'))
      .finally(() => setLoadingOptions(false));
  }, []);

  const updateField = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.description.trim().length < 10 || form.description.trim().length > 5000) {
      setError('Description must be between 10 and 5000 characters.');
      return;
    }
    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, String(value)));
    files.forEach((file) => payload.append('uploaded_files', file));

    setSubmitting(true);
    try {
      const { data } = await api.post('grievances/', payload, { headers: { 'Content-Type': 'multipart/form-data' } });
      setConfirmation(data);
      setForm(initialForm);
      setFiles([]);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="grievance-page">
      <div className="grievance-container">
        <div className="page-heading"><span>Grievance intake</span><h1>Submit a grievance</h1><p>Share the details clearly so the right department can take action.</p></div>
        <form className="grievance-form" onSubmit={handleSubmit}>
          {error && <div className="form-alert danger" role="alert">{error}</div>}
          <div className="form-group"><label htmlFor="title">Title</label><input id="title" name="title" value={form.title} onChange={updateField} minLength="5" maxLength="255" required placeholder="A concise summary of the issue" /><small>5–255 characters</small></div>
          <div className="form-group"><label htmlFor="description">Description</label><textarea id="description" name="description" value={form.description} onChange={updateField} minLength="10" maxLength="5000" required placeholder="Explain what happened, when, and where. Avoid personal information unless necessary." rows="8" /><small>{form.description.length}/5000 characters (minimum 10)</small></div>
          <div className="form-row">
            <div className="form-group"><label htmlFor="category">Category</label><select id="category" name="category" value={form.category} onChange={updateField} required disabled={loadingOptions}><option value="">Select a category</option>{options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
            <div className="form-group"><label htmlFor="department">Department</label><select id="department" name="department" value={form.department} onChange={updateField} required disabled={loadingOptions}><option value="">Select a department</option>{options.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div>
          </div>
          <label className="anonymous-toggle"><input type="checkbox" name="is_anonymous" checked={form.is_anonymous} onChange={updateField} /><span><strong>Submit anonymously</strong><small>Your identity remains available only for internal audit purposes. You will receive a secret tracking code once—save it securely.</small></span></label>
          <div className="form-group"><label>Attachments <small>(optional)</small></label><FileUpload files={files} onChange={setFiles} disabled={submitting} /></div>
          <button className="btn btn-primary submit-grievance-btn" type="submit" disabled={submitting || loadingOptions}>{submitting ? 'Submitting…' : 'Submit grievance'}</button>
        </form>
      </div>
      {confirmation && <div className="modal-backdrop" role="presentation"><div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-title"><div className="success-mark">✓</div><h2 id="confirmation-title">Grievance submitted</h2><p>Your grievance has been recorded. Keep these details for your records.</p><div className="confirmation-id"><span>Grievance ID</span><strong>GMS-{String(confirmation.id).padStart(4, '0')}</strong></div>{confirmation.secret_code && <div className="secret-code"><span>Anonymous secret code — shown once only</span><strong>{confirmation.secret_code}</strong><small>Copy and save this code. It is required to track this grievance.</small></div>}<div className="modal-actions"><Link className="btn btn-outline" to="/grievances/track">Track grievance</Link><button className="btn btn-primary" onClick={() => setConfirmation(null)}>Done</button></div></div></div>}
    </section>
  );
};

export default SubmitGrievance;
