import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import GrievanceCard from './GrievanceCard';
import SearchFilter from './SearchFilter';

const GrievanceListView = ({ eyebrow, title, description, emptyMessage, submitLink = false, pageClass = '', showFilters = true }) => {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [ordering, setOrdering] = useState('-created_at');

  const location = useLocation();
  const navigate = useNavigate();
  const submitted = location.state?.submitted;

  const dismissSubmitted = () => navigate(location.pathname, { replace: true });

  const loadGrievances = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('grievances/', {
        params: {
          ...(search && { search }),
          ...(status && { status }),
          ...(category && { category }),
          ...(dateFrom && { date_from: dateFrom }),
          ...(dateTo && { date_to: dateTo }),
          ordering,
        },
      });
      setGrievances(Array.isArray(data) ? data : data.results || []);
    } catch {
      setError('We could not load grievances. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [search, status, category, dateFrom, dateTo, ordering]);

  useEffect(() => { loadGrievances(); }, [loadGrievances]);

  return (
    <section className={`dashboard-page ${pageClass}`}>
      <div className="dashboard-container">
        <header className="dashboard-heading">
          <div className="heading-content">
            {eyebrow && <span className="eyebrow-badge">{eyebrow}</span>}
            <h1 className="dashboard-title">{title}</h1>
            <p className="dashboard-description">{description}</p>
          </div>
          {submitLink && (
            <Link className="btn btn-primary submit-btn" to="/grievances/new">
              <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Submit Grievance
            </Link>
          )}
        </header>

        {submitted && (
          <div className="modal-backdrop" role="presentation">
            <div className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="submitted-title">
              <div className="success-mark">✓</div>
              <h2 id="submitted-title">Grievance submitted</h2>
              <p>Your grievance has been recorded. It appears first in your list below.</p>
              <div className="confirmation-id"><span>Grievance ID</span><strong>GMS-{String(submitted.id).padStart(4, '0')}</strong></div>
              {submitted.secret_code && (
                <div className="secret-code">
                  <span>Anonymous secret code — shown once only</span>
                  <strong>{submitted.secret_code}</strong>
                  <small>Copy and save the grievance id and secret code. It is required to track this grievance.</small>
                </div>
              )}
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={dismissSubmitted}>Done</button>
              </div>
            </div>
          </div>
        )}

        {showFilters && (
          <SearchFilter
            value={search} onSearchChange={setSearch}
            status={status} onStatusChange={setStatus}
            category={category} onCategoryChange={setCategory}
            dateFrom={dateFrom} onDateFromChange={setDateFrom}
            dateTo={dateTo} onDateToChange={setDateTo}
            ordering={ordering} onOrderingChange={setOrdering}
          />
        )}

        {loading ? (
          <div className="dashboard-state">
            <div className="spinner" />
            <p>Loading grievances…</p>
          </div>
        ) : error ? (
          <div className="dashboard-state error-state">
            <h2>Unable to load grievances</h2>
            <p>{error}</p>
            <button type="button" className="btn btn-primary" onClick={loadGrievances}>Try again</button>
          </div>
        ) : grievances.length === 0 ? (
          <div className="dashboard-state empty-state">
            <div className="empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2>No grievances found</h2>
            <p>{emptyMessage}</p>
            {submitLink && (
              <Link className="btn btn-primary" to="/grievances/new" style={{ marginTop: '0.75rem' }}>
                Submit Your First Grievance
              </Link>
            )}
          </div>
        ) : (
          <div className="grievance-card-list">
            {grievances.map((grievance) => (
              <GrievanceCard key={grievance.id} grievance={grievance} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default GrievanceListView;

