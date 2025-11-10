import React from 'react';
import './MessageCard.css';
import { labels } from '../config/labels';

function MessageCard({ message }) {
  const { advice, temperature, facility, language, latitude, longitude } = message;

  const getTempColor = (temp) => {
    if (temp >= 35) return '#d32f2f';
    if (temp >= 32) return '#f57c00';
    if (temp >= 28) return '#fbc02d';
    return '#388e3c';
  };

  const getTempLabel = (temp) => {
    if (temp >= 35) return 'Extreme Heat';
    if (temp >= 32) return 'High Heat';
    if (temp >= 28) return 'Moderate Heat';
    return 'Normal';
  };

  return (
    <div className="message-card">
      <div className="card-header">
        <div className="temp-badge" style={{ background: getTempColor(temperature) }}>
          <span className="temp-value">{temperature}°C</span>
          <span className="temp-label">{getTempLabel(temperature)}</span>
        </div>
        <div className="facility-info">
          <span className="facility-name">{facility || `Unknown ${labels.locationLabel}`}</span>
          <span className="location">
            📍 {latitude?.toFixed(3)}, {longitude?.toFixed(3)}
          </span>
        </div>
      </div>

      <div className="card-body">
        <div className="advice-text">{advice}</div>
      </div>

      <div className="card-footer">
        <button className="view-map-btn" onClick={() => {
          window.open(`https://www.google.com/maps?q=${latitude},${longitude}`, '_blank');
        }}>
          View on Map
        </button>
      </div>
    </div>
  );
}

export default MessageCard;
