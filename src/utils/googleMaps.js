/**
 * Google Maps Utility
 * Helper functions for Google Maps integration
 */

/**
 * Generate Google Maps URL from coordinates
 * @param {Array<number>} coordinates - [longitude, latitude]
 * @returns {string} Google Maps URL
 */
const generateGoogleMapsUrl = (coordinates) => {
  if (!coordinates || coordinates.length !== 2) {
    return null;
  }
  
  const [lng, lat] = coordinates;
  
  // Validate coordinates
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    return null;
  }
  
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    return null;
  }
  
  return `https://www.google.com/maps?q=${lat},${lng}`;
};

/**
 * Generate Google Maps directions URL
 * @param {Array<number>} fromCoords - Origin [longitude, latitude]
 * @param {Array<number>} toCoords - Destination [longitude, latitude]
 * @returns {string} Google Maps directions URL
 */
const generateDirectionsUrl = (fromCoords, toCoords) => {
  if (!fromCoords || !toCoords || fromCoords.length !== 2 || toCoords.length !== 2) {
    return null;
  }
  
  const [fromLng, fromLat] = fromCoords;
  const [toLng, toLat] = toCoords;
  
  return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}`;
};

/**
 * Generate Google Maps embed URL
 * @param {Array<number>} coordinates - [longitude, latitude]
 * @param {number} zoom - Zoom level (1-20)
 * @returns {string} Google Maps embed URL (requires API key to use)
 */
const generateEmbedUrl = (coordinates, zoom = 15) => {
  if (!coordinates || coordinates.length !== 2) {
    return null;
  }
  
  const [lng, lat] = coordinates;
  
  return `https://www.google.com/maps/embed/v1/place?key=YOUR_API_KEY&q=${lat},${lng}&zoom=${zoom}`;
};

/**
 * Parse coordinates from Google Maps URL
 * @param {string} url - Google Maps URL
 * @returns {Array<number>|null} [longitude, latitude] or null
 */
const parseCoordinatesFromUrl = (url) => {
  if (!url) return null;
  
  // Match patterns like: ?q=30.0444,31.2357 or @30.0444,31.2357
  const patterns = [
    /[?&]q=([-\d.]+),([-\d.]+)/,
    /@([-\d.]+),([-\d.]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        return [lng, lat]; // Return in GeoJSON format
      }
    }
  }
  
  return null;
};

export {
  generateGoogleMapsUrl,
  generateDirectionsUrl,
  generateEmbedUrl,
  parseCoordinatesFromUrl
};
