import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import GrievanceCard from '../components/GrievanceCard';
import SearchFilter from '../components/SearchFilter';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—';

const CampusAdminDashboard = () => {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');

  const loadQueue = useCallback(async () => {
    setLoading(true); setError(''); setActionError('');
    try { const { data } = await api.get('grievances/'); setGrievances(Array.isArray(data) ? data : data.results || []); }
    catch { setError('We could not load your escalation queue. Check your connection and try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadQueue(); }, [loadQueue]);

  const takeIntoReview = async (item) => {
    setBusyId(item.id); setActionError('');
    try {
      await api.post(`grievances/${item.id}/review/`);
      await loadQueue();
    } catch (err) {
      setActionError(err.response?.data?.error || err.response?.data?.detail || 'Could not take this grievance into review. Please try again.');
    } finally { setBusyId(null); }
  };

  const counts = useMemo(() => ({
    total: grievances.length,
    escalated: grievances.filter((item) => item.current_status === 'ESCALATED').length,
    inReview: grievances.filter((item) => item.current_status === 'UNDER_REVIEW' || item.current_status === 'REOPENED').length,
    oldest: grievances.filter((item) => item.current_status === 'ESCALATED').map((item) => item.created_at).sort()[0] || null,
  }), [grievances]);

  const filtered = useMemo(() => grievances.filter((item) => {
    const text = `${item.title} ${item.department_name || ''} ${item.category_name || ''} ${item.escalated_to_name || ''}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (!status || item.current_status === status) && (!category || String(item.category) === category);
  }), [grievances, search, status, category]);

  return <section className="dashboard-page"><div className="dashboard-container"><header className="dashboard-heading"><div><span>Campus administration</span><h1>Escalation queue</h1><p>Grievances escalated to Campus Administration. Take one into review, then post an official response.</p></div></header>
    {loading ? <div className="dashboard-state"><div className="spinner" /><p>Loading your escalation queue…</p></div> : error ? <div className="dashboard-state error-state"><h2>Unable to load your queue</h2><p>{error}</p><button className="btn btn-primary" onClick={loadQueue}>Try again</button></div> : <><div className="summary-grid"><div><span>In your queue</span><strong>{counts.total}</strong></div><div><span>Open escalations</span><strong>{counts.escalated}</strong></div><div><span>In review / reopened</span><strong>{counts.inReview}</strong></div><div><span>Oldest escalation</span><strong style={{ fontSize: '0.95rem' }}>{counts.oldest ? formatDate(counts.oldest) : '—'}</strong></div></div><SearchFilter value={search} onSearchChange={setSearch} status={status} onStatusChange={setStatus} category={category} onCategoryChange={setCategory} />{actionError && <div className="form-alert danger" role="alert" style={{ marginBottom: '1rem' }}>{actionError}</div>}
      {grievances.length === 0 ? <div className="dashboard-state"><h2>Nothing in your queue</h2><p>When a grievance is escalated, it will appear here for you to review.</p></div> : filtered.length === 0 ? <div className="dashboard-state"><h2>No matching escalations</h2><p>Try changing or clearing your search and filters.</p></div> : <div className="grievance-card-list">{filtered.map((item) => <div key={item.id}><GrievanceCard grievance={item} />{item.current_status === 'ESCALATED' && <div className="card-actions"><button className="btn btn-primary" disabled={busyId === item.id} onClick={() => takeIntoReview(item)}>{busyId === item.id ? 'Working…' : 'Take into review'}</button><Link className="btn btn-outline" to={`/grievances/${item.id}`} state={{ backTo: '/dashboard/campus', backLabel: 'Back to escalation queue' }}>View details</Link></div>}</div>)}</div>}</>}
  </div></section>;
};

export default CampusAdminDashboard;
