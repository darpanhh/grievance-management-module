import { useEffect, useState } from 'react';
import api from '../services/api';

const STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'REOPENED', 'ESCALATED', 'RESOLVED', 'REJECTED', 'CLOSED'];
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
  showStatus = true,
  showCategory = true,
}) => {
  const [query, setQuery] = useState(value || '');
  const [categories, setCategories] = useState([]);

  useEffect(() => { setQuery(value || ''); }, [value]);
  useEffect(() => {
    const timer = setTimeout(() => onSearchChange(query), 300);
    return () => clearTimeout(timer);
  }, [query, onSearchChange]);
  useEffect(() => {
    api.get('categories/').then(({ data }) => setCategories(data)).catch(() => setCategories([]));
  }, []);

  return (
    <div className={`search-filter-wrapper${!showStatus && !showCategory ? ' compact' : ''}`}>
      <div className="search-input-group">
        <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          className="filter-input search-input"
          aria-label="Search grievances"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search grievances by title or description..."
        />
        {query && (
          <button type="button" className="clear-search-btn" onClick={() => setQuery('')} aria-label="Clear search">
            ✕
          </button>
        )}
      </div>

      <div className="filter-controls-grid">
        {showStatus && (
          <div className="filter-field">
            <label className="field-label">Status</label>
            <select aria-label="Filter by status" className="filter-select" value={status} onChange={(event) => onStatusChange(event.target.value)}>
              <option value="">All Statuses</option>
              {statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}
            </select>
          </div>
        )}

        {showCategory && (
          <div className="filter-field">
            <label className="field-label">Category</label>
            <select aria-label="Filter by category" className="filter-select" value={category} onChange={(event) => onCategoryChange(event.target.value)}>
              <option value="">All Categories</option>
              {categories.map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
            </select>
          </div>
        )}

        <div className="filter-field">
          <label className="field-label">From Date</label>
          <input aria-label="Filter from date" type="date" className="filter-input" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} />
        </div>

        <div className="filter-field">
          <label className="field-label">To Date</label>
          <input aria-label="Filter to date" type="date" className="filter-input" value={dateTo} min={dateFrom || undefined} onChange={(event) => onDateToChange(event.target.value)} />
        </div>

        <div className="filter-field">
          <label className="field-label">Sort By</label>
          <select aria-label="Sort grievances" className="filter-select" value={ordering} onChange={(event) => onOrderingChange(event.target.value)}>
            <option value="-created_at">Newest First</option>
            <option value="created_at">Oldest First</option>
            <option value="-updated_at">Recently Updated</option>
            <option value="updated_at">Least Recently Updated</option>
            <option value="title">Title A–Z</option>
            <option value="-title">Title Z–A</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default SearchFilter;

