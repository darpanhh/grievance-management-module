const STATUS_LABELS = {
  SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under Review', IN_PROGRESS: 'In Progress',
  REOPENED: 'Reopened', ESCALATED: 'Escalated', RESOLVED: 'Resolved', REJECTED: 'Rejected',
  CLOSED: 'Closed',
};

const StatusBadge = ({ status }) => {
  const normalized = (status || 'SUBMITTED').toUpperCase();
  return <span className={`status-badge status-${normalized.toLowerCase()}`}>{STATUS_LABELS[normalized] || normalized.replace(/_/g, ' ')}</span>;
};

export default StatusBadge;
