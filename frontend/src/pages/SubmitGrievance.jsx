import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import FileUpload from '../components/FileUpload';

const initialForm = { title: '', description: '', category: '', department: '', is_anonymous: false, is_sensitive: false };

const getErrorMessage = (error) => {
  const data = error.response?.data;
  if (error.response?.status === 429) return data?.detail || 'You have reached the daily limit of 3 grievances. Please try again tomorrow.';
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
  const [limitError, setLimitError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.get('categories/'), api.get('departments/')])
      .then(([categories, departments]) => setOptions({ categories: categories.data, departments: departments.data }))
      .catch(() => setError('Unable to load categories and departments. Please refresh and try again.'))
      .finally(() => setLoadingOptions(false));
  }, []);

  const updateField = (event) => {
    const { name, value, type, checked } = event.target;
    if (type === 'radio') {
      setForm((current) => ({ ...current, [name]: value === 'true' }));
      return;
    }
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
      navigate('/dashboard', { state: { submitted: data } });
    } catch (requestError) {
      const message = getErrorMessage(requestError);
      if (requestError.response?.status === 429) {
        setLimitError(message);
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="grievance-page">
      <div className="grievance-container">
        <div className="page-heading"><h1>Submit a grievance</h1><p>Share the details clearly so the department can take action.</p></div>
        <form className="grievance-form" onSubmit={handleSubmit}>
          {error && <div className="form-alert danger" role="alert">{error}</div>}
          <div className="form-group"><label htmlFor="title">Title</label><input id="title" name="title" value={form.title} onChange={updateField} minLength="5" maxLength="255" required placeholder="A concise summary of the issue" /><small>5–255 characters</small></div>
          <div className="form-group"><label htmlFor="description">Description</label><textarea id="description" name="description" value={form.description} onChange={updateField} minLength="10" maxLength="5000" required placeholder="Explain what happened, when, and where. " rows="8" /><small>{form.description.length}/5000 characters (minimum 10)</small></div>
          <div className="form-row">
            <div className="form-group"><label htmlFor="category">Category</label><select id="category" name="category" value={form.category} onChange={updateField} required disabled={loadingOptions}><option value="">Select a category</option>{options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
            <div className="form-group"><label htmlFor="department">Department</label><select id="department" name="department" value={form.department} onChange={updateField} required disabled={loadingOptions}><option value="">Select a department</option>{options.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div>
          </div>
          <label className="anonymous-toggle"><input type="checkbox" name="is_anonymous" checked={form.is_anonymous} onChange={updateField} /><span><strong>Submit anonymously</strong><small>Your identity remains anonymous and no one be able to see your identity. You will receive a secret tracking code once—save it securely.</small></span></label>
          <div className="form-group">
            <label>Is this grievance sensitive?</label>
            <div className="sensitive-radio-row">
              <label className="sensitive-radio-label">
                <input type="radio" name="is_sensitive" value="false" checked={form.is_sensitive === false} onChange={updateField} />
                <span>No</span>
              </label>
              <label className="sensitive-radio-label">
                <input type="radio" name="is_sensitive" value="true" checked={form.is_sensitive === true} onChange={updateField} />
                <span>Yes</span>
              </label>
            </div>
          </div>
          <div className="form-group"><label>Attachments <small>(optional, max 3)</small></label><FileUpload files={files} onChange={setFiles} disabled={submitting} hideDropZone={files.length >= 3} /></div>
          <button className="btn btn-primary submit-grievance-btn" type="submit" disabled={submitting || loadingOptions}>Submit grievance</button>
        </form>
      </div>
      {submitting && (
        <div className="submit-loading-overlay">
          <div className="spinner"></div>
          <p>Submitting grievance...</p>
        </div>
      )}
      {limitError && (
        <div className="modal-backdrop" role="presentation">
          <div className="confirmation-modal" role="alertdialog" aria-modal="true" aria-labelledby="limit-title">
            <div className="error-mark">!</div>
            <h2 id="limit-title">Daily submission limit reached</h2>
            <p>{limitError}</p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setLimitError('')}>OK</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default SubmitGrievance;
