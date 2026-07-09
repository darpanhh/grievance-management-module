import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

function App() {
  const [status, setStatus] = useState({
    loading: true,
    backendHealthy: false,
    dbStatus: 'disconnected',
    backendMessage: '',
    error: null
  });

  const checkStatus = () => {
    setStatus(prev => ({ ...prev, loading: true, error: null }));
    axios.get('http://localhost:8000/api/status/')
      .then(res => {
        setStatus({
          loading: false,
          backendHealthy: res.data.status === 'healthy',
          dbStatus: res.data.database,
          backendMessage: res.data.message,
          error: null
        });
      })
      .catch(err => {
        setStatus({
          loading: false,
          backendHealthy: false,
          dbStatus: 'disconnected (Backend unreachable)',
          backendMessage: 'Failed to connect to the backend server.',
          error: err.message
        });
      });
  };

  useEffect(() => {
    checkStatus();
  }, []);

  return (
    <div className="launchpad-container">
      <header className="launchpad-header">
        <div className="logo-badge">GMS</div>
        <h1>Grievance Management System</h1>
        <p className="subtitle">System Launchpad & Connection Dashboard</p>
      </header>

      <main className="launchpad-main">
        <section className="status-grid">
          {/* Django Backend Status Card */}
          <div className={`status-card ${status.backendHealthy ? 'healthy' : 'unhealthy'}`}>
            <div className="card-header">
              <h3>Django Backend API</h3>
              <span className={`badge ${status.backendHealthy ? 'success' : 'danger'}`}>
                {status.loading ? 'Checking...' : status.backendHealthy ? 'HEALTHY' : 'DOWN'}
              </span>
            </div>
            <p className="card-desc">Python-based REST API service orchestrating business logic and routing.</p>
            <div className="card-details">
              <strong>URL:</strong> <code>http://localhost:8000/api/status/</code>
            </div>
          </div>

          {/* PostgreSQL DB Status Card */}
          <div className={`status-card ${status.dbStatus.includes('connected') && !status.dbStatus.includes('disconnected') ? 'healthy' : 'unhealthy'}`}>
            <div className="card-header">
              <h3>PostgreSQL Database</h3>
              <span className={`badge ${status.dbStatus.includes('connected') && !status.dbStatus.includes('disconnected') ? 'success' : 'danger'}`}>
                {status.loading ? 'Checking...' : (status.dbStatus.includes('connected') && !status.dbStatus.includes('disconnected') ? 'CONNECTED' : 'DISCONNECTED')}
              </span>
            </div>
            <p className="card-desc">Relational database storing user records, grievances, responses, and histories.</p>
            <div className="card-details">
              <strong>Status:</strong> <code>{status.loading ? 'Fetching...' : status.dbStatus}</code>
            </div>
          </div>
        </section>

        <div className="action-row">
          <button className="btn-refresh" onClick={checkStatus} disabled={status.loading}>
            {status.loading ? 'Re-checking...' : 'Refresh Status'}
          </button>
        </div>

        <section className="info-section">
          <h2>Project Architecture</h2>
          <div className="arch-list">
            <div className="arch-item">
              <span className="folder-icon">📂</span>
              <div className="arch-text">
                <h4>backend/</h4>
                <p>Django REST project. Launch server with <code>venv\Scripts\python.exe manage.py runserver</code></p>
              </div>
            </div>
            <div className="arch-item">
              <span className="folder-icon">📂</span>
              <div className="arch-text">
                <h4>frontend/</h4>
                <p>React + Vite single-page application. Run dev server with <code>npm run dev</code></p>
              </div>
            </div>
            <div className="arch-item">
              <span className="folder-icon">🐳</span>
              <div className="arch-text">
                <h4>Docker Compose</h4>
                <p>Runs PostgreSQL. Start container with <code>docker compose up -d</code></p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="launchpad-footer">
        <p>Grievance Management System (GMS) &bull; Version 2.0 Project Setup</p>
      </footer>
    </div>
  )
}

export default App
