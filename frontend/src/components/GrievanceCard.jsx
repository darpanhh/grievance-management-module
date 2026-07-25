import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';

const formatDate = (date) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(date)) : '—';

const GrievanceCard = ({ grievance }) => (
  <Link to={`/grievances/${grievance.id}`} className="grievance-card" aria-label={`View grievance: ${grievance.title}`}>
    <div className="grievance-card-top"><div><span className="detail-id">GMS-{String(grievance.id).padStart(4, '0')}</span><h3>{grievance.title}</h3></div><StatusBadge status={grievance.current_status} /></div>
    <dl className="grievance-card-meta"><div><dt>Department</dt><dd>{grievance.department_name || 'Not assigned'}</dd></div><div><dt>Category</dt><dd>{grievance.category_name || 'Uncategorized'}</dd></div><div><dt>Submitted</dt><dd>{formatDate(grievance.created_at)}</dd></div><div><dt>Attachments</dt><dd>{grievance.attachment_count || 0} file{grievance.attachment_count === 1 ? '' : 's'}</dd></div></dl>
  </Link>
);

export default GrievanceCard;
