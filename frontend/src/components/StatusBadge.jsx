const STATUS_DETAILS = {
  SUBMITTED: {
    label: 'Submitted',
    tip: 'Your grievance has been received and is awaiting initial review.',
  },
  SPAM: {
    label: 'Spam',
    tip: 'Flagged as spam by the AI filter. An admin will review this classification.',
  },
  UNDER_REVIEW: {
    label: 'Under review',
    tip: 'The department is actively reviewing your grievance.',
  },
  RESPONDED: {
    label: 'Responded',
    tip: 'The department has posted an official response for you to review.',
  },
  REOPENED: {
    label: 'Reopened',
    tip: 'You have requested further review after the department\'s response.',
  },
  ESCALATED: {
    label: 'Escalated',
    tip: 'This grievance has been escalated to Campus Administration for resolution.',
  },
  RESOLVED: {
    label: 'Resolved',
    tip: 'You have marked this grievance as resolved.',
  },
  CLOSED: {
    label: 'Closed',
    tip: 'This grievance has been closed and is no longer active.',
  },
};

const StatusBadge = ({ status }) => {
  const normalized = (status || 'SUBMITTED').toUpperCase();
  const info = STATUS_DETAILS[normalized] || {
    label: normalized.replace(/_/g, ' '),
    tip: '',
  };

  return (
    <span
      className={`status-badge status-${normalized.toLowerCase()}`}
      title={info.tip}
    >
      {info.label}
      <span className="status-tooltip">{info.tip}</span>
    </span>
  );
};

export default StatusBadge;
