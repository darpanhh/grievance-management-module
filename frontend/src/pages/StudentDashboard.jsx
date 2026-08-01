import GrievanceListView from '../components/GrievanceListView';

const StudentDashboard = () => <GrievanceListView
  pageClass="student-dashboard-page"
  eyebrow="Student portal"
  title="My grievances"
  description="Follow the progress of every grievance you have submitted."
  emptyMessage="When you submit a grievance, it will appear here."
  submitLink
/>;

export default StudentDashboard;
