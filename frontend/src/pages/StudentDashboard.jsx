import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import GrievanceCard from '../components/GrievanceCard';
import SearchFilter from '../components/SearchFilter';

const StudentDashboard = () => {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');

  const loadGrievances = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('grievances/'); setGrievances(Array.isArray(data) ? data : data.results || []); }
    catch { setError('We could not load your grievances. Check your connection and try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadGrievances(); }, [loadGrievances]);

  const filtered = useMemo(() => grievances.filter((item) => {
    const searchable = `${item.title} ${item.department_name || ''} ${item.category_name || ''}`.toLowerCase();
    return (!search || searchable.includes(search.toLowerCase())) && (!status || item.current_status === status) && (!category || String(item.category) === category);
  }), [grievances, search, status, category]);
  const counts = useMemo(() => ({ total: grievances.length, submitted: grievances.filter((item) => item.current_status === 'SUBMITTED').length, active: grievances.filter((item) => ['UNDER_REVIEW', 'RESPONDED', 'REOPENED', 'ESCALATED'].includes(item.current_status)).length, resolved: grievances.filter((item) => ['RESOLVED', 'CLOSED'].includes(item.current_status)).length }), [grievances]);

  return <section className="dashboard-page"><div className="dashboard-container"><header className="dashboard-heading"><div><span>Student portal</span><h1>My grievances</h1><p>Follow the progress of every grievance you have submitted.</p></div><Link className="btn btn-primary" to="/grievances/new">Submit grievance</Link></header>
    {loading ? <div className="dashboard-state"><div className="spinner" /><p>Loading your grievances…</p></div> : error ? <div className="dashboard-state error-state"><h2>Unable to load grievances</h2><p>{error}</p><button className="btn btn-primary" onClick={loadGrievances}>Try again</button></div> : <><div className="summary-grid"><div><span>Total</span><strong>{counts.total}</strong></div><div><span>Submitted</span><strong>{counts.submitted}</strong></div><div><span>In progress</span><strong>{counts.active}</strong></div><div><span>Resolved / closed</span><strong>{counts.resolved}</strong></div></div><SearchFilter value={search} onSearchChange={setSearch} status={status} onStatusChange={setStatus} category={category} onCategoryChange={setCategory} />{grievances.length === 0 ? <div className="dashboard-state"><h2>No grievances yet</h2><p>When you submit a grievance, it will appear here.</p><Link className="btn btn-primary" to="/grievances/new">Submit your first grievance</Link></div> : filtered.length === 0 ? <div className="dashboard-state"><h2>No matches found</h2><p>Try changing or clearing your search and filters.</p></div> : <div className="grievance-card-list">{filtered.map((grievance) => <GrievanceCard key={grievance.id} grievance={grievance} />)}</div>}</>}
  </div></section>;
};

export default StudentDashboard;
