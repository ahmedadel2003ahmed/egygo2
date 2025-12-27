/**
 * Haversine formula utility for calculating distance between GPS coordinates
 * Returns distance in kilometers
 */

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {Number} lat1 - Latitude of first point (decimal degrees)
 * @param {Number} lon1 - Longitude of first point (decimal degrees)
 * @param {Number} lat2 - Latitude of second point (decimal degrees)
 * @param {Number} lon2 - Longitude of second point (decimal degrees)
 * @returns {Number} Distance in kilometers
 * 
 * @example
 * // Calculate distance between Cairo and Alexandria
 * const distance = calculateDistance(30.0444, 31.2357, 31.2001, 29.9187);
 * // Returns approximately 179.5 km
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  // Earth's radius in kilometers
  const R = 6371;

  // Convert degrees to radians
  const toRad = (degrees) => degrees * (Math.PI / 180);

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  // Haversine formula
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c;

  return distance;
};

/**
 * Calculate total distance for a route with multiple waypoints
 * @param {Array<{lat: Number, lon: Number}>} coordinates - Array of {lat, lon} objects
 * @returns {Number} Total distance in kilometers
 * 
 * @example
 * const route = [
 *   { lat: 30.0444, lon: 31.2357 }, // Cairo
 *   { lat: 30.0131, lon: 31.2089 }, // Giza
 *   { lat: 31.2001, lon: 29.9187 }  // Alexandria
 * ];
 * const totalDistance = calculateRouteDistance(route);
 */
export const calculateRouteDistance = (coordinates) => {
  if (!coordinates || coordinates.length < 2) {
    return 0;
  }

  let totalDistance = 0;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const { lat: lat1, lon: lon1 } = coordinates[i];
    const { lat: lat2, lon: lon2 } = coordinates[i + 1];

    totalDistance += calculateDistance(lat1, lon1, lat2, lon2);
  }

  return totalDistance;
};
