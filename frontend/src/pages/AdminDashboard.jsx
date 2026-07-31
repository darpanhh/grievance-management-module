import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import GrievanceCard from '../components/GrievanceCard';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/';

const downloadCsv = async () => {
  // Note: the export view always returns CSV. Passing ?format=csv triggers
  // DRF's format-suffix handling, which has no CSV renderer configured and
  // returns 404 — so call the endpoint without it.
  const res = await fetch(`${API_BASE_URL}reports/export/`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('access_token') || ''}` },
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match ? match[1] : `grievances_export_${Date.now()}.csv`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—';

const ROLE_LABELS = {
  STUDENT: 'Student', STAFF: 'Staff', HOD: 'Head of Department',
  CAMPUS_ADMIN: 'Campus Admin', SYSTEM_ADMIN: 'System Admin',
};

// Roles a System Admin may assign (cannot create another System Admin).
const ASSIGNABLE_ROLES = ['STUDENT', 'STAFF', 'HOD', 'CAMPUS_ADMIN'];

const tableStyle = {
  width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem', marginTop: '0.5rem',
};

const thStyle = {
  textAlign: 'left', padding: '0.5rem 0.6rem', borderBottom: '2px solid rgba(0,0,0,0.08)',
  fontWeight: 600, whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '0.5rem 0.6rem', borderBottom: '1px solid rgba(0,0,0,0.05)',
};

const AdminDashboard = () => {
  const [report, setReport] = useState(null);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Role management state
  const [edits, setEdits] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState('');

  // Export state
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true); setNotice('');
    try {
      await downloadCsv();
      setNotice('Export downloaded.');
    } catch {
      setNotice('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [reportRes, usersRes, deptsRes] = await Promise.all([
        api.get('dashboard/admin/'),
        api.get('auth/users/'),
        api.get('departments/'),
      ]);
      setReport(reportRes.data);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : usersRes.data.results || []);
      setDepartments(Array.isArray(deptsRes.data) ? deptsRes.data : deptsRes.data.results || []);
    } catch {
      setError('We could not load system data. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => report?.counts || {}, [report]);
  const statusBreakdown = useMemo(() => counts.status_breakdown || {}, [counts]);
  const departmentsReport = useMemo(() => report?.departments || [], [report]);
  const recent = useMemo(() => report?.recent || [], [report]);

  const openCount = useMemo(() => {
    const openStatuses = ['SUBMITTED', 'UNDER_REVIEW', 'RESPONDED', 'REOPENED', 'ESCALATED'];
    return openStatuses.reduce((sum, s) => sum + (statusBreakdown[s] || 0), 0);
  }, [statusBreakdown]);

  const resolvedCount = (statusBreakdown.RESOLVED || 0) + (statusBreakdown.CLOSED || 0);

  const setEdit = (id, key, value) => {
    setEdits((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
    setNotice('');
  };

  const applyRole = async (user) => {
    const edit = edits[user.id];
    if (!edit?.role) return;
    // Fall back to the user's existing department if the dropdown was left untouched
    const dept = edit.department ?? user.department ?? null;
    if (edit.role === 'HOD' && !dept) {
      setNotice('An HOD must be assigned a department.');
      return;
    }
    setBusyId(user.id);
    setNotice('');
    try {
      const payload = { role: edit.role };
      if (dept) payload.department = Number(dept);
      await api.patch(`auth/users/${user.id}/role/`, payload);
      setNotice(`Role updated for ${user.username}.`);
      await load();
    } catch (err) {
      const msg = err.response?.data?.error
        || err.response?.data?.department?.[0]
        || err.response?.data?.role?.[0]
        || 'Could not update role.';
      setNotice(msg);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <section className="dashboard-page"><div className="dashboard-container"><div className="dashboard-state"><div className="spinner" /><p>Loading system data…</p></div></div></section>;
  }

  if (error) {
    return <section className="dashboard-page"><div className="dashboard-container"><div className="dashboard-state error-state"><h2>Unable to load system data</h2><p>{error}</p><button className="btn btn-primary" onClick={load}>Try again</button></div></div></section>;
  }

  return <section className="dashboard-page"><div className="dashboard-container"><header className="dashboard-heading"><div><span>System administration</span><h1>System overview</h1><p>Monitor grievance activity, per-department health, and manage roles. Read-only — grievances are handled by departments.</p></div><button className="btn btn-outline" onClick={handleExport} disabled={exporting}>{exporting ? 'Exporting…' : 'Export CSV'}</button></header>

    {/* System totals */}
    <div className="summary-grid admin-summary-grid"><div><span>Total grievances</span><strong>{counts.total || 0}</strong></div><div><span>Open</span><strong>{openCount}</strong></div><div><span>Under review</span><strong>{statusBreakdown.UNDER_REVIEW || 0}</strong></div><div><span>Resolved / closed</span><strong>{resolvedCount}</strong></div><div className="stat-escalated"><span>Escalated</span><strong>{statusBreakdown.ESCALATED || 0}</strong></div><div className="stat-spam"><span>Spam flagged</span><strong>{statusBreakdown.SPAM || 0}</strong></div></div>

    {/* Per-department health */}
    <section className="recent-grievances"><div className="section-title-row"><div><h2>Department health</h2><p>Per-department volumes and the oldest open grievance — is the system working properly?</p></div></div>
      {departmentsReport.length ? <table style={tableStyle}><thead><tr><th style={thStyle}>Department</th><th style={thStyle}>Total</th><th style={thStyle}>Open</th><th style={thStyle}>Resolved / closed</th><th style={thStyle}>Escalated</th><th style={thStyle}>Spam</th><th style={thStyle}>Oldest open</th></tr></thead><tbody>
        {departmentsReport.map((d) => {
          const open = ['SUBMITTED', 'UNDER_REVIEW', 'RESPONDED', 'REOPENED', 'ESCALATED'].reduce((s, k) => s + (d.status_breakdown[k] || 0), 0);
          const resolved = (d.status_breakdown.RESOLVED || 0) + (d.status_breakdown.CLOSED || 0);
          return <tr key={d.id}><td style={tdStyle}><strong>{d.name}</strong></td><td style={tdStyle}>{d.total}</td><td style={tdStyle}>{open}</td><td style={tdStyle}>{resolved}</td><td style={tdStyle}>{d.escalated}</td><td style={tdStyle}>{d.spam}</td><td style={tdStyle}>{formatDate(d.oldest_open)}</td></tr>;
        })}
      </tbody></table> : <p className="empty-note">No departments have grievances yet.</p>}
    </section>

    {/* Role management */}
    <section className="recent-grievances"><div className="section-title-row"><div><h2>Role management</h2><p>Assign or change HOD and Campus Admin roles. System Admin accounts are created only by a superuser.</p></div></div>
      {notice && <div className="form-alert" role="status">{notice}</div>}
      {users.length ? <table style={tableStyle}><thead><tr><th style={thStyle}>User</th><th style={thStyle}>Current role</th><th style={thStyle}>Department</th><th style={thStyle}>New role</th><th style={thStyle}>Department (if HOD)</th><th style={thStyle}></th></tr></thead><tbody>
        {users.map((user) => {
          const edit = edits[user.id] || {};
          const needsDept = edit.role === 'HOD' || (!edit.role && user.role === 'HOD');
          return <tr key={user.id}><td style={tdStyle}><strong>{user.username}</strong><small style={{ display: 'block', opacity: 0.65 }}>{user.email}</small></td><td style={tdStyle}>{ROLE_LABELS[user.role] || user.role}</td><td style={tdStyle}>{user.department_name || '—'}</td><td style={tdStyle}><select style={{ padding: '0.3rem' }} value={edit.role || ''} onChange={(e) => setEdit(user.id, 'role', e.target.value)} aria-label={`New role for ${user.username}`}><option value="">—</option>{ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></td><td style={tdStyle}>{needsDept ? <select style={{ padding: '0.3rem' }} value={edit.department || user.department || ''} onChange={(e) => setEdit(user.id, 'department', e.target.value)} aria-label={`Department for ${user.username}`}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select> : <span style={{ opacity: 0.5 }}>—</span>}</td><td style={tdStyle}><button className="btn btn-primary" disabled={busyId === user.id || !edit.role} onClick={() => applyRole(user)}>{busyId === user.id ? 'Saving…' : 'Assign'}</button></td></tr>;
        })}
      </tbody></table> : <p className="empty-note">No users found.</p>}
    </section>

    {/* Recent grievances (read-only links) */}
    <section className="recent-grievances"><div className="section-title-row"><div><h2>Recent grievances</h2><p>The 10 most recently updated grievances across all departments, including spam.</p></div></div>{recent.length ? <div className="grievance-card-list">{recent.map((item) => <GrievanceCard key={item.id} grievance={item} />)}</div> : <p className="empty-note">No grievances yet.</p>}</section>
  </div></section>;
};

export default AdminDashboard;
