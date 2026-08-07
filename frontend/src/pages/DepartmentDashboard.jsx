import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import SearchFilter from '../components/SearchFilter';
import { useAuth } from '../contexts/AuthContext';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(date)) : '—';

const FILTER_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'REOPENED', 'ESCALATED', 'RESOLVED', 'REJECTED', 'CLOSED'];

const DepartmentDashboard = () => {
  const { user } = useAuth();
  const departmentName = user?.department_name || 'Department';
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('ACTION_REQUIRED');
  const [dashboardCounts, setDashboardCounts] = useState(null);

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
      if (dashboardResult.status === 'fulfilled') {
        setDashboardCounts(dashboardResult.value.data?.counts || null);
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

  // Status metrics calculation
  const statusCounts = dashboardCounts?.status_breakdown || {};
  const statusCount = (status) => dashboardCounts ? (statusCounts[status] || 0) : grievances.filter(g => g.current_status === status).length;
  const pendingCount = statusCount('SUBMITTED') + statusCount('UNDER_REVIEW') + statusCount('IN_PROGRESS') + statusCount('REOPENED');
  const escalatedCount = statusCount('ESCALATED');
  const resolvedCount = statusCount('RESOLVED') + statusCount('CLOSED');
  const rejectedCount = statusCount('REJECTED');
  const totalCount = dashboardCounts?.total ?? grievances.length;
  const otherCount = Math.max(0, totalCount - pendingCount - escalatedCount - resolvedCount - rejectedCount);
  const chartTotal = totalCount || 1;
  const distribution = [
    { key: 'ACTION_REQUIRED', label: 'Action required', value: pendingCount, color: '#f59e0b' },
    { key: 'ESCALATED', label: 'Escalated', value: escalatedCount, color: '#f97316' },
    { key: 'RESOLVED', label: 'Resolved', value: resolvedCount, color: '#10b981' },
    { key: 'REJECTED', label: 'Rejected', value: rejectedCount, color: '#f43f5e' },
    { key: 'ALL', label: 'Other', value: otherCount, color: '#94a3b8' },
  ].filter(item => item.value > 0);
  let chartCursor = 0;
  const chartGradient = distribution.length ? `conic-gradient(${distribution.map((item) => {
    const start = chartCursor;
    chartCursor += (item.value / chartTotal) * 100;
    return `${item.color} ${start}% ${chartCursor}%`;
  }).join(', ')})` : 'conic-gradient(#e2e8f0 0 100%)';

  // Tab filtering logic
  const filteredGrievances = grievances.filter(g => {
    if (activeTab === 'ACTION_REQUIRED') return ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'REOPENED'].includes(g.current_status);
    if (activeTab === 'UNDER_REVIEW') return ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS'].includes(g.current_status);
    if (activeTab === 'ESCALATED') return g.current_status === 'ESCALATED';
    if (activeTab === 'RESOLVED') return ['RESOLVED', 'CLOSED'].includes(g.current_status);
    if (activeTab === 'REJECTED') return g.current_status === 'REJECTED';
    return true; // ALL
  });

  return (
    <section className="dashboard-page department-dashboard-page">
      <div className="dashboard-container">
        <header className="dashboard-heading">
          <div>
            <span>Department Portal</span>
            <h1>{departmentName}</h1>
            {/* <p>Review and update grievances.</p> */}
          </div>
        </header>

        <section className="department-overview-grid" aria-label="Department overview">
          <article className="dept-health-card">
            <span className="dept-card-eyebrow">DEPARTMENT WORKSPACE</span>
            <h2>Keep every concern moving.</h2>
            <p>Use the action queue to respond to new issues and keep resolution work visible.</p>
            <div className="dept-health-progress"><span style={{ width: `${totalCount ? Math.round((resolvedCount / totalCount) * 100) : 0}%` }} /></div>
            <div className="dept-health-meta"><span><strong>{totalCount ? Math.round((resolvedCount / totalCount) * 100) : 0}%</strong> resolved</span><span><strong>{pendingCount}</strong> awaiting action</span></div>
          </article>
          <article className="dept-chart-card">
            <div><span className="dept-card-eyebrow">LIVE DISTRIBUTION</span><h2>Status overview</h2><p>Based on the grievances currently shown below.</p></div>
            <div className="dept-chart-wrap">
              <div className="dept-donut" style={{ background: chartGradient }} aria-label={`${totalCount} grievances in current results`}><div><strong>{totalCount}</strong><span>Total</span></div></div>
              <div className="dept-chart-legend">{distribution.slice(0, 4).map((item) => <button key={item.label} type="button" onClick={() => setActiveTab(item.key)}><i style={{ background: item.color }} /><span>{item.label}</span><strong>{item.value}</strong></button>)}</div>
            </div>
          </article>
        </section>

        {/* HOD Summary Cards */}
        <div className="hod-stats-row">
          <div className="hod-stat-card pending">
            <span>Action Required</span>
            <strong>{pendingCount}</strong>
          </div>
          <div className="hod-stat-card escalated">
            <span>Escalated</span>
            <strong>{escalatedCount}</strong>
          </div>
          <div className="hod-stat-card resolved">
            <span>Resolved / Closed</span>
            <strong>{resolvedCount}</strong>
          </div>
          <div className="hod-stat-card">
            <span>Rejected</span>
            <strong>{rejectedCount}</strong>
          </div>
        </div>

        {/* Status Navigation Tabs */}
        <nav className="hod-status-tabs" aria-label="Grievance filter tabs">
          <button
            className={`hod-tab-btn ${activeTab === 'ACTION_REQUIRED' ? 'active' : ''}`}
            onClick={() => setActiveTab('ACTION_REQUIRED')}
          >
            Action Required <span className="hod-tab-badge">{pendingCount}</span>
          </button>
          <button
            className={`hod-tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveTab('ALL')}
          >
            All Assigned ({grievances.length})
          </button>
          <button
            className={`hod-tab-btn ${activeTab === 'ESCALATED' ? 'active' : ''}`}
            onClick={() => setActiveTab('ESCALATED')}
          >
            Escalated ({escalatedCount})
          </button>
          <button
            className={`hod-tab-btn ${activeTab === 'RESOLVED' ? 'active' : ''}`}
            onClick={() => setActiveTab('RESOLVED')}
          >
            Resolved ({resolvedCount})
          </button>
          <button
            className={`hod-tab-btn ${activeTab === 'REJECTED' ? 'active' : ''}`}
            onClick={() => setActiveTab('REJECTED')}
          >
            Rejected ({rejectedCount})
          </button>
        </nav>

        {/* Search & Filter Component */}
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
        ) : error ? (
          <div className="dashboard-state error-state">
            <h2>Unable to load grievances</h2>
            <p>{error}</p>
            <button className="btn btn-primary" onClick={fetchDepartmentGrievances}>Try again</button>
          </div>
        ) : filteredGrievances.length === 0 ? (
          <div className="dashboard-state">
            <h2>No grievances in this category</h2>
            <p>{activeTab === 'ACTION_REQUIRED' ? 'Great job! There are no pending grievances needing HOD action right now.' : 'No grievances match the selected filter.'}</p>
          </div>
        ) : (
          <div className="grievance-card-list">
            {filteredGrievances.map((grievance) => {
              const isActionNeeded = ['UNDER_REVIEW', 'REOPENED'].includes(grievance.current_status);
              return (
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
                      className={`btn ${isActionNeeded ? 'btn-primary' : 'btn-outline'} btn-sm`}
                    >
                      {isActionNeeded ? 'Review & Update Status' : 'View Full Details'}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default DepartmentDashboard;
