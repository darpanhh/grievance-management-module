import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import SearchFilter from '../components/SearchFilter';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(date)) : '—';

const requestTypeLabel = (type) => {
  switch (type) {
    case 'REOPEN': return 'Reopen Request';
    case 'REJECTION_APPEAL': return 'Rejection Appeal';
    case 'SPAM_APPEAL': return 'Spam Appeal';
    case 'ESCALATION': return 'Escalation';
    default: return type || 'Request';
  }
};

const AdminIcon = ({ name }) => {
  const paths = {
    total: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" /></>,
    pending: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
    underReview: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    escalated: <><path d="M4 17 10 11l4 4 6-7" /><path d="M15 8h5v5" /></>,
    resolved: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.3 2.3 4.8-5" /></>,
  };
  return <svg className="admin-kpi-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
};

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('REQUESTS'); // 'REQUESTS' | 'SPAM' | 'ALL' | 'CLOSED'

  const [metrics, setMetrics] = useState({
    total: 0,
    pending_requests: 0,
    pending_requests_breakdown: { REOPEN: 0, REJECTION_APPEAL: 0, SPAM_APPEAL: 0, ESCALATION: 0 },
    spam_review: 0,
    closed_resolved: 0,
  });

  const [grievances, setGrievances] = useState([]);
  const [requestsList, setRequestsList] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Search & Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [requestGrievanceStatusFilter, setRequestGrievanceStatusFilter] = useState(''); // filters requests by underlying grievance status
  const [statusGroupFilter, setStatusGroupFilter] = useState('');
  const [category, setCategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [ordering, setOrdering] = useState('-created_at');

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch Dashboard Overview Metrics
      const dashRes = await api.get('dashboard/admin/');

      if (dashRes.data?.counts) {
        setMetrics(dashRes.data.counts);
      }

      if (activeTab === 'REQUESTS') {
        // Requests awaiting Campus Admin review (grievance-status filter applied client-side)
        const { data } = await api.get('admin/requests/', {
          params: { status: 'PENDING', ...(search && { search }) },
        });
        setRequestsList(Array.isArray(data) ? data : data.results || []);
      } else {
        // ALL or CLOSED grievances
        const { data } = await api.get('grievances/', {
          params: {
            ...(search && { search }),
            ...(statusFilter && { status: statusFilter }),
            ...(statusGroupFilter && { status_group: statusGroupFilter }),
            ...(category && { category }),
            ...(dateFrom && { date_from: dateFrom }),
            ...(dateTo && { date_to: dateTo }),
            ordering,
          },
        });
        const list = Array.isArray(data) ? data : data.results || [];
        setGrievances(list);
      }
    } catch {
      setError('Could not load dashboard records for Campus Administration.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, statusFilter, statusGroupFilter, category, dateFrom, dateTo, ordering]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Filtered list for CLOSED tab if needed
  const displayGrievances = activeTab === 'CLOSED'
    ? grievances.filter(g => ['RESOLVED', 'CLOSED'].includes(g.current_status))
    : grievances;

  // Client-side status + date filter and sort for the Requests list.
  // Requests whose grievance is already RESOLVED or REJECTED are excluded —
  // the Campus Admin is done with them.
  const requestEffectiveDate = (req) => new Date(req.request_type === 'ESCALATION' ? req.grievance_created_at : req.created_at);
  const displayRequests = requestsList
    .filter((req) => !['RESOLVED', 'REJECTED'].includes(req.grievance_current_status))
    .filter((req) => {
      if (requestGrievanceStatusFilter && req.grievance_current_status !== requestGrievanceStatusFilter) return false;
      const date = requestEffectiveDate(req);
      if (dateFrom && date < new Date(dateFrom)) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (date > end) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const diff = requestEffectiveDate(a) - requestEffectiveDate(b);
      return ordering === 'created_at' ? diff : -diff;
    });

  const statusCounts = metrics.status_breakdown || {};
  const underReviewGrievances = statusCounts.UNDER_REVIEW || 0;
  const inProgressGrievances = statusCounts.IN_PROGRESS || 0;
  const showAllGrievances = () => {
    setStatusFilter('');
    setStatusGroupFilter('');
    setActiveTab('ALL');
  };
  const showSubmittedGrievances = () => {
    setStatusFilter('SUBMITTED');
    setStatusGroupFilter('');
    setActiveTab('ALL');
  };
  const showInProgressGrievances = () => {
    setStatusFilter('IN_PROGRESS');
    setStatusGroupFilter('');
    setActiveTab('ALL');
  };
  const showUnderReviewGrievances = () => {
    setStatusFilter('UNDER_REVIEW');
    setStatusGroupFilter('');
    setActiveTab('ALL');
  };
  const showEscalatedGrievances = () => {
    setStatusFilter('ESCALATED');
    setStatusGroupFilter('');
    setActiveTab('ALL');
  };
  const showRejectedGrievances = () => {
    setStatusFilter('REJECTED');
    setStatusGroupFilter('');
    setActiveTab('ALL');
  };
  const showReopenedGrievances = () => {
    setStatusFilter('REOPENED');
    setStatusGroupFilter('');
    setActiveTab('ALL');
  };
  const showResolvedGrievances = () => {
    setStatusFilter('');
    setStatusGroupFilter('RESOLVED');
    setActiveTab('CLOSED');
  };
  const showRequests = () => {
    setStatusFilter('');
    setStatusGroupFilter('');
    setActiveTab('REQUESTS');
  };
  const primaryStatusDistribution = [
    { label: 'Submitted', value: statusCounts.SUBMITTED || 0, color: '#f59e0b', onClick: showSubmittedGrievances },
    { label: 'Under review', value: underReviewGrievances, color: '#0ea5e9', onClick: showUnderReviewGrievances },
    { label: 'In progress', value: inProgressGrievances, color: '#6366f1', onClick: showInProgressGrievances },
    { label: 'Escalated', value: metrics.escalated || 0, color: '#f97316', onClick: showEscalatedGrievances },
    { label: 'Reopened', value: statusCounts.REOPENED || 0, color: '#7e22ce', onClick: showReopenedGrievances },
    { label: 'Resolved', value: metrics.closed_resolved || 0, color: '#10b981', onClick: showResolvedGrievances },
    { label: 'Rejected', value: statusCounts.REJECTED || 0, color: '#e11d48', onClick: showRejectedGrievances },
  ];
  const statusDistribution = primaryStatusDistribution.filter((item) => item.value > 0);
  const distributionTotal = metrics.total || 1;
  let distributionCursor = 0;
  const statusGradient = statusDistribution.length
    ? `conic-gradient(${statusDistribution.map((item) => {
      const start = distributionCursor;
      distributionCursor += (item.value / distributionTotal) * 100;
      return `${item.color} ${start}% ${distributionCursor}%`;
    }).join(', ')})`
    : 'conic-gradient(#e2e8f0 0 100%)';
  const monthlyTrend = metrics.monthly_trend || [];
  const trendMax = Math.max(...monthlyTrend.map((item) => item.count), 1);
  const kpis = [
    { label: 'Total Grievances', value: metrics.total || 0, icon: 'total', tone: 'primary', onClick: showAllGrievances },
    { label: 'Under Review', value: underReviewGrievances, icon: 'underReview', tone: 'primary', onClick: showUnderReviewGrievances },
    { label: 'In Progress', value: inProgressGrievances, icon: 'pending', tone: 'primary', onClick: showInProgressGrievances },
    { label: 'Escalated Cases', value: metrics.escalated || 0, icon: 'escalated', tone: 'orange', onClick: showEscalatedGrievances },
    { label: 'Resolved Grievances', value: metrics.closed_resolved || 0, icon: 'resolved', tone: 'success', onClick: showResolvedGrievances },
  ];

  return (
    <section className="dashboard-page admin-dashboard-page">
      <div className="dashboard-container">
        <header className="dashboard-heading">
          <div>
            
            <h1>Campus Administration</h1>
            <p>Monitor campus-wide grievances and focus on what needs attention.</p>
          </div>
        </header>

        {toast && <div className="workflow-toast success" role="status">{toast}<button aria-label="Dismiss message" onClick={() => setToast('')}>×</button></div>}
        {error && <div className="workflow-toast error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}

        <section className="admin-kpi-grid" aria-label="Grievance summary">
          {kpis.map((kpi) => (
            <button key={kpi.label} className={`admin-kpi-card ${kpi.tone}`} onClick={kpi.onClick}>
              <span className="admin-kpi-icon-wrap"><AdminIcon name={kpi.icon} /></span>
              <span className="admin-kpi-copy"><span>{kpi.label}</span><strong>{kpi.value}</strong></span>
            </button>
          ))}
        </section>

        <section className="admin-charts-grid" aria-label="Grievance analytics">
          <article className="admin-chart-card status-chart-card">
            <div className="admin-chart-heading"><div><span>LIVE DISTRIBUTION</span><h2>Grievances by Status</h2></div></div>
            <div className="admin-status-chart-body">
              <div className="admin-donut" style={{ background: statusGradient }} role="img" aria-label={`${metrics.total || 0} total grievances`}><div><strong>{metrics.total || 0}</strong><span>Total</span></div></div>
              <div className="admin-chart-legend">{statusDistribution.length ? statusDistribution.map((item) => <button type="button" key={item.label} onClick={item.onClick}><i style={{ background: item.color }} /><span>{item.label}</span><strong>{item.value}</strong></button>) : <p>No grievance data yet.</p>}</div>
            </div>
          </article>
          <article className="admin-chart-card trend-chart-card">
            <div className="admin-chart-heading"><div><span>LAST SIX MONTHS</span><h2>Monthly Grievance Trend</h2></div></div>
            <div className="admin-bar-chart" role="img" aria-label="Monthly grievance trend">{monthlyTrend.map((item) => <div className="admin-bar-column" key={item.month}><span className="admin-bar-value">{item.count}</span><div className="admin-bar-track"><i style={{ height: `${Math.max(item.count ? 12 : 0, (item.count / trendMax) * 100)}%` }} /></div><span className="admin-bar-label">{item.month}</span></div>)}</div>
          </article>
        </section>

        <div className="admin-workspace-label">
          <div><h2>{activeTab === 'REQUESTS' ? 'Action Required' : activeTab === 'CLOSED' ? 'Resolved Grievances' : 'All Grievances'}</h2></div>
          
        </div>

        {/* Primary Admin Navigation Tabs */}
        <nav className="hod-status-tabs" aria-label="Admin navigation tabs">
          <button
            className={`hod-tab-btn ${activeTab === 'REQUESTS' ? 'active' : ''}`}
            onClick={showRequests}
          >
            Action Required <span className="hod-tab-badge">{displayRequests.length}</span>
          </button>
          <button
            className={`hod-tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
            onClick={showAllGrievances}
          >
            All Grievances ({metrics.total || 0})
          </button>
          <button
            className={`hod-tab-btn ${activeTab === 'CLOSED' ? 'active' : ''}`}
            onClick={showResolvedGrievances}
          >
            Resolved ({metrics.closed_resolved || 0})
          </button>
        </nav>

        {/* Search & Filter for Requests */}
        {activeTab === 'REQUESTS' && (
          <SearchFilter
            value={search} onSearchChange={setSearch}
            statuses={['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'REOPENED', 'ESCALATED', 'CLOSED']}
            status={requestGrievanceStatusFilter} onStatusChange={setRequestGrievanceStatusFilter}
            dateFrom={dateFrom} onDateFromChange={setDateFrom}
            dateTo={dateTo} onDateToChange={setDateTo}
            ordering={ordering} onOrderingChange={setOrdering}
            showCategory={false}
          />
        )}

        {/* Search & Filter for All Grievances */}
        {activeTab === 'ALL' && (
          <SearchFilter
            value={search} onSearchChange={setSearch}
            status={statusFilter} onStatusChange={(value) => { setStatusGroupFilter(''); setStatusFilter(value); }}
            category={category} onCategoryChange={setCategory}
            dateFrom={dateFrom} onDateFromChange={setDateFrom}
            dateTo={dateTo} onDateToChange={setDateTo}
            ordering={ordering} onOrderingChange={setOrdering}
          />
        )}

        {/* Search & Filter for Resolved Grievances (no status dropdown) */}
        {activeTab === 'CLOSED' && (
          <SearchFilter
            value={search} onSearchChange={setSearch}
            category={category} onCategoryChange={setCategory}
            dateFrom={dateFrom} onDateFromChange={setDateFrom}
            dateTo={dateTo} onDateToChange={setDateTo}
            ordering={ordering} onOrderingChange={setOrdering}
            showStatus={false}
          />
        )}

        {/* Content list state */}
        {loading ? (
          <div className="dashboard-state">
            <div className="spinner" />
            <p>Loading administration portal data…</p>
          </div>
        ) : activeTab === 'REQUESTS' ? (
          /* Dedicated Requests View */
          displayRequests.length === 0 ? (
            <div className="dashboard-state">
              <h2>No Requests Found</h2>
              <p>No requests match the current filter criteria.</p>
            </div>
          ) : (
            <div className="grievance-card-list">
              {displayRequests.map((reqItem) => (
                <article key={reqItem.id} className="hod-grievance-card">
                  <div className="hod-card-top">
                    <div>
                      <span className="hod-card-id">GMS-{String(reqItem.grievance).padStart(4, '0')}</span>
                      <h3 className="hod-card-title">{reqItem.grievance_title}</h3>
                    </div>
                    <StatusBadge status={reqItem.grievance_current_status} />
                  </div>

                  <div className="hod-card-meta">
                    <span>Request Type: <strong>{requestTypeLabel(reqItem.request_type)}</strong></span>
                    <span>Submitted By: <strong>{reqItem.student_name}</strong></span>
                    <span>Submitted: <strong>{formatDate(reqItem.request_type === 'ESCALATION' ? reqItem.grievance_created_at : reqItem.created_at)}</strong></span>
                  </div>

                  <div className="hod-card-actions">
                    <Link to={`/grievances/${reqItem.grievance}`} className="btn btn-primary btn-sm">
                      View Details & Review
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : (
          /* All or Closed Grievances List */
          displayGrievances.length === 0 ? (
            <div className="dashboard-state">
              <h2>No Grievances Found</h2>
              <p>No grievances match the current filter criteria.</p>
            </div>
          ) : (
            <div className="grievance-card-list">
              {displayGrievances.map((grievance) => (
                <article key={grievance.id} className="hod-grievance-card">
                  <div className="hod-card-top">
                    <div>
                      <span className="hod-card-id">GMS-{String(grievance.id).padStart(4, '0')}</span>
                      <h3 className="hod-card-title">{grievance.title}</h3>
                    </div>
                    <StatusBadge status={grievance.current_status} />
                  </div>

                  <div className="hod-card-meta">
                    <span>Department: <strong>{grievance.department_name || 'Unassigned'}</strong></span>
                    <span>Category: <strong>{grievance.category_name || 'Uncategorized'}</strong></span>
                    <span>Submitted: <strong>{formatDate(grievance.created_at)}</strong></span>
                    <span>Submitter: <strong>{grievance.is_anonymous ? 'Anonymous' : grievance.submitter_name || 'User'}</strong></span>
                  </div>

                  <div className="hod-card-actions">
                    <Link to={`/grievances/${grievance.id}`} className="btn btn-outline btn-sm">
                      View Full Details
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )
        )}

      </div>
    </section>
  );
};

export default AdminDashboard;
