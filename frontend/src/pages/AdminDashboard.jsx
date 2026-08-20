import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import StatusBadge from "../components/StatusBadge";
import SearchFilter from "../components/SearchFilter";
import { CategoryBreakdownGraph, ResolvedUnresolvedGraph, TrendLineGraph } from "../components/DashboardCharts";

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(date)) : "—";

const requestTypeLabel = (type) => {
  if (type === "ESCALATION") return "Escalation";
  return type || "Request";
};

/* Short display names for long department names */
const shortDeptName = (name = "") => {
  const map = {
    "Department of Electronics and Computer Engineering": "Electronics & Com.",
    "Department of Electrical Engineering": "Electrical",
    "Department of Mechanical and Aerospace Engineering": "Mechanical & Aero.",
    "Department of Civil Engineering": "Civil",
    "Department of Architecture": "Architecture",
    "Department of Applied Science and Chemical Engineering": "Applied & Chem.",
    "General Department": "General",
  };
  return map[name] || name;
};

const AdminIcon = ({ name }) => {
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

/* ─── CHART COMPONENTS ─── */

const DeptPerformanceGraph = ({ data = [] }) => {
  const [deptView, setDeptView] = useState("total");
  const sortedData = [...data].sort((a, b) =>
    deptView === "total" ? b.total - a.total : b.resolution_rate - a.resolution_rate
  );
  const maxVal = Math.max(...sortedData.map((d) => deptView === "total" ? d.total : d.resolution_rate), 1);
  return (
    <article className="admin-chart-card dept-chart-card">
      <div className="admin-chart-heading">
        <div>
          <h2>Department Performance</h2>
        </div>
        <div className="chart-toggle-pill" role="radiogroup" aria-label="Department view mode">
          <button type="button" className={deptView === "total" ? "active" : ""} onClick={() => setDeptView("total")}>Total Grievances</button>
          <button type="button" className={deptView === "rate" ? "active" : ""} onClick={() => setDeptView("rate")}>Resolution Rate</button>
        </div>
      </div>
      <div className="horizontal-chart-body" role="img" aria-label="Department Performance chart">
        {sortedData.length === 0 ? (
          <p className="empty-note" style={{ padding: "2rem 0", textAlign: "center" }}>No department data available.</p>
        ) : sortedData.map((dept) => {
          const rawVal = deptView === "total" ? dept.total : dept.resolution_rate;
          const percent = deptView === "rate" ? dept.resolution_rate : Math.round((rawVal / maxVal) * 100);
          return (
            <div key={dept.id || dept.name} className="chart-bar-row">
              <div className="chart-bar-label-col" title={dept.name}>{shortDeptName(dept.name)}</div>
              <div className="chart-bar-track-col">
                <div className={`chart-bar-fill ${deptView === "rate" ? "rate-fill" : ""}`} style={{ width: `${Math.max(percent, rawVal > 0 ? 3 : 0)}%` }}>
                  <span className="chart-bar-tooltip">
                    {deptView === "total" ? `${dept.name}: ${dept.total} grievances (${dept.resolved} resolved)` : `${dept.name}: ${dept.resolution_rate}% resolution rate`}
                  </span>
                </div>
              </div>
              <div className="chart-bar-val-col"><strong>{deptView === "total" ? dept.total : `${dept.resolution_rate}%`}</strong></div>
            </div>
          );
        })}
      </div>
    </article>
  );
};

/* ─── MAIN ADMIN DASHBOARD ─── */

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState("REQUESTS");
  const [metrics, setMetrics] = useState({
    total: 0, pending_requests: 0, pending_requests_breakdown: { ESCALATION: 0 }, spam_count: 0, spam_rate: 0, closed_resolved: 0,
  });
  const [analyticsData, setAnalyticsData] = useState({ department_performance: [], category_breakdown: [], trends: {}, resolved_unresolved: {} });
  const [grievances, setGrievances] = useState([]);
  const [requestsList, setRequestsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [requestGrievanceStatusFilter, setRequestGrievanceStatusFilter] = useState("");
  const [statusGroupFilter, setStatusGroupFilter] = useState("");
  const [category, setCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [ordering, setOrdering] = useState("-created_at");

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const dashRes = await api.get("dashboard/admin/");
      if (dashRes.data?.counts) {
        setMetrics(dashRes.data.counts);
        setAnalyticsData({
          department_performance: dashRes.data.counts.department_performance || [],
          category_breakdown: dashRes.data.counts.category_breakdown || [],
          trends: dashRes.data.counts.trends || {},
          resolved_unresolved: dashRes.data.counts.resolved_unresolved || {},
        });
      }
      if (activeTab === "REQUESTS") {
        const { data } = await api.get("admin/requests/", { params: { status: "PENDING", ...(search && { search }) } });
        setRequestsList(Array.isArray(data) ? data : data.results || []);
      } else {
        const { data } = await api.get("grievances/", {
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
        setGrievances(Array.isArray(data) ? data : data.results || []);
      }
    } catch {
      setError("Could not load dashboard records for Campus Administration.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, statusFilter, statusGroupFilter, category, dateFrom, dateTo, ordering]);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  const displayGrievances = activeTab === "CLOSED"
    ? grievances.filter(g => ["RESOLVED", "CLOSED"].includes(g.current_status))
    : grievances;

  const requestEffectiveDate = (req) => new Date(req.request_type === "ESCALATION" ? req.grievance_created_at : req.created_at);
  const displayRequests = requestsList
    .filter((req) => ["ESCALATION", "REOPEN"].includes(req.request_type))
    .filter((req) => !["RESOLVED", "REJECTED"].includes(req.grievance_current_status))
    .filter((req) => {
      if (requestGrievanceStatusFilter && req.grievance_current_status !== requestGrievanceStatusFilter) return false;
      const date = requestEffectiveDate(req);
      if (dateFrom && date < new Date(dateFrom)) return false;
      if (dateTo) { const end = new Date(dateTo); end.setHours(23, 59, 59, 999); if (date > end) return false; }
      return true;
    })
    .sort((a, b) => { const diff = requestEffectiveDate(a) - requestEffectiveDate(b); return ordering === "created_at" ? diff : -diff; });

  const statusCounts = metrics.status_breakdown || {};
  const underReviewGrievances = statusCounts.UNDER_REVIEW || 0;
  const inProgressGrievances = statusCounts.IN_PROGRESS || 0;

  const workspaceRef = useRef(null);

  const scrollToWorkspace = () => {
    setTimeout(() => {
      if (workspaceRef.current) {
        workspaceRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
  };

  const showAllGrievances = () => { setStatusFilter(""); setStatusGroupFilter(""); setActiveTab("ALL"); scrollToWorkspace(); };
  const showSubmittedGrievances = () => { setStatusFilter("SUBMITTED"); setStatusGroupFilter(""); setActiveTab("ALL"); scrollToWorkspace(); };
  const showInProgressGrievances = () => { setStatusFilter("IN_PROGRESS"); setStatusGroupFilter(""); setActiveTab("ALL"); scrollToWorkspace(); };
  const showUnderReviewGrievances = () => { setStatusFilter("UNDER_REVIEW"); setStatusGroupFilter(""); setActiveTab("ALL"); scrollToWorkspace(); };
  const showEscalatedGrievances = () => { setStatusFilter("ESCALATED"); setStatusGroupFilter(""); setActiveTab("ALL"); scrollToWorkspace(); };
  const showRejectedGrievances = () => { setStatusFilter("REJECTED"); setStatusGroupFilter(""); setActiveTab("ALL"); scrollToWorkspace(); };
  const showReopenedGrievances = () => { setStatusFilter("REOPENED"); setStatusGroupFilter(""); setActiveTab("ALL"); scrollToWorkspace(); };
  const showResolvedGrievances = () => { setStatusFilter(""); setStatusGroupFilter("RESOLVED"); setActiveTab("CLOSED"); scrollToWorkspace(); };
  const showRequests = () => { setStatusFilter(""); setStatusGroupFilter(""); setActiveTab("REQUESTS"); scrollToWorkspace(); };

  const kpis = [
    { label: "Total", value: metrics.total || 0, icon: "total", tone: "primary", onClick: showAllGrievances },
    { label: "Submitted", value: statusCounts.SUBMITTED || 0, icon: "pending", tone: "primary", onClick: showSubmittedGrievances },
    { label: "Under Review", value: underReviewGrievances, icon: "underReview", tone: "primary", onClick: showUnderReviewGrievances },
    { label: "In Progress", value: inProgressGrievances, icon: "pending", tone: "primary", onClick: showInProgressGrievances },
    { label: "Escalated", value: metrics.escalated || 0, icon: "escalated", tone: "warning", onClick: showEscalatedGrievances },
    { label: "Reopened", value: statusCounts.REOPENED || 0, icon: "pending", tone: "primary", onClick: showReopenedGrievances },
    { label: "Rejected", value: statusCounts.REJECTED || 0, icon: "rejected", tone: "danger", onClick: showRejectedGrievances },
    { label: "Resolved", value: metrics.closed_resolved || 0, icon: "resolved", tone: "success", onClick: showResolvedGrievances },
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

        {toast && <div className="workflow-toast success" role="status">{toast}<button aria-label="Dismiss message" onClick={() => setToast("")}>×</button></div>}
        {error && <div className="workflow-toast error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError("")}>×</button></div>}

        <section className="admin-kpi-grid" aria-label="Grievance summary">
          {kpis.map((kpi) => (
            <button key={kpi.label} className={`admin-kpi-card ${kpi.tone}`} onClick={kpi.onClick}>
              <span className="admin-kpi-icon-wrap"><AdminIcon name={kpi.icon} /></span>
              <span className="admin-kpi-copy"><span>{kpi.label}</span><strong>{kpi.value}</strong></span>
            </button>
          ))}
        </section>

        <section className="admin-charts-section" aria-label="Analytics charts">
          <div className="admin-charts-top-row">
            <DeptPerformanceGraph data={analyticsData.department_performance} />
            <CategoryBreakdownGraph data={analyticsData.category_breakdown} />
          </div>
          <div className="admin-charts-bottom-row analytics-split">
            <ResolvedUnresolvedGraph data={analyticsData.resolved_unresolved} />
            <TrendLineGraph trends={analyticsData.trends} title="Campus Grievance Trend" />
          </div>
        </section>

        <div className="admin-workspace-label" ref={workspaceRef}>
          <div><h2>{activeTab === "REQUESTS" ? "Action Required" : activeTab === "CLOSED" ? "Resolved Grievances" : "All Grievances"}</h2></div>
        </div>

        <nav className="hod-status-tabs" aria-label="Admin navigation tabs">
          <button className={`hod-tab-btn ${activeTab === "REQUESTS" ? "active" : ""}`} onClick={showRequests}>
            Action Required <span className="hod-tab-badge">{displayRequests.length}</span>
          </button>
          <button className={`hod-tab-btn ${activeTab === "ALL" ? "active" : ""}`} onClick={showAllGrievances}>
            All Grievances ({metrics.total || 0})
          </button>
          <button className={`hod-tab-btn ${activeTab === "CLOSED" ? "active" : ""}`} onClick={showResolvedGrievances}>
            Resolved ({metrics.closed_resolved || 0})
          </button>
        </nav>

        {activeTab === "REQUESTS" && (
          <SearchFilter
            value={search} onSearchChange={setSearch}
            statuses={["SUBMITTED", "UNDER_REVIEW", "IN_PROGRESS", "REOPENED", "ESCALATED", "CLOSED"]}
            status={requestGrievanceStatusFilter} onStatusChange={setRequestGrievanceStatusFilter}
            dateFrom={dateFrom} onDateFromChange={setDateFrom}
            dateTo={dateTo} onDateToChange={setDateTo}
            ordering={ordering} onOrderingChange={setOrdering}
            showCategory={false}
          />
        )}

        {activeTab === "ALL" && (
          <SearchFilter
            value={search} onSearchChange={setSearch}
            status={statusFilter} onStatusChange={(value) => { setStatusGroupFilter(""); setStatusFilter(value); }}
            category={category} onCategoryChange={setCategory}
            dateFrom={dateFrom} onDateFromChange={setDateFrom}
            dateTo={dateTo} onDateToChange={setDateTo}
            ordering={ordering} onOrderingChange={setOrdering}
          />
        )}

        {activeTab === "CLOSED" && (
          <SearchFilter
            value={search} onSearchChange={setSearch}
            category={category} onCategoryChange={setCategory}
            dateFrom={dateFrom} onDateFromChange={setDateFrom}
            dateTo={dateTo} onDateToChange={setDateTo}
            ordering={ordering} onOrderingChange={setOrdering}
            showStatus={false}
          />
        )}

        {loading ? (
          <div className="dashboard-state">
            <div className="spinner" />
            <p>Loading administration portal data…</p>
          </div>
        ) : activeTab === "REQUESTS" ? (
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
                      <span className="hod-card-id">GMS-{String(reqItem.grievance).padStart(4, "0")}</span>
                      <h3 className="hod-card-title">{reqItem.grievance_title}</h3>
                    </div>
                    <StatusBadge status={reqItem.grievance_current_status} />
                  </div>
                  <div className="hod-card-meta">
                    <span>Request Type: <strong>{requestTypeLabel(reqItem.request_type)}</strong></span>
                    <span>Submitted By: <strong>{reqItem.student_name}</strong></span>
                    <span>Submitted: <strong>{formatDate(reqItem.request_type === "ESCALATION" ? reqItem.grievance_created_at : reqItem.created_at)}</strong></span>
                  </div>
                  <div className="hod-card-actions">
                    <Link to={`/grievances/${reqItem.grievance}`} className="btn btn-primary btn-sm">
                      View Details &amp; Review
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : (
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
                      <span className="hod-card-id">GMS-{String(grievance.id).padStart(4, "0")}</span>
                      <h3 className="hod-card-title">{grievance.title}</h3>
                    </div>
                    <StatusBadge status={grievance.current_status} />
                  </div>
                  <div className="hod-card-meta">
                    <span>Department: <strong>{grievance.department_name || "Unassigned"}</strong></span>
                    <span>Category: <strong>{grievance.category_name || "Uncategorized"}</strong></span>
                    <span>Submitted: <strong>{formatDate(grievance.created_at)}</strong></span>
                    <span>Submitter: <strong>{grievance.is_anonymous ? "Anonymous" : grievance.submitter_name || "User"}</strong></span>
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
