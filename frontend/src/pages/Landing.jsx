import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';

const ArrowIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
const RouteIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h9a4 4 0 1 1 0 8H9a4 4 0 1 0 0 8h11" /><path d="m16 3 3 3-3 3M16 18l3 3-3 3" /></svg>;
const BellIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
const ShieldIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
const CheckIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;

const roleHome = {
  STUDENT: { eyebrow: 'Student workspace', title: 'Your concerns deserve a clear path forward.', description: 'Create grievances, follow department responses, and keep every update in one place.', dashboard: '/dashboard/student', dashboardLabel: 'Open my dashboard', primary: 'Submit a grievance', primaryTo: '/grievances/new', accent: 'student' },
  STAFF: { eyebrow: 'Staff workspace', title: 'A simple, private way to raise campus issues.', description: 'Submit and follow your grievances from one personal dashboard, with clear status updates along the way.', dashboard: '/dashboard/student', dashboardLabel: 'Open my dashboard', primary: 'Submit a grievance', primaryTo: '/grievances/new', accent: 'student' },
  HOD: { eyebrow: 'Department workspace', title: 'Keep your department’s resolutions moving.', description: 'Review grievances assigned to your department and see which concerns need attention first.', dashboard: '/dashboard/department', dashboardLabel: 'Open department dashboard', primary: 'Review department grievances', primaryTo: '/dashboard/department', accent: 'department' },
  CAMPUS_ADMIN: { eyebrow: 'Campus administration', title: 'See the whole grievance system at a glance.', description: 'Monitor campus-wide activity, escalations, resolution progress, and spam flags from one overview.', dashboard: '/dashboard/admin', dashboardLabel: 'Open system overview', primary: 'View system dashboard', primaryTo: '/dashboard/admin', accent: 'admin' },
};

const Landing = () => {
  const { user } = useAuth();
  const userRole = (user?.role || '').toUpperCase();
  const workspace = roleHome[userRole] || roleHome.STUDENT;
  const displayName = user?.first_name || user?.username || user?.email?.split('@')[0] || 'there';

  if (userRole === 'HOD') return <Navigate to="/department/grievances" replace />;
  if (userRole === 'CAMPUS_ADMIN') return <Navigate to="/admin/grievances" replace />;

  if (user) {
    return <div className={`role-home role-home-${workspace.accent}`}>
      <section className="role-home-hero"><div className="role-home-container"><div className="role-home-copy"><div className="hero-badge">{workspace.eyebrow}</div><p className="role-greeting">Welcome back, {displayName}</p><h1>{workspace.title}</h1><p>{workspace.description}</p><div className="hero-cta-group"><Link to={workspace.primaryTo} className="btn btn-hero-primary">{workspace.primary}<span className="btn-arrow">→</span></Link><Link to={workspace.dashboard} className="btn btn-hero-secondary">{workspace.dashboardLabel}</Link></div></div><aside className="role-home-panel"><img src={logo} alt="IOE Pulchowk Campus Logo" /><span>Your workspace</span><strong>{workspace.eyebrow}</strong><p>Secure access based on your campus role.</p><div className="role-home-panel-line" /><small>IOE Pulchowk Campus · Grievance Portal</small></aside></div></section>
      <section className="role-home-steps"><div><span>01</span><h2>{userRole === 'HOD' ? 'Review assigned issues' : userRole === 'CAMPUS_ADMIN' ? 'Monitor campus activity' : 'Share your concern'}</h2><p>{userRole === 'HOD' ? 'See department grievances in one focused queue.' : userRole === 'CAMPUS_ADMIN' ? 'View system-wide volume and priority signals.' : 'Submit a clear description with optional evidence.'}</p></div><div><span>02</span><h2>{userRole === 'HOD' ? 'Follow progress' : userRole === 'CAMPUS_ADMIN' ? 'Identify what needs action' : 'Track each update'}</h2><p>{userRole === 'HOD' ? 'Use filters and status to stay organised.' : userRole === 'CAMPUS_ADMIN' ? 'Keep an eye on escalations and spam flags.' : 'See department responses and your status history.'}</p></div><div><span>03</span><h2>{userRole === 'HOD' ? 'Resolve with clarity' : userRole === 'CAMPUS_ADMIN' ? 'Support resolution' : 'Stay informed'}</h2><p>{userRole === 'HOD' ? 'Keep the resolution journey transparent.' : userRole === 'CAMPUS_ADMIN' ? 'Use the overview to keep the workflow healthy.' : 'Your dashboard keeps the full record together.'}</p></div></section>
    </div>;
  }

  return <div className="landing-page">
    <section className="hero-section">
      <div className="hero-orb hero-orb-one" /><div className="hero-orb hero-orb-two" />
      <div className="hero-container">
        <div className="hero-content">
          <div className="hero-badge">Institute of Engineering · Pulchowk Campus</div>
          <div className="hero-heading-row"><div className="hero-logo-wrapper"><img src={logo} alt="IOE Pulchowk Campus Logo" className="hero-logo" /></div><span className="hero-kicker">YOUR VOICE, HEARD</span></div>
          <h1 className="hero-title">A better path from <span className="gradient-text">concern to change.</span></h1>
          <p className="hero-description">One trusted place for the Pulchowk community to raise campus concerns, receive meaningful responses, and follow every step forward.</p>
          <div className="hero-cta-group"><Link to="/register" className="btn btn-hero-primary">Create an account <ArrowIcon /></Link><Link to="/grievances/track" className="btn btn-hero-secondary">Track a grievance</Link><Link to="/login" className="btn btn-hero-outline">Account login</Link></div>
          <div className="hero-trust"><span><CheckIcon /> Private by design</span><span><CheckIcon /> Clear status updates</span></div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="visual-glow" /><div className="portal-card">
            <div className="portal-card-top"><span className="portal-emblem"><ShieldIcon /></span><span className="portal-status"><i />Secure portal</span></div>
            <p>Grievance <b>#IOE-2481</b></p><h3>Campus facilities concern</h3>
            <div className="portal-progress"><span /><span /><span /></div>
            <div className="portal-card-bottom"><span><BellIcon /> Update received</span><strong>In review</strong></div>
          </div>
          <div className="floating-note note-one"><span className="mini-icon"><RouteIcon /></span><div><b>Smart routing</b><small>To the right department</small></div></div>
          <div className="floating-note note-two"><span className="note-check"><CheckIcon /></span><div><b>Every update, recorded</b><small>Transparent from start to finish</small></div></div>
        </div>
      </div>
    </section>
    <section className="stats-banner"><div className="stats-container"><div className="stat-card"><div className="stat-value">Clear</div><div className="stat-label">Status updates</div></div><div className="stat-card"><div className="stat-value">Private</div><div className="stat-label">Anonymous option</div></div><div className="stat-card"><div className="stat-value">8+</div><div className="stat-label">Campus departments</div></div><div className="stat-card"><div className="stat-value">One place</div><div className="stat-label">For every update</div></div></div></section>
    <section className="features-section"><div className="section-header"><span className="section-eyebrow">HOW IT HELPS</span><h2>Built to make progress feel visible.</h2><p>Designed to connect students, staff, departments, and campus administration with less friction.</p></div><div className="features-grid"><div className="feature-card"><div className="feature-icon"><RouteIcon /></div><span className="feature-index">01</span><h3>Route with confidence</h3><p>Send a concern to the responsible department from the start.</p></div><div className="feature-card feature-card-featured"><div className="feature-icon"><BellIcon /></div><span className="feature-index">02</span><h3>Stay in the loop</h3><p>Follow responses and every status change from your account.</p></div><div className="feature-card"><div className="feature-icon"><ShieldIcon /></div><span className="feature-index">03</span><h3>Built for accountability</h3><p>Clear histories make each resolution journey easy to understand.</p></div></div></section>
  </div>;
};

export default Landing;
