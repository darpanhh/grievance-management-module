import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkAuthStatus = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await api.get('auth/me/');
      setUser(res.data);
      localStorage.setItem('user', JSON.stringify(res.data));
    } catch (err) {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      } else {
        setUser(null);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();

    const handleExternalLogout = () => {
      setUser(null);
      localStorage.removeItem('user');
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    };

    window.addEventListener('auth:logout', handleExternalLogout);
    return () => {
      window.removeEventListener('auth:logout', handleExternalLogout);
    };
  }, [checkAuthStatus]);

  const login = async (credentials) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('auth/login/', credentials);
      const { access, refresh } = res.data;

      localStorage.setItem('access_token', access);
      if (refresh) localStorage.setItem('refresh_token', refresh);
      
      const profileRes = await api.get('auth/me/');
      const userData = profileRes.data;

      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      return { success: true, user: userData };
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.message || 'Login failed. Please check your credentials.';
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('auth/register/', userData);
      return { success: true, data: res.data };
    } catch (err) {
      const serverErrors = err.response?.data;
      let msg = 'Registration failed.';
      if (serverErrors) {
        if (typeof serverErrors === 'string') {
          msg = serverErrors;
        } else if (serverErrors.detail) {
          msg = serverErrors.detail;
        } else {
          // Extract field error messages
          const firstKey = Object.keys(serverErrors)[0];
          if (firstKey) {
            const firstErr = serverErrors[firstKey];
            msg = Array.isArray(firstErr) ? `${firstKey}: ${firstErr[0]}` : `${firstKey}: ${firstErr}`;
          }
        }
      }
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        logout,
        register,
        checkAuthStatus,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
