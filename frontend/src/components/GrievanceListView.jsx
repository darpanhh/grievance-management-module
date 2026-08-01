import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import GrievanceCard from './GrievanceCard';
import SearchFilter from './SearchFilter';

const GrievanceListView = ({ eyebrow, title, description, emptyMessage, submitLink = false, pageClass = '' }) => {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [ordering, setOrdering] = useState('-created_at');

  const loadGrievances = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('grievances/', {
        params: {
          ...(search && { search }),
          ...(status && { status }),
          ...(category && { category }),
          ...(dateFrom && { date_from: dateFrom }),
          ...(dateTo && { date_to: dateTo }),
          ordering,
        },
      });
      setGrievances(Array.isArray(data) ? data : data.results || []);
    } catch {
      setError('We could not load grievances. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [search, status, category, dateFrom, dateTo, ordering]);

  useEffect(() => { loadGrievances(); }, [loadGrievances]);

  return (
    <section className={`dashboard-page ${pageClass}`}>
      <div className="dashboard-container">
        <header className="dashboard-heading">
          <div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
          {submitLink && <Link className="btn btn-primary" to="/grievances/new">Submit grievance</Link>}
        </header>
        <SearchFilter
          value={search} onSearchChange={setSearch}
          status={status} onStatusChange={setStatus}
          category={category} onCategoryChange={setCategory}
          dateFrom={dateFrom} onDateFromChange={setDateFrom}
          dateTo={dateTo} onDateToChange={setDateTo}
          ordering={ordering} onOrderingChange={setOrdering}
        />
        {loading ? <div className="dashboard-state"><div className="spinner" /><p>Loading grievances…</p></div>
          : error ? <div className="dashboard-state error-state"><h2>Unable to load grievances</h2><p>{error}</p><button className="btn btn-primary" onClick={loadGrievances}>Try again</button></div>
          : grievances.length === 0 ? <div className="dashboard-state"><h2>No grievances found</h2><p>{emptyMessage}</p></div>
          : <div className="grievance-card-list">{grievances.map((grievance) => <GrievanceCard key={grievance.id} grievance={grievance} />)}</div>}
      </div>
    </section>
  );
};

export default GrievanceListView;
