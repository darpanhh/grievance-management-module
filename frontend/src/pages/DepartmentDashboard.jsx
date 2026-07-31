import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import GrievanceCard from '../components/GrievanceCard';
import SearchFilter from '../components/SearchFilter';

const DepartmentDashboard = () => {
  const [grievances, setGrievances] = useState([]);
  const [spamItems, setSpamItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true); setError(''); setActionError('');
    try {
      const mainRes = await api.get('grievances/');
      setGrievances(Array.isArray(mainRes.data) ? mainRes.data : mainRes.data.results || []);
      const spamRes = await api.get('spam/');
      setSpamItems(Array.isArray(spamRes.data) ? spamRes.data : spamRes.data.results || []);
    } catch {
      setError('We could not load department grievances. Check your connection and try again.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const runAction = async (item, endpoint, label) => {
    setBusyId(item.id); setActionError('');
    try {
      await api.post(`grievances/${item.id}/${endpoint}/`);
      await loadAll();
    } catch (err) {
      setActionError(err.response?.data?.error || err.response?.data?.detail || `Could not ${label.toLowerCase()}. Please try again.`);
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(() => ({
    total: grievances.length,
    review: grievances.filter((item) => item.current_status === 'UNDER_REVIEW').length,
    resolved: grievances.filter((item) => ['RESOLVED', 'CLOSED'].includes(item.current_status)).length,
    escalated: grievances.filter((item) => item.current_status === 'ESCALATED').length,
    spam: spamItems.length,
  }), [grievances, spamItems]);

  const tabs = useMemo(() => {
    const base = [
      { key: 'ALL', label: 'All' }, { key: 'UNDER_REVIEW', label: 'Under review' },
      { key: 'RESOLVED', label: 'Resolved' }, { key: 'ESCALATED', label: 'Escalated' },
    ];
    base.push({ key: 'SPAM', label: 'Spam', count: counts.spam });
    return base;
  }, [counts.spam]);

  const filtered = useMemo(() => grievances.filter((item) => {
    const text = `${item.title} ${item.department_name || ''} ${item.category_name || ''}`.toLowerCase();
    const matchesTab = tab === 'ALL' || (tab === 'RESOLVED' ? ['RESOLVED', 'CLOSED'].includes(item.current_status) : item.current_status === tab);
    return matchesTab && (!search || text.includes(search.toLowerCase())) && (!status || item.current_status === status) && (!category || String(item.category) === category);
  }), [grievances, tab, search, status, category]);

  const filteredSpam = useMemo(() => spamItems.filter((item) => {
    const text = `${item.title} ${item.department_name || ''} ${item.category_name || ''}`.toLowerCase();
    return !search || text.includes(search.toLowerCase());
  }), [spamItems, search]);

  const cardActions = (item) => {
    if (item.current_status === 'SUBMITTED') return [{ endpoint: 'review', label: 'Start review' }];
    if (item.current_status === 'SPAM') return [
      { endpoint: 'reinstate-spam', label: 'Reinstate from spam' },
      { endpoint: 'review', label: 'Start review' },
    ];
    return [];
  };

  const renderCard = (item) => {
    const actions = cardActions(item);
    return <div key={item.id}>
      <GrievanceCard grievance={item} />
      {actions.length > 0 && <div className="card-actions">
        {actions.map((action) => <button key={action.endpoint} className="btn btn-outline" disabled={busyId === item.id} onClick={() => runAction(item, action.endpoint, action.label)}>{busyId === item.id ? 'Working…' : action.label}</button>)}
        <Link className="btn btn-outline" to={`/grievances/${item.id}`} state={{ backTo: '/dashboard/department', backLabel: 'Back to department dashboard' }}>View details</Link>
      </div>}
    </div>;
  };

  const spamTabActive = tab === 'SPAM';

  return <section className="dashboard-page"><div className="dashboard-container"><header className="dashboard-heading"><div><span>Department portal</span><h1>Department grievances</h1><p>Review, respond to, and manage grievances assigned to your department.</p></div></header>
    {loading ? <div className="dashboard-state"><div className="spinner" /><p>Loading department grievances…</p></div> : error ? <div className="dashboard-state error-state"><h2>Unable to load grievances</h2><p>{error}</p><button className="btn btn-primary" onClick={loadAll}>Try again</button></div> : <><div className="summary-grid"><div><span>Total</span><strong>{counts.total}</strong></div><div><span>Under review</span><strong>{counts.review}</strong></div><div><span>Resolved / closed</span><strong>{counts.resolved}</strong></div><div><span>Escalated</span><strong>{counts.escalated}</strong></div></div><div className="dashboard-tabs" role="tablist">{tabs.map((item) => <button key={item.key} role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>{item.label}{item.count != null && <span className="spam-tab-count">{item.count}</span>}</button>)}</div><SearchFilter value={search} onSearchChange={setSearch} status={status} onStatusChange={setStatus} category={category} onCategoryChange={setCategory} />{actionError && <div className="form-alert danger" role="alert" style={{ marginBottom: '1rem' }}>{actionError}</div>}
      {spamTabActive ? (spamItems.length === 0 ? <div className="dashboard-state"><h2>No spam flagged</h2><p>The AI spam filter has not flagged anything for your department.</p></div> : filteredSpam.length === 0 ? <div className="dashboard-state"><h2>No matching spam</h2><p>Try clearing the search box.</p></div> : <div className="grievance-card-list">{filteredSpam.map(renderCard)}</div>)
      : (grievances.length === 0 ? <div className="dashboard-state"><h2>No department grievances</h2><p>There are no grievances assigned to this department yet.</p></div> : filtered.length === 0 ? <div className="dashboard-state"><h2>No matching grievances</h2><p>Try changing the active tab or clearing the search filters.</p></div> : <div className="grievance-card-list">{filtered.map(renderCard)}</div>)}
    </>}
  </div></section>;
};

export default DepartmentDashboard;
