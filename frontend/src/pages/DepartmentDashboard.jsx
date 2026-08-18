import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import SearchFilter from '../components/SearchFilter';
import { CategoryBreakdownGraph, ResolvedUnresolvedGraph, TrendLineGraph } from '../components/DashboardCharts';
import { useAuth } from '../contexts/AuthContext';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(date)) : '—';

const FILTER_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'REOPENED', 'ESCALATED', 'RESOLVED', 'REJECTED', 'CLOSED'];

const HodIcon = ({ name }) => {
  const paths = {
    total: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" /></>,
    pending: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
    underReview: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    escalated: <><path d="M4 17 10 11l4 4 6-7" /><path d="M15 8h5v5" /></>,
    rejected: <><circle cx="12" cy="12" r="8" /><path d="m9 9 6 6M15 9l-6 6" /></>,
    resolved: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.3 2.3 4.8-5" /></>,
  };
  return <svg className="admin-kpi-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
};

const DepartmentDashboard = () => {
  const { user } = useAuth();
  const departmentName = user?.department_name || 'Department';
  const [activeTab, setActiveTab] = useState('ACTION_REQUIRED'); // 'ACTION_REQUIRED' | 'NEEDS_REVIEW' | 'ALL' | 'ESCALATED' | 'RESOLVED' | 'SPAM'

  const [grievances, setGrievances] = useState([]);
  const [metrics, setMetrics] = useState({
    total: 0,
    action_required: 0,
    needs_review: 0,
    spam_count: 0,
    closed_resolved: 0,
    escalated: 0,
    status_breakdown: {},
    category_breakdown: [],
    trends: {},
    resolved_unresolved: {},
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search & Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [category, setCategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [ordering, setOrdering] = useState('-created_at');

  const fetchDepartmentGrievances = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listResult, dashboardResult] = await Promise.allSettled([
        api.get('grievances/', {
          params: {
            ...(search && { search }),
            ...(statusFilter && { status: statusFilter }),
            ...(category && { category }),
            ...(dateFrom && { date_from: dateFrom }),
            ...(dateTo && { date_to: dateTo }),
            ordering,
          },
        }),
        api.get('dashboard/department/'),
      ]);
      if (listResult.status === 'rejected') throw listResult.reason;
      const data = listResult.value.data;
      setGrievances(Array.isArray(data) ? data : data.results || []);
      if (dashboardResult.status === 'fulfilled' && dashboardResult.value.data?.counts) {
        setMetrics(dashboardResult.value.data.counts);
      }
    } catch {
      setError('Could not load department grievances. Please check connection.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, category, dateFrom, dateTo, ordering]);

  useEffect(() => {
    fetchDepartmentGrievances();
  }, [fetchDepartmentGrievances]);

  const showAllGrievances = () => { setStatusFilter(''); setActiveTab('ALL'); scrollToWorkspace(); };
  const showActionRequired = () => { setStatusFilter(''); setActiveTab('ACTION_REQUIRED'); scrollToWorkspace(); };
  const showNeedsReview = () => { setStatusFilter(''); setActiveTab('NEEDS_REVIEW'); scrollToWorkspace(); };
  const showSpamQueue = () => { setStatusFilter(''); setActiveTab('SPAM'); scrollToWorkspace(); };
  const showEscalatedGrievances = () => { setStatusFilter(''); setActiveTab('ESCALATED'); scrollToWorkspace(); };
  const showResolvedGrievances = () => { setStatusFilter(''); setActiveTab('RESOLVED'); scrollToWorkspace(); };
  const showStatusGrievances = (status) => () => { setStatusFilter(status); setActiveTab('ALL'); scrollToWorkspace(); };

  const workspaceRef = useRef(null);

  const scrollToWorkspace = () => {
    setTimeout(() => {
      if (workspaceRef.current) {
        workspaceRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  const statusCounts = metrics.status_breakdown || {};
  const underReviewGrievances = statusCounts.UNDER_REVIEW || 0;
  const inProgressGrievances = statusCounts.IN_PROGRESS || 0;

  // A grievance that was escalated (escalation_level > 0) is never counted as
  // pending for the HOD — once forwarded to Campus Admin it is read-only.
  const wasEscalated = (g) => Number(g.escalation_level) > 0 || g.current_status === 'ESCALATED';
  const isSpamHandled = (g) => g.spam_status === 'REVIEW' || g.spam_status === 'SPAM';
  // A REJECTED grievance with a pending rejection appeal is reviewed by the
  // HOD and belongs in Action Required.
  const isActionable = (g) => (
    ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'REOPENED'].includes(g.current_status) && !isSpamHandled(g)
  );

  const displayGrievances = grievances.filter(g => {
    if (activeTab === 'ACTION_REQUIRED') return !wasEscalated(g) && isActionable(g);
    if (activeTab === 'NEEDS_REVIEW') return g.spam_status === 'REVIEW';
    if (activeTab === 'SPAM') return g.spam_status === 'SPAM';
    if (activeTab === 'ESCALATED') return wasEscalated(g);
    if (activeTab === 'RESOLVED') return ['RESOLVED', 'CLOSED'].includes(g.current_status);
    return true; // ALL
  });

  const kpis = [
    { label: 'Total', value: metrics.total || 0, icon: 'total', tone: 'primary', onClick: showAllGrievances },
    { label: 'Submitted', value: statusCounts.SUBMITTED || 0, icon: 'pending', tone: 'primary', onClick: showStatusGrievances('SUBMITTED') },
    { label: 'Under Review', value: underReviewGrievances, icon: 'underReview', tone: 'primary', onClick: showStatusGrievances('UNDER_REVIEW') },
    { label: 'In Progress', value: inProgressGrievances, icon: 'pending', tone: 'primary', onClick: showStatusGrievances('IN_PROGRESS') },
    { label: 'Reopened', value: statusCounts.REOPENED || 0, icon: 'pending', tone: 'primary', onClick: showStatusGrievances('REOPENED') },
    { label: 'Resolved', value: metrics.closed_resolved || 0, icon: 'resolved', tone: 'success', onClick: showResolvedGrievances },
    { label: 'Escalated', value: statusCounts.ESCALATED || 0, icon: 'escalated', tone: 'warning', onClick: showStatusGrievances('ESCALATED') },
    { label: 'Rejected', value: statusCounts.REJECTED || 0, icon: 'rejected', tone: 'danger', onClick: showStatusGrievances('REJECTED') },
  ];

  return (
    <section className="dashboard-page admin-dashboard-page">
      <div className="dashboard-container">
        <header className="dashboard-heading">
          <div>
            
            <h1>{departmentName}</h1>
            <p>Monitor grievance activity and focus on the work that needs attention.</p>
          </div>
        </header>

        {error && <div className="workflow-toast error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}

        <section className="admin-kpi-grid" aria-label="Grievance summary">
          {kpis.map((kpi) => (
            <button key={kpi.label} className={`admin-kpi-card ${kpi.tone}`} onClick={kpi.onClick}>
              <span className="admin-kpi-icon-wrap"><HodIcon name={kpi.icon} /></span>
              <span className="admin-kpi-copy"><span>{kpi.label}</span><strong>{kpi.value}</strong></span>
            </button>
          ))}
        </section>

        <section className="admin-charts-section hod-analytics" aria-label="Grievance analytics">
          <div className="admin-charts-top-row">
            <ResolvedUnresolvedGraph data={metrics.resolved_unresolved} />
            <CategoryBreakdownGraph data={metrics.category_breakdown} />
          </div>
          <div className="admin-charts-bottom-row">
            <TrendLineGraph trends={metrics.trends} title="Department Grievance Trend" />
          </div>
        </section>

        <div className="admin-workspace-label" ref={workspaceRef}>
          <div><h2>{activeTab === 'ACTION_REQUIRED' ? 'Action Required' : activeTab === 'NEEDS_REVIEW' ? 'Spam Needs Review' : activeTab === 'SPAM' ? 'Spam Archive' : activeTab === 'ESCALATED' ? 'Escalated Grievances Flow' : activeTab === 'RESOLVED' ? 'Resolved Grievances' : 'All Grievances'}</h2></div>
          
        </div>

        {/* Primary HOD Navigation Tabs */}
        <nav className="hod-status-tabs" aria-label="HOD navigation tabs">
          <button
            className={`hod-tab-btn ${activeTab === 'ACTION_REQUIRED' ? 'active' : ''}`}
            onClick={showActionRequired}
          >
            Action Required <span className="hod-tab-badge">{metrics.action_required || 0}</span>
          </button>
          <button
            className={`hod-tab-btn ${activeTab === 'NEEDS_REVIEW' ? 'active' : ''}`}
            onClick={showNeedsReview}
          >
            Needs Review ({metrics.needs_review || 0})
          </button>
          <button
            className={`hod-tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
            onClick={showAllGrievances}
          >
            All Grievances ({metrics.total || 0})
          </button>
          <button
            className={`hod-tab-btn ${activeTab === 'ESCALATED' ? 'active' : ''}`}
            onClick={showEscalatedGrievances}
          >
            Escalated Flow ({metrics.escalated || 0})
          </button>
          <button
            className={`hod-tab-btn ${activeTab === 'RESOLVED' ? 'active' : ''}`}
            onClick={showResolvedGrievances}
          >
            Resolved ({metrics.closed_resolved || 0})
          </button>
          <button
            className={`hod-tab-btn ${activeTab === 'SPAM' ? 'active' : ''}`}
            onClick={showSpamQueue}
          >
            Spam ({metrics.spam_count || 0})
          </button>
        </nav>

        {/* Search & Filter */}
        <SearchFilter
          statuses={FILTER_STATUSES}
          value={search} onSearchChange={setSearch}
          status={statusFilter} onStatusChange={setStatusFilter}
          category={category} onCategoryChange={setCategory}
          dateFrom={dateFrom} onDateFromChange={setDateFrom}
          dateTo={dateTo} onDateToChange={setDateTo}
          ordering={ordering} onOrderingChange={setOrdering}
        />

        {/* Content list state */}
        {loading ? (
          <div className="dashboard-state">
            <div className="spinner" />
            <p>Loading grievances for your department…</p>
          </div>
        ) : displayGrievances.length === 0 ? (
          <div className="dashboard-state">
            <h2>No Grievances Found</h2>
            <p>{activeTab === 'ACTION_REQUIRED' ? 'Great job! There are no pending grievances needing HOD action right now.' : activeTab === 'NEEDS_REVIEW' ? 'No AI-flagged submissions are awaiting a spam decision.' : activeTab === 'SPAM' ? 'No grievances have been confirmed as spam.' : 'No grievances match the current filter criteria.'}</p>
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
                  <span>Category: <strong>{grievance.category_name || 'Uncategorized'}</strong></span>
                  <span>Submitted: <strong>{formatDate(grievance.created_at)}</strong></span>
                  <span>Submitter: <strong>{grievance.is_anonymous ? 'Anonymous' : grievance.submitter_name || 'Student'}</strong></span>
                  <span>Attachments: <strong>{grievance.attachment_count || 0}</strong></span>
                </div>

                <div className="hod-card-actions">
                  <Link
                    to={`/grievances/${grievance.id}`}
                    className={`btn ${activeTab === 'ALL' || activeTab === 'ESCALATED' || activeTab === 'RESOLVED' || activeTab === 'SPAM' ? 'btn-outline' : 'btn-primary'} btn-sm`}
                  >
                    {activeTab === 'ACTION_REQUIRED' ? 'Review & Update Status' : activeTab === 'NEEDS_REVIEW' ? 'Review Spam Flag' : 'View Full Details'}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default DepartmentDashboard;