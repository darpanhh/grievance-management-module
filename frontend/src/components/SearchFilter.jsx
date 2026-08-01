import { useEffect, useState } from 'react';
import api from '../services/api';

const STATUSES = ['SUBMITTED', 'SPAM', 'UNDER_REVIEW', 'RESPONDED', 'REOPENED', 'ESCALATED', 'RESOLVED', 'REJECTED', 'CLOSED'];
const label = (value) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const SearchFilter = ({
  statuses = STATUSES,
  value,
  onSearchChange,
  status,
  onStatusChange,
  category,
  onCategoryChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  ordering,
  onOrderingChange,
}) => {
  const [query, setQuery] = useState(value || '');
  const [categories, setCategories] = useState([]);

  useEffect(() => { setQuery(value || ''); }, [value]);
  useEffect(() => {
    const timer = setTimeout(() => onSearchChange(query), 300);
    return () => clearTimeout(timer);
  }, [query, onSearchChange]);
  useEffect(() => { api.get('categories/').then(({ data }) => setCategories(data)).catch(() => setCategories([])); }, []);

  return <div className="search-filter">
    <input aria-label="Search grievances" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title or description" />
    <select aria-label="Filter by status" value={status} onChange={(event) => onStatusChange(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
    <select aria-label="Filter by category" value={category} onChange={(event) => onCategoryChange(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}</select>
    <label className="filter-date"><span>From</span><input aria-label="Filter from date" type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} /></label>
    <label className="filter-date"><span>To (optional)</span><input aria-label="Filter to date" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => onDateToChange(event.target.value)} /></label>
    <select aria-label="Sort grievances" value={ordering} onChange={(event) => onOrderingChange(event.target.value)}>
      <option value="-created_at">Newest first</option>
      <option value="created_at">Oldest first</option>
      <option value="-updated_at">Recently updated</option>
      <option value="updated_at">Least recently updated</option>
      <option value="title">Title A–Z</option>
      <option value="-title">Title Z–A</option>
    </select>
  </div>;
};

export default SearchFilter;
