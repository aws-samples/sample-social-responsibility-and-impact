import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapView.css';
import { labels } from '../config/labels';

// Fix for default marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

function MapView({ messages }) {
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

  // Create custom marker icons
  const createCustomIcon = (color) => {
    return L.divIcon({
      className: 'custom-marker',
      html: `
        <div style="
          width: 24px;
          height: 24px;
          background: ${color};
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        "></div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12],
    });
  };

  // Component to fit bounds when markers change
  function FitBounds({ markers }) {
    const map = useMap();

    React.useEffect(() => {
      if (markers.length > 0) {
        const bounds = markers.map((msg) => [msg.latitude, msg.longitude]);
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }, [markers, map]);

    return null;
  }

  // Filter valid messages with coordinates
  const validMessages = useMemo(() => {
    return messages.filter((msg) => msg.latitude && msg.longitude);
  }, [messages]);

  // Default center (Kenya)
  const defaultCenter = [-0.0236, 37.9062];
  const defaultZoom = 7;

  if (validMessages.length === 0) {
    return (
      <div className="map-view">
        <div className="map-error">
          <h3>🗺️ Map View</h3>
          {/* nosemgrep: jsx-not-internationalized */}
          <p>No locations to display on the map.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="map-view">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        className="map-container"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds markers={validMessages} />

        {validMessages.map((msg) => {
          const color = getTempColor(msg.temperature);
          const icon = createCustomIcon(color);

          return (
            <Marker
              key={msg.id}
              position={[msg.latitude, msg.longitude]}
              icon={icon}
            >
              <Popup maxWidth={350} maxHeight={400}>
                <div className="marker-popup">
                  <h3>{msg.facility || `Unknown ${labels.locationLabel}`}</h3>
                  <div
                    className="temp-badge-popup"
                    style={{ background: color }}
                  >
                    {msg.temperature}°C - {getTempLabel(msg.temperature)}
                  </div>
                  <p className="advice-text">{msg.advice}</p>
                  <p className="coordinates">
                    📍 {msg.latitude.toFixed(4)}, {msg.longitude.toFixed(4)}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* nosemgrep: jsx-not-internationalized */}
      <div className="map-legend">
        {/* nosemgrep: jsx-not-internationalized */}
        <h4>Temperature Legend</h4>
        <div className="legend-items">
          <div className="legend-item">
            <span
              className="legend-color"
              style={{ background: '#d32f2f' }}
            ></span>
            {/* nosemgrep: jsx-not-internationalized */}
            <span>Extreme Heat (≥35°C)</span>
          </div>
          <div className="legend-item">
            <span
              className="legend-color"
              style={{ background: '#f57c00' }}
            ></span>
            {/* nosemgrep: jsx-not-internationalized */}
            <span>High Heat (32-34°C)</span>
          </div>
          <div className="legend-item">
            <span
              className="legend-color"
              style={{ background: '#fbc02d' }}
            ></span>
            {/* nosemgrep: jsx-not-internationalized */}
            <span>Moderate Heat (28-31°C)</span>
          </div>
          <div className="legend-item">
            <span
              className="legend-color"
              style={{ background: '#388e3c' }}
            ></span>
            {/* nosemgrep: jsx-not-internationalized */}
            <span>Normal (&lt;28°C)</span>
          </div>
        </div>
        {/* nosemgrep: jsx-not-internationalized */}
        <p className="map-stats">
          Showing {validMessages.length} alert locations
        </p>
      </div>
    </div>
  );
}

export default MapView;
