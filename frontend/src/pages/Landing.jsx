import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';

const roleHome = {
  STUDENT: { eyebrow: 'Student workspace', title: 'Your concerns deserve a clear path forward.', description: 'Create grievances, follow department responses, and keep every update in one place.', dashboard: '/dashboard/student', dashboardLabel: 'Open my dashboard', primary: 'Submit a grievance', primaryTo: '/grievances/new', accent: 'student' },
  STAFF: { eyebrow: 'Staff workspace', title: 'A simple, private way to raise campus issues.', description: 'Submit and follow your grievances from one personal dashboard, with clear status updates along the way.', dashboard: '/dashboard/student', dashboardLabel: 'Open my dashboard', primary: 'Submit a grievance', primaryTo: '/grievances/new', accent: 'student' },
  HOD: { eyebrow: 'Department workspace', title: 'Keep your department’s resolutions moving.', description: 'Review grievances assigned to your department and see which concerns need attention first.', dashboard: '/dashboard/department', dashboardLabel: 'Open department dashboard', primary: 'Review department grievances', primaryTo: '/dashboard/department', accent: 'department' },
  CAMPUS_ADMIN: { eyebrow: 'Campus administration', title: 'Handle escalated grievances.', description: 'Review the escalated grievances assigned to you and respond to keep resolutions moving.', dashboard: '/dashboard/campus', dashboardLabel: 'Open your queue', primary: 'Review escalated grievances', primaryTo: '/dashboard/campus', accent: 'admin' },
  SYSTEM_ADMIN: { eyebrow: 'System administration', title: 'See the whole grievance system at a glance.', description: 'Monitor campus-wide activity, escalations, resolution progress, spam flags, and role health from one overview.', dashboard: '/dashboard/admin', dashboardLabel: 'Open system overview', primary: 'View system dashboard', primaryTo: '/dashboard/admin', accent: 'admin' },
};

const Landing = () => {
  const { user } = useAuth();
  const userRole = (user?.role || '').toUpperCase();
  const workspace = roleHome[userRole] || roleHome.STUDENT;
  const displayName = user?.first_name || user?.username || user?.email?.split('@')[0] || 'there';

  if (user) {
    return <div className={`role-home role-home-${workspace.accent}`}>
      <section className="role-home-hero"><div className="role-home-container"><div className="role-home-copy"><div className="hero-badge"><span className="badge-pulse" />{workspace.eyebrow}</div><p className="role-greeting">Welcome back, {displayName}</p><h1>{workspace.title}</h1><p>{workspace.description}</p><div className="hero-cta-group"><Link to={workspace.primaryTo} className="btn btn-hero-primary">{workspace.primary}<span className="btn-arrow">→</span></Link><Link to={workspace.dashboard} className="btn btn-hero-secondary">{workspace.dashboardLabel}</Link></div></div><aside className="role-home-panel"><img src={logo} alt="IOE Pulchowk Campus Logo" /><span>Your workspace</span><strong>{workspace.eyebrow}</strong><p>Secure access based on your campus role.</p><div className="role-home-panel-line" /><small>IOE Pulchowk Campus · Grievance Portal</small></aside></div></section>
      <section className="role-home-steps"><div><span>01</span><h2>{userRole === 'HOD' ? 'Review assigned issues' : userRole === 'CAMPUS_ADMIN' ? 'Handle escalations' : userRole === 'SYSTEM_ADMIN' ? 'Monitor campus activity' : 'Share your concern'}</h2><p>{userRole === 'HOD' ? 'See department grievances in one focused queue.' : userRole === 'CAMPUS_ADMIN' ? 'Respond to the escalated grievances in your queue.' : userRole === 'SYSTEM_ADMIN' ? 'View system-wide volume and priority signals.' : 'Submit a clear description with optional evidence.'}</p></div><div><span>02</span><h2>{userRole === 'HOD' ? 'Follow progress' : userRole === 'CAMPUS_ADMIN' ? 'Drive resolution' : userRole === 'SYSTEM_ADMIN' ? 'Identify what needs action' : 'Track each update'}</h2><p>{userRole === 'HOD' ? 'Use filters and status to stay organised.' : userRole === 'CAMPUS_ADMIN' ? 'Keep each escalation moving towards a response.' : userRole === 'SYSTEM_ADMIN' ? 'Keep an eye on escalations, spam, and role health.' : 'See department responses and your status history.'}</p></div><div><span>03</span><h2>{userRole === 'HOD' ? 'Resolve with clarity' : userRole === 'CAMPUS_ADMIN' ? 'Support resolution' : userRole === 'SYSTEM_ADMIN' ? 'Oversee the workflow' : 'Stay informed'}</h2><p>{userRole === 'HOD' ? 'Keep the resolution journey transparent.' : userRole === 'CAMPUS_ADMIN' ? 'Close the loop on escalated concerns.' : userRole === 'SYSTEM_ADMIN' ? 'Use the overview to keep the whole system healthy.' : 'Your dashboard keeps the full record together.'}</p></div></section>
    </div>;
  }

  return <div className="landing-page"><section className="hero-section"><div className="hero-container"><div className="hero-badge"><span className="badge-pulse" />Institute of Engineering · Pulchowk Campus</div><div className="hero-content"><div className="hero-logo-wrapper"><img src={logo} alt="IOE Pulchowk Campus Logo" className="hero-logo" /></div><h1 className="hero-title">IOE Pulchowk <span className="gradient-text">Grievance Portal</span></h1><p className="hero-description">A clear and accountable way for the Pulchowk community to raise campus concerns, receive responses, and follow progress.</p><div className="hero-cta-group"><Link to="/register" className="btn btn-hero-primary">Create an account <span className="btn-arrow">→</span></Link><Link to="/grievances/track" className="btn btn-hero-secondary">Track a grievance</Link><Link to="/login" className="btn btn-hero-outline">Account login</Link></div></div></div></section></div>;
};

export default Landing;
