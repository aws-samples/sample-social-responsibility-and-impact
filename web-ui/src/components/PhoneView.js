import React, { useState } from 'react';
import './PhoneView.css';
import { labels } from '../config/labels';

function PhoneView({ messages }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (messages.length === 0) {
    return (
      <div className="phone-view-empty">
        <p>No messages to display</p>
      </div>
    );
  }

  const currentMessage = messages[currentIndex];

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : messages.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < messages.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="phone-view-container">
      <div className="phone-controls">
        <button onClick={handlePrevious} className="nav-btn">
          ← Previous
        </button>
        <span className="message-counter">
          Message {currentIndex + 1} of {messages.length}
        </span>
        <button onClick={handleNext} className="nav-btn">
          Next →
        </button>
      </div>

      <div className="phone-display">
        <div className="phone-frame">
          <div className="phone-notch"></div>
          <div className="phone-content">
            <div className="sms-header">
              <div className="contact-name">
                {currentMessage.facility || labels.appTitle}
              </div>
              <div className="contact-subtitle">
                📍 {currentMessage.facility || labels.adviceLabel}
              </div>
            </div>

            <div className="sms-messages">
              <div className="sms-bubble received">
                <div className="sms-text">{currentMessage.advice}</div>
                <div className="sms-meta">
                  <span className="temp-badge">
                    🌡️ {currentMessage.temperature}°C
                  </span>
                  <span className="time">Just now</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="message-details">
        <h3>Message Details</h3>
        <div className="detail-row">
          <span className="label">Facility:</span>
          <span className="value">{currentMessage.facility || 'Unknown'}</span>
        </div>
        <div className="detail-row">
          <span className="label">Temperature:</span>
          <span className="value">{currentMessage.temperature}°C</span>
        </div>
        <div className="detail-row">
          <span className="label">Location:</span>
          <span className="value">
            {currentMessage.latitude?.toFixed(3)}, {currentMessage.longitude?.toFixed(3)}
          </span>
        </div>
        {currentMessage.anc_pnc && (
          <div className="detail-row">
            <span className="label">Care Type:</span>
            <span className="value">{currentMessage.anc_pnc}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default PhoneView;
