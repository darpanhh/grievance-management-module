const STATUS_LABELS = {
  SUBMITTED: 'Submitted', SPAM: 'Spam', UNDER_REVIEW: 'Under review', RESPONDED: 'Responded',
  REOPENED: 'Reopened', ESCALATED: 'Escalated', RESOLVED: 'Resolved', CLOSED: 'Closed',
};

const StatusBadge = ({ status }) => {
  const normalized = (status || 'SUBMITTED').toUpperCase();
  return <span className={`status-badge status-${normalized.toLowerCase()}`}>{STATUS_LABELS[normalized] || normalized.replace(/_/g, ' ')}</span>;
};

export default StatusBadge;
