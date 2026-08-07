import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import SearchFilter from '../components/SearchFilter';
import AdminRequestDetailModal from '../components/AdminRequestDetailModal';

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
    escalated: <><path d="M4 17 10 11l4 4 6-7" /><path d="M15 8h5v5" /></>,
    spam: <><path d="M12 3 4 6v5c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-3Z" /><path d="m9 9 6 6M15 9l-6 6" /></>,
    appeal: <><path d="M20 11a8 8 0 1 1-2.3-5.7" /><path d="M20 4v6h-6" /></>,
    resolved: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.3 2.3 4.8-5" /></>,
  };
  return <svg className="admin-kpi-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
};

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('REQUESTS'); // 'REQUESTS' | 'SPAM' | 'ALL' | 'CLOSED'
  const [requestTypeFilter, setRequestTypeFilter] = useState('ALL'); // 'ALL' | 'REOPEN' | 'REJECTION_APPEAL' | 'SPAM_APPEAL' | 'ESCALATION'
  const [requestStatusFilter, setRequestStatusFilter] = useState('PENDING'); // 'PENDING' | 'CLOSED'
  
  const [metrics, setMetrics] = useState({
    total: 0,
    pending_requests: 0,
    pending_requests_breakdown: { REOPEN: 0, REJECTION_APPEAL: 0, SPAM_APPEAL: 0, ESCALATION: 0 },
    spam_review: 0,
    closed_resolved: 0,
  });

  const [grievances, setGrievances] = useState([]);
  const [requestsList, setRequestsList] = useState([]);
  const [spamGrievances, setSpamGrievances] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Selected Request for Detail Modal
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [actionId, setActionId] = useState(null);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [statusGroupFilter, setStatusGroupFilter] = useState('');
  const [category, setCategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [ordering, setOrdering] = useState('-created_at');

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch Dashboard Overview Metrics & Department List
      const [dashRes, deptRes] = await Promise.all([
        api.get('dashboard/admin/'),
        api.get('departments/'),
      ]);

      if (dashRes.data?.counts) {
        setMetrics(dashRes.data.counts);
      }
      setDepartments(deptRes.data || []);

      if (activeTab === 'REQUESTS') {
        const params = {
          ...(requestTypeFilter !== 'ALL' && { request_type: requestTypeFilter }),
          ...(search && { search }),
        };
        if (requestStatusFilter === 'PENDING') {
          // Active view — only requests awaiting Campus Admin review
          const { data } = await api.get('admin/requests/', {
            params: { ...params, status: 'PENDING' },
          });
          setRequestsList(Array.isArray(data) ? data : data.results || []);
        } else {
          // Closed / Resolved view — forwarded + rejected requests only
          const [forwardedRes, rejectedRes] = await Promise.all([
            api.get('admin/requests/', { params: { ...params, status: 'FORWARDED' } }),
            api.get('admin/requests/', { params: { ...params, status: 'REJECTED' } }),
          ]);
          const merged = [
            ...(Array.isArray(forwardedRes.data) ? forwardedRes.data : forwardedRes.data.results || []),
            ...(Array.isArray(rejectedRes.data) ? rejectedRes.data : rejectedRes.data.results || []),
          ];
          merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          setRequestsList(merged);
        }
      } else if (activeTab === 'SPAM') {
        const { data } = await api.get('admin/spam-queue/');
        setSpamGrievances(Array.isArray(data) ? data : data.results || []);
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
  }, [activeTab, requestTypeFilter, requestStatusFilter, search, statusFilter, statusGroupFilter, category, dateFrom, dateTo, ordering]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Restore grievance from Spam Review Page
  const handleRestoreSpam = async (id) => {
    setActionId(id);
    setToast('');
    setError('');
    try {
      await api.post(`admin/spam-queue/${id}/reinstate/`);
      setToast(`Grievance GMS-${String(id).padStart(4, '0')} restored from Spam and routed to department.`);
      await fetchDashboardData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to restore grievance from spam.');
    } finally {
      setActionId(null);
    }
  };

  // Confirm Spam action from Spam Review Page
  const handleConfirmSpam = async (id) => {
    setActionId(id);
    setToast('');
    setError('');
    try {
      await api.post(`grievances/${id}/close/`);
      setToast(`Spam classification confirmed for GMS-${String(id).padStart(4, '0')}. Grievance closed.`);
      await fetchDashboardData();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || 'Failed to confirm spam.');
    } finally {
      setActionId(null);
    }
  };

  // Filtered list for CLOSED tab if needed
  const displayGrievances = activeTab === 'CLOSED'
    ? grievances.filter(g => ['RESOLVED', 'CLOSED'].includes(g.current_status))
    : grievances;

  const statusCounts = metrics.status_breakdown || {};
  const pendingGrievances = (statusCounts.SUBMITTED || 0) + (statusCounts.APPEAL_PENDING || 0);
  const inProgressGrievances = statusCounts.UNDER_REVIEW || 0;
  const openAppeals = (metrics.pending_requests_breakdown?.REJECTION_APPEAL || 0) + (metrics.pending_requests_breakdown?.SPAM_APPEAL || 0) + (metrics.pending_requests_breakdown?.REOPEN || 0);
  const showAllGrievances = () => {
    setStatusFilter('');
    setStatusGroupFilter('');
    setActiveTab('ALL');
  };
  const showPendingGrievances = () => {
    setStatusFilter('');
    setStatusGroupFilter('PENDING');
    setActiveTab('ALL');
  };
  const showInProgressGrievances = () => {
    setStatusFilter('');
    setStatusGroupFilter('IN_PROGRESS');
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
  const showResolvedGrievances = () => {
    setStatusFilter('');
    setStatusGroupFilter('RESOLVED');
    setActiveTab('ALL');
  };
  const showSpamReview = () => {
    setStatusFilter('');
    setStatusGroupFilter('');
    setActiveTab('SPAM');
  };
  const showRequests = () => {
    setStatusFilter('');
    setStatusGroupFilter('');
    setActiveTab('REQUESTS');
  };
  const primaryStatusDistribution = [
    { label: 'Pending', value: pendingGrievances, color: '#f59e0b', onClick: showPendingGrievances },
    { label: 'In progress', value: inProgressGrievances, color: '#6366f1', onClick: showInProgressGrievances },
    { label: 'Escalated', value: metrics.escalated || 0, color: '#f97316', onClick: showEscalatedGrievances },
    { label: 'Resolved', value: metrics.closed_resolved || 0, color: '#10b981', onClick: showResolvedGrievances },
    { label: 'Spam', value: metrics.spam_review || 0, color: '#ef4444', onClick: showSpamReview },
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
    { label: 'In Progress', value: inProgressGrievances, icon: 'pending', tone: 'primary', onClick: showInProgressGrievances },
    { label: 'Escalated Cases', value: metrics.escalated || 0, icon: 'escalated', tone: 'orange', onClick: showEscalatedGrievances },
    { label: 'Spam Reviews', value: metrics.spam_review || 0, icon: 'spam', tone: 'danger', onClick: showSpamReview },
    { label: 'Open Appeals', value: openAppeals, icon: 'appeal', tone: 'violet', onClick: showRequests },
    { label: 'Resolved Grievances', value: metrics.closed_resolved || 0, icon: 'resolved', tone: 'success', onClick: showResolvedGrievances },
  ];

  return (
    <section className="dashboard-page admin-dashboard-page">
      <div className="dashboard-container">
        <header className="dashboard-heading">
          <div>
            <span>System Administration</span>
            <h1>Grievance Overview</h1>
            <p>Monitor campus-wide grievance activity and focus on the work that needs attention.</p>
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
            <div className="admin-chart-heading"><div><span>LIVE DISTRIBUTION</span><h2>Grievances by Status</h2></div><small>Current workload</small></div>
            <div className="admin-status-chart-body">
              <div className="admin-donut" style={{ background: statusGradient }} role="img" aria-label={`${metrics.total || 0} total grievances`}><div><strong>{metrics.total || 0}</strong><span>Total</span></div></div>
              <div className="admin-chart-legend">{statusDistribution.length ? statusDistribution.map((item) => <button type="button" key={item.label} onClick={item.onClick}><i style={{ background: item.color }} /><span>{item.label}</span><strong>{item.value}</strong></button>) : <p>No grievance data yet.</p>}</div>
            </div>
          </article>
          <article className="admin-chart-card trend-chart-card">
            <div className="admin-chart-heading"><div><span>LAST SIX MONTHS</span><h2>Monthly Grievance Trend</h2></div><small>New submissions</small></div>
            <div className="admin-bar-chart" role="img" aria-label="Monthly grievance trend">{monthlyTrend.map((item) => <div className="admin-bar-column" key={item.month}><span className="admin-bar-value">{item.count}</span><div className="admin-bar-track"><i style={{ height: `${Math.max(item.count ? 12 : 0, (item.count / trendMax) * 100)}%` }} /></div><span className="admin-bar-label">{item.month}</span></div>)}</div>
          </article>
        </section>

        <div className="admin-workspace-label">
          <div><span>WORKSPACE</span><h2>{activeTab === 'REQUESTS' ? 'Requests & Appeals' : activeTab === 'SPAM' ? 'Spam Review Queue' : activeTab === 'CLOSED' ? 'Resolved Grievances' : 'All Grievances'}</h2></div>
          <p>Use the tabs and filters to review records.</p>
        </div>

        {/* Primary Admin Navigation Tabs */}
        <nav className="hod-status-tabs" aria-label="Admin navigation tabs">
          <button
            className={`hod-tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
            onClick={showAllGrievances}
          >
            All Grievances ({metrics.total || 0})
          </button>
          <button
            className={`hod-tab-btn ${activeTab === 'REQUESTS' ? 'active' : ''}`}
            onClick={showRequests}
          >
            Requests <span className="hod-tab-badge">{metrics.pending_requests || 0}</span>
          </button>
          <button
            className={`hod-tab-btn ${activeTab === 'SPAM' ? 'active' : ''}`}
            onClick={showSpamReview}
          >
            Spam Review <span className="hod-tab-badge">{metrics.spam_review || 0}</span>
          </button>
          <button
            className={`hod-tab-btn ${activeTab === 'CLOSED' ? 'active' : ''}`}
            onClick={showResolvedGrievances}
          >
            Closed ({metrics.closed_resolved || 0})
          </button>
        </nav>

        {/* Sub-filtering for Requests Page */}
        {activeTab === 'REQUESTS' && (
          <>
            <div className="request-subfilter-bar">
              <span>Request Status:</span>
              <button
                className={`filter-btn ${requestStatusFilter === 'PENDING' ? 'active' : ''}`}
                onClick={() => setRequestStatusFilter('PENDING')}
              >
                Active / Pending ({metrics.pending_requests || 0})
              </button>
              <button
                className={`filter-btn ${requestStatusFilter === 'CLOSED' ? 'active' : ''}`}
                onClick={() => setRequestStatusFilter('CLOSED')}
              >
                Closed / Resolved
              </button>
            </div>
            <div className="request-subfilter-bar">
              <span>Filter by Type:</span>
              <button
                className={`filter-btn ${requestTypeFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setRequestTypeFilter('ALL')}
              >
                All Requests
              </button>
              {(metrics.pending_requests_breakdown?.ESCALATION || 0) > 0 && (
                <button
                  className={`filter-btn ${requestTypeFilter === 'ESCALATION' ? 'active' : ''}`}
                  onClick={() => setRequestTypeFilter('ESCALATION')}
                >
                  Escalations ({metrics.pending_requests_breakdown?.ESCALATION || 0})
                </button>
              )}
              {(metrics.pending_requests_breakdown?.REJECTION_APPEAL || 0) > 0 && (
                <button
                  className={`filter-btn ${requestTypeFilter === 'REJECTION_APPEAL' ? 'active' : ''}`}
                  onClick={() => setRequestTypeFilter('REJECTION_APPEAL')}
                >
                  Rejection Appeals ({metrics.pending_requests_breakdown?.REJECTION_APPEAL || 0})
                </button>
              )}
              {(metrics.pending_requests_breakdown?.SPAM_APPEAL || 0) > 0 && (
                <button
                  className={`filter-btn ${requestTypeFilter === 'SPAM_APPEAL' ? 'active' : ''}`}
                  onClick={() => setRequestTypeFilter('SPAM_APPEAL')}
                >
                  Spam Appeals ({metrics.pending_requests_breakdown?.SPAM_APPEAL || 0})
                </button>
              )}
              {(metrics.pending_requests_breakdown?.REOPEN || 0) > 0 && (
                <button
                  className={`filter-btn ${requestTypeFilter === 'REOPEN' ? 'active' : ''}`}
                  onClick={() => setRequestTypeFilter('REOPEN')}
                >
                  Reopen Requests ({metrics.pending_requests_breakdown?.REOPEN || 0})
                </button>
              )}
            </div>
          </>
        )}

        {/* Search & Filter for All / Closed Grievances */}
        {(activeTab === 'ALL' || activeTab === 'CLOSED') && (
          <SearchFilter
            value={search} onSearchChange={setSearch}
            status={statusFilter} onStatusChange={(value) => { setStatusGroupFilter(''); setStatusFilter(value); }}
            category={category} onCategoryChange={setCategory}
            dateFrom={dateFrom} onDateFromChange={setDateFrom}
            dateTo={dateTo} onDateToChange={setDateTo}
            ordering={ordering} onOrderingChange={setOrdering}
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
          requestsList.length === 0 ? (
            requestStatusFilter === 'CLOSED' ? (
              <div className="dashboard-state">
                <h2>No Closed or Resolved Requests</h2>
                <p>Forwarded and rejected requests will appear here once processed.</p>
              </div>
            ) : (
              <div className="dashboard-state">
                <h2>No Pending Requests</h2>
                <p>There are no active student appeals or reopening requests matching the selected filter.</p>
              </div>
            )
          ) : (
            <div className="grievance-card-list">
              {requestsList.map((reqItem) => (
                <article key={reqItem.id} className="hod-grievance-card request-card">
                  <div className="hod-card-top">
                    <div>
                      <span className="req-type-tag">{requestTypeLabel(reqItem.request_type)}</span>
                      <h3 className="hod-card-title">
                        GMS-{String(reqItem.grievance).padStart(4, '0')}: {reqItem.grievance_title}
                      </h3>
                    </div>
                    <span className={`status-badge req-status-${reqItem.status.toLowerCase()}`}>{reqItem.status}</span>
                  </div>

                  <div className="request-card-reason">
                    <strong>Student Reason:</strong>
                    <p>"{reqItem.reason}"</p>
                  </div>

                  <div className="hod-card-meta">
                    <span>Submitted By: <strong>{reqItem.student_name}</strong></span>
                    <span>Date: <strong>{formatDate(reqItem.request_type === 'ESCALATION' ? reqItem.grievance_created_at : reqItem.created_at)}</strong></span>
                    {reqItem.forwarded_department_name && (
                      <span>Forwarded To: <strong>{reqItem.forwarded_department_name}</strong></span>
                    )}
                    {requestStatusFilter === 'CLOSED' && reqItem.reviewed_by_admin_name && (
                      <span>Reviewed By: <strong>{reqItem.reviewed_by_admin_name}</strong></span>
                    )}
                  </div>

                  <div className="hod-card-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setSelectedRequest(reqItem)}
                    >
                      {requestStatusFilter === 'CLOSED' ? 'View Decision Record' : 'View Details & Review'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : activeTab === 'SPAM' ? (
          /* Separate Spam Review View */
          spamGrievances.length === 0 ? (
            <div className="dashboard-state">
              <h2>Spam Queue is Clean</h2>
              <p>No grievances are currently classified as Spam awaiting review.</p>
            </div>
          ) : (
            <div className="grievance-card-list">
              {spamGrievances.map((grievance) => {
                const ai = grievance.ai_analysis;
                return (
                  <article key={grievance.id} className="hod-grievance-card spam-card">
                    <div className="hod-card-top">
                      <div>
                        <span className="hod-card-id">GMS-{String(grievance.id).padStart(4, '0')}</span>
                        <h3 className="hod-card-title">{grievance.title}</h3>
                      </div>
                      <span className="status-badge spam-badge">AI SPAM DETECTED</span>
                    </div>

                    {ai && (
                      <div className="spam-details-snippet">
                        <span>Confidence Score: <strong>{(ai.confidence_score * 100).toFixed(1)}%</strong></span>
                        <span>Flag Source: <strong>AI Spam Detector</strong></span>
                        <p><strong>Reason:</strong> {ai.classification_reason || 'Automated text filtering rules.'}</p>
                      </div>
                    )}

                    <div className="hod-card-meta">
                      <span>Submitted: <strong>{formatDate(grievance.created_at)}</strong></span>
                      <span>Submitter: <strong>{grievance.is_anonymous ? 'Anonymous' : grievance.submitter_name || 'User'}</strong></span>
                    </div>

                    <div className="hod-card-actions">
                      <Link to={`/grievances/${grievance.id}`} className="btn btn-outline btn-sm">
                        View Details
                      </Link>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleRestoreSpam(grievance.id)}
                        disabled={actionId === grievance.id}
                      >
                        {actionId === grievance.id ? 'Restoring…' : 'Restore Grievance'}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleConfirmSpam(grievance.id)}
                        disabled={actionId === grievance.id}
                      >
                        Confirm Spam
                      </button>
                    </div>
                  </article>
                );
              })}
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

        {/* Modal for Admin Request Review */}
        {selectedRequest && (
          <AdminRequestDetailModal
            requestItem={selectedRequest}
            departments={departments}
            onClose={() => setSelectedRequest(null)}
            onSuccess={(msg) => {
              setToast(msg);
              fetchDashboardData();
            }}
          />
        )}
      </div>
    </section>
  );
};

export default AdminDashboard;
