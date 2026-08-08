import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const ROLE_LABELS = {
  STUDENT: 'Student',
  STAFF: 'Staff',
  HOD: 'Head of Department',
  DEPARTMENT_ADMIN: 'Department Admin',
  CAMPUS_ADMIN: 'Campus Admin',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
};

const Profile = () => {
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('auth/me/');
        setProfile(res.data);
        setError(null);
      } catch {
        setProfile(authUser);
        setError('Could not refresh your details from the server. Showing saved info.');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [authUser]);

  const data = profile || authUser;
  const displayName = data?.full_name || data?.first_name || data?.username || '—';
  const roleLabel = ROLE_LABELS[data?.role] || data?.role || '—';

  const rows = [
    { label: 'Username', value: data?.username },
    { label: 'Full Name', value: data?.full_name || [data?.first_name, data?.last_name].filter(Boolean).join(' ') },
    { label: 'Email', value: data?.email },
    { label: 'Role', value: roleLabel },
    { label: 'Department', value: data?.department_name || 'Not assigned' },
    { label: 'Contact Number', value: data?.contact_number || 'Not provided' },
  ];

  return (
    <div className="profile-page">
      <div className="profile-container">
        <div className="page-heading">
          <span>Personal Information</span>
          <h1>Your profile</h1>
          <p>The details registered with the IOE Pulchowk Grievance Portal.</p>
        </div>

        {loading && <div className="profile-loading"><span className="spinner" />Loading your information...</div>}

        {!loading && (
          <div className="profile-card">
            <div className="profile-header">
              <div className="profile-avatar">
                {(displayName || 'U')[0].toUpperCase()}
              </div>
              <div className="profile-header-info">
                <h2>{displayName}</h2>
                <span className="role-badge">{roleLabel}</span>
              </div>
            </div>
            {error && <p className="profile-warning">{error}</p>}
            <div className="profile-details">
              {rows.map((row) => (
                <div className="profile-row" key={row.label}>
                  <span className="profile-row-label">{row.label}</span>
                  <span className="profile-row-value">{row.value || '—'}</span>
                </div>
              ))}
            </div>
            <div className="profile-footer">
              <Link to="/" className="btn btn-outline">Back to Home</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
