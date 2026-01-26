/**
 * UI Label Configuration
 * 
 * Centralizes all user-facing labels for easy customization.
 * Override via environment variables for different use cases.
 * 
 * Examples:
 * - Maternal Health: "Health Facility", "Mothers"
 * - Agriculture: "Farm", "Farmers"
 * - Construction: "Construction Site", "Site Managers"
 */

export const labels = {
  // Application branding
  appTitle: process.env.REACT_APP_TITLE || 'Weather Alert Dashboard',
  appSubtitle: process.env.REACT_APP_SUBTITLE || 'Personalized weather alerts powered by AI',
  
  // Recipient terminology
  recipientLabel: process.env.REACT_APP_RECIPIENT_LABEL || 'Recipients',
  recipientLabelSingular: process.env.REACT_APP_RECIPIENT_LABEL_SINGULAR || 'Recipient',
  
  // Location terminology
  locationLabel: process.env.REACT_APP_LOCATION_LABEL || 'Location',
  locationLabelPlural: process.env.REACT_APP_LOCATION_LABEL_PLURAL || 'Locations',
  
  // Message terminology
  messageLabel: process.env.REACT_APP_MESSAGE_LABEL || 'Personalized Message',
  adviceLabel: process.env.REACT_APP_ADVICE_LABEL || 'Weather Advisory',
  
  // Status and metadata
  temperatureLabel: process.env.REACT_APP_TEMPERATURE_LABEL || 'Max Temperature',
  dateLabel: process.env.REACT_APP_DATE_LABEL || 'Alert Date',
  
  // View mode labels
  cardViewLabel: 'Card View',
  phoneViewLabel: 'Phone View',
  mapViewLabel: 'Map View',
  
  // Action labels
  refreshLabel: 'Refresh',
  loadingLabel: 'Loading alerts...',
  noAlertsLabel: 'No alerts at this time',
  
  // Map labels
  mapTitle: process.env.REACT_APP_MAP_TITLE || 'Alert Locations',
  mapMarkerLabel: process.env.REACT_APP_MAP_MARKER_LABEL || 'Alert Location',
};

// Use case presets for easy configuration
export const useCasePresets = {
  'maternal-health': {
    appTitle: 'Maternal Health Weather Alerts',
    recipientLabel: 'Mothers',
    recipientLabelSingular: 'Mother',
    locationLabel: 'Health Facility',
    locationLabelPlural: 'Health Facilities',
    messageLabel: 'Health Advice',
    adviceLabel: 'Health Advisory',
  },
  
  'agriculture': {
    appTitle: 'Farm Weather Alerts',
    recipientLabel: 'Farmers',
    recipientLabelSingular: 'Farmer',
    locationLabel: 'Farm',
    locationLabelPlural: 'Farms',
    messageLabel: 'Farming Advice',
    adviceLabel: 'Weather Advisory',
  },
  
  'construction': {
    appTitle: 'Construction Site Weather Alerts',
    recipientLabel: 'Site Managers',
    recipientLabelSingular: 'Site Manager',
    locationLabel: 'Construction Site',
    locationLabelPlural: 'Construction Sites',
    messageLabel: 'Safety Advisory',
    adviceLabel: 'Weather Advisory',
  },
  
  'public-safety': {
    appTitle: 'Public Weather Alerts',
    recipientLabel: 'Citizens',
    recipientLabelSingular: 'Citizen',
    locationLabel: 'Area',
    locationLabelPlural: 'Areas',
    messageLabel: 'Safety Message',
    adviceLabel: 'Weather Warning',
  },
};

export default labels;
