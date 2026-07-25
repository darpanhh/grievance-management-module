import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import GrievanceCard from '../components/GrievanceCard';
import SearchFilter from '../components/SearchFilter';
import { useAuth } from '../contexts/AuthContext';

const tabs = [
  { key: 'ALL', label: 'All' }, { key: 'UNDER_REVIEW', label: 'Under review' },
  { key: 'RESOLVED', label: 'Resolved' }, { key: 'ESCALATED', label: 'Escalated' },
];

const DepartmentDashboard = () => {
  const { user } = useAuth();
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const isReadOnly = (user?.role || '').toUpperCase() === 'STAFF';

  const loadGrievances = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('grievances/'); setGrievances(Array.isArray(data) ? data : data.results || []); }
    catch { setError('We could not load department grievances. Check your connection and try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadGrievances(); }, [loadGrievances]);
  const counts = useMemo(() => ({ total: grievances.length, review: grievances.filter((item) => item.current_status === 'UNDER_REVIEW').length, resolved: grievances.filter((item) => ['RESOLVED', 'CLOSED'].includes(item.current_status)).length, escalated: grievances.filter((item) => item.current_status === 'ESCALATED').length }), [grievances]);
  const filtered = useMemo(() => grievances.filter((item) => {
    const text = `${item.title} ${item.department_name || ''} ${item.category_name || ''}`.toLowerCase();
    const matchesTab = tab === 'ALL' || (tab === 'RESOLVED' ? ['RESOLVED', 'CLOSED'].includes(item.current_status) : item.current_status === tab);
    return matchesTab && (!search || text.includes(search.toLowerCase())) && (!status || item.current_status === status) && (!category || String(item.category) === category);
  }), [grievances, tab, search, status, category]);

  return <section className="dashboard-page"><div className="dashboard-container"><header className="dashboard-heading"><div><span>Department portal</span><h1>Department grievances</h1><p>{isReadOnly ? 'Read-only access to grievances assigned to your department.' : 'Review grievances assigned to your department.'}</p></div></header>
    {loading ? <div className="dashboard-state"><div className="spinner" /><p>Loading department grievances…</p></div> : error ? <div className="dashboard-state error-state"><h2>Unable to load grievances</h2><p>{error}</p><button className="btn btn-primary" onClick={loadGrievances}>Try again</button></div> : <><div className="summary-grid"><div><span>Total</span><strong>{counts.total}</strong></div><div><span>Under review</span><strong>{counts.review}</strong></div><div><span>Resolved / closed</span><strong>{counts.resolved}</strong></div><div><span>Escalated</span><strong>{counts.escalated}</strong></div></div><div className="dashboard-tabs" role="tablist">{tabs.map((item) => <button key={item.key} role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>{item.label}</button>)}</div><SearchFilter value={search} onSearchChange={setSearch} status={status} onStatusChange={setStatus} category={category} onCategoryChange={setCategory} />{grievances.length === 0 ? <div className="dashboard-state"><h2>No department grievances</h2><p>There are no grievances assigned to this department yet.</p></div> : filtered.length === 0 ? <div className="dashboard-state"><h2>No matching grievances</h2><p>Try changing the active tab or clearing the search filters.</p></div> : <div className="grievance-card-list">{filtered.map((item) => <GrievanceCard key={item.id} grievance={item} />)}</div>}</>}
  </div></section>;
};

export default DepartmentDashboard;
