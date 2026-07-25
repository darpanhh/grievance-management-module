import { useEffect, useState } from 'react';
import api from '../services/api';

const STATUSES = ['SUBMITTED', 'SPAM', 'UNDER_REVIEW', 'RESPONDED', 'REOPENED', 'ESCALATED', 'RESOLVED', 'CLOSED'];
const label = (value) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const SearchFilter = ({ value, onSearchChange, status, onStatusChange, category, onCategoryChange }) => {
  const [query, setQuery] = useState(value || '');
  const [categories, setCategories] = useState([]);

  useEffect(() => { setQuery(value || ''); }, [value]);
  useEffect(() => {
    const timer = setTimeout(() => onSearchChange(query), 300);
    return () => clearTimeout(timer);
  }, [query, onSearchChange]);
  useEffect(() => { api.get('categories/').then(({ data }) => setCategories(data)).catch(() => setCategories([])); }, []);

  return <div className="search-filter">
    <input aria-label="Search grievances" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title, department, or category" />
    <select aria-label="Filter by status" value={status} onChange={(event) => onStatusChange(event.target.value)}><option value="">All statuses</option>{STATUSES.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
    <select aria-label="Filter by category" value={category} onChange={(event) => onCategoryChange(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}</select>
  </div>;
};

export default SearchFilter;
