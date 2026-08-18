import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';

const formatDate = (date) => (date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(date)) : '—');

const GrievanceCard = ({ grievance }) => (
  <Link to={`/grievances/${grievance.id}`} className="grievance-card" aria-label={`View grievance: ${grievance.title}`}>
    <div className="grievance-card-header">
      <div className="grievance-card-title-group">
        <h3 className="grievance-card-title">{grievance.title}</h3>
      </div>
      <StatusBadge status={grievance.display_status || grievance.current_status} />
    </div>

    <div className="grievance-card-meta">
      <div className="meta-item">
        <span className="meta-label">Department</span>
        <span className="meta-value">{grievance.department_name || 'Not assigned'}</span>
      </div>
      <div className="meta-item">
        <span className="meta-label">Category</span>
        <span className="meta-value">{grievance.category_name || 'Uncategorized'}</span>
      </div>
      <div className="meta-item">
        <span className="meta-label">Submitted</span>
        <span className="meta-value">{formatDate(grievance.created_at)}</span>
      </div>
      <div className="meta-item">
        <span className="meta-label">Attachments</span>
        <span className="meta-value">{grievance.attachment_count || 0} file{grievance.attachment_count === 1 ? '' : 's'}</span>
      </div>
    </div>

    <div className="grievance-card-footer">
      <span className="view-details-link">
        View details
        <svg className="arrow-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
          <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </span>
    </div>
  </Link>
);

export default GrievanceCard;

