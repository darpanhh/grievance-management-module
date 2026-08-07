import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import GrievanceCard from './GrievanceCard';
import SearchFilter from './SearchFilter';

const GrievanceListView = ({ eyebrow, title, description, emptyMessage, submitLink = false, pageClass = '' }) => {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [ordering, setOrdering] = useState('-created_at');

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

  // Compute summary metrics
  const totalCount = grievances.length;
  const pendingCount = grievances.filter((g) => ['SUBMITTED', 'UNDER_REVIEW', 'REOPENED', 'ESCALATED','IN_PROGRESS'].includes(g.current_status)).length;
  const resolvedCount = grievances.filter((g) => ['RESOLVED', 'CLOSED'].includes(g.current_status)).length;

  return (
    <section className={`dashboard-page ${pageClass}`}>
      <div className="dashboard-container">
        <header className="dashboard-heading">
          <div className="heading-content">
            <span className="eyebrow-badge">{eyebrow}</span>
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

        {/* Summary Metrics Grid */}
        <div className="summary-metrics-grid">
          <div className="metric-card metric-total">
            <div className="metric-header">
              <span className="metric-label">Total Grievances</span>
              <div className="metric-icon total-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
            </div>
            <strong className="metric-value">{totalCount}</strong>
          </div>
          <div className="metric-card metric-pending">
            <div className="metric-header">
              <span className="metric-label">In Progress</span>
              <div className="metric-icon pending-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
            </div>
            <strong className="metric-value">{pendingCount}</strong>
          </div>
          <div className="metric-card metric-resolved">
            <div className="metric-header">
              <span className="metric-label">Resolved</span>
              <div className="metric-icon resolved-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
            </div>
            <strong className="metric-value">{resolvedCount}</strong>
          </div>
        </div>

        <SearchFilter
          value={search} onSearchChange={setSearch}
          status={status} onStatusChange={setStatus}
          category={category} onCategoryChange={setCategory}
          dateFrom={dateFrom} onDateFromChange={setDateFrom}
          dateTo={dateTo} onDateToChange={setDateTo}
          ordering={ordering} onOrderingChange={setOrdering}
        />

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

