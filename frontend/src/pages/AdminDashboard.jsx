import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import GrievanceCard from '../components/GrievanceCard';

const AdminDashboard = () => {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadGrievances = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('grievances/'); setGrievances(Array.isArray(data) ? data : data.results || []); }
    catch { setError('We could not load system grievances. Check your connection and try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadGrievances(); }, [loadGrievances]);
  const stats = useMemo(() => ({ total: grievances.length, submitted: grievances.filter((item) => item.current_status === 'SUBMITTED').length, review: grievances.filter((item) => item.current_status === 'UNDER_REVIEW').length, resolved: grievances.filter((item) => ['RESOLVED', 'CLOSED'].includes(item.current_status)).length, spam: grievances.filter((item) => item.current_status === 'SPAM').length, escalated: grievances.filter((item) => item.current_status === 'ESCALATED').length }), [grievances]);
  const recent = grievances.slice(0, 10);

  return <section className="dashboard-page"><div className="dashboard-container"><header className="dashboard-heading"><div><span>Campus administration</span><h1>System overview</h1><p>Monitor grievance activity across all departments.</p></div></header>
    {loading ? <div className="dashboard-state"><div className="spinner" /><p>Loading system data…</p></div> : error ? <div className="dashboard-state error-state"><h2>Unable to load system data</h2><p>{error}</p><button className="btn btn-primary" onClick={loadGrievances}>Try again</button></div> : <><div className="summary-grid admin-summary-grid"><div><span>Total grievances</span><strong>{stats.total}</strong></div><div><span>Submitted</span><strong>{stats.submitted}</strong></div><div><span>Under review</span><strong>{stats.review}</strong></div><div><span>Resolved / closed</span><strong>{stats.resolved}</strong></div><div className="stat-spam"><span>Spam flagged</span><strong>{stats.spam}</strong></div><div className="stat-escalated"><span>Escalated</span><strong>{stats.escalated}</strong></div></div><section className="admin-quick-actions"><h2>Quick actions</h2><div><button className="btn btn-outline" disabled>Manage categories (coming soon)</button><button className="btn btn-outline" disabled>Review spam queue (coming soon)</button></div></section><section className="recent-grievances"><div className="section-title-row"><div><h2>Recent grievances</h2><p>The 10 most recently submitted grievances.</p></div></div>{recent.length ? <div className="grievance-card-list">{recent.map((item) => <GrievanceCard key={item.id} grievance={item} />)}</div> : <div className="dashboard-state"><h2>No grievances yet</h2><p>System-wide grievance activity will appear here.</p></div>}</section></>}
  </div></section>;
};

export default AdminDashboard;
