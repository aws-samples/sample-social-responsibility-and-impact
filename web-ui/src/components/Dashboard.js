import React, { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { get } from 'aws-amplify/api';
import './Dashboard.css';
import MessageCard from './MessageCard';
import MapView from './MapView';
import PhoneView from './PhoneView';
import { labels } from '../config/labels';

function Dashboard({ user }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('cards'); // 'cards', 'map', or 'phone'
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get auth token
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (!token) {
        throw new Error('No authentication token available');
      }

      // Call API Gateway
      const restOperation = get({
        apiName: 'WeatherAlertAPI',
        path: '/messages',
        options: {
          queryParams: {
            maxMessages: '10'
          },
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      });

      const response = await restOperation.response;
      const data = await response.body.json();

      setMessages(data.messages || []);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError(err.message || 'Failed to fetch messages');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();

    // Auto-refresh every 30 seconds if enabled
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchMessages, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="dashboard-title">
          <h2>{labels.appTitle}</h2>
          <p className="subtitle">
            {messages.length} alert{messages.length !== 1 ? 's' : ''} for {labels.recipientLabel.toLowerCase()}
          </p>
        </div>
        
        <div className="dashboard-controls">
          <div className="view-toggle">
            <button
              className={viewMode === 'cards' ? 'active' : ''}
              onClick={() => setViewMode('cards')}
            >
              📋 {labels.cardViewLabel}
            </button>
            <button
              className={viewMode === 'phone' ? 'active' : ''}
              onClick={() => setViewMode('phone')}
            >
              📱 {labels.phoneViewLabel}
            </button>
            <button
              className={viewMode === 'map' ? 'active' : ''}
              onClick={() => setViewMode('map')}
            >
              🗺️ {labels.mapViewLabel}
            </button>
          </div>

          <label className="auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>

          <button onClick={fetchMessages} className="refresh-btn" disabled={loading}>
            {loading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
          <button onClick={fetchMessages}>Retry</button>
        </div>
      )}

      {loading && messages.length === 0 ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>{labels.loadingLabel}</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🌤️</div>
          <h3>{labels.noAlertsLabel}</h3>
          <p>No extreme weather conditions detected at this time.</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="messages-grid">
          {messages.map((message) => (
            <MessageCard key={message.id} message={message} />
          ))}
        </div>
      ) : viewMode === 'phone' ? (
        <PhoneView messages={messages} />
      ) : viewMode === 'map' ? (
        <MapView messages={messages} />
      ) : null}
    </div>
  );
}

export default Dashboard;
