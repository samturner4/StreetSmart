import { Coordinate } from '../types';

// DC bounding box (copied from web routing)
export const DC_BOUNDS = {
  north: 38.995,
  south: 38.791,
  east: -76.909,
  west: -77.119
};

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Check if a point is within an elliptical corridor between start and end points
 * Used by A* algorithm to limit search space
 */
export function isWithinEllipticalCorridor(
  pointLat: number, 
  pointLon: number, 
  startLat: number, 
  startLon: number, 
  endLat: number, 
  endLon: number, 
  corridorWidth: number
): boolean {
  // Calculate the direct distance between start and end
  const directDistance = calculateDistance(startLat, startLon, endLat, endLon);
  
  // Calculate distances from point to start and end
  const distanceToStart = calculateDistance(pointLat, pointLon, startLat, startLon);
  const distanceToEnd = calculateDistance(pointLat, pointLon, endLat, endLon);
  
  // For an ellipse: sum of distances to foci (start/end) must be <= major axis
  // Major axis = direct distance + corridor width
  // Minor axis = corridor width
  const majorAxis = directDistance + corridorWidth;
  
  // Check if point is within ellipse
  return (distanceToStart + distanceToEnd) <= majorAxis;
}

/**
 * Check if coordinates are within DC bounds
 */
export function isWithinDC(lat: number, lon: number): boolean {
  return lat >= DC_BOUNDS.south && 
         lat <= DC_BOUNDS.north && 
         lon >= DC_BOUNDS.west && 
         lon <= DC_BOUNDS.east;
}

/**
 * Validate coordinate format and ranges, and check if within DC
 */
export function validateAndCheckCoordinates(lat: number, lon: number): void {
  const validation = validateCoordinates(lat, lon);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }
  if (!isWithinDC(lat, lon)) {
    throw new Error('Coordinates must be within DC bounds');
  }
}

/**
 * Validate coordinate format and ranges
 */
export function validateCoordinates(lat: number, lon: number): { isValid: boolean; error?: string } {
  // Check if coordinates are numbers
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return { isValid: false, error: 'Coordinates must be numbers' };
  }

  // Check for NaN
  if (isNaN(lat) || isNaN(lon)) {
    return { isValid: false, error: 'Coordinates cannot be NaN' };
  }

  // Check latitude range
  if (lat < -90 || lat > 90) {
    return { isValid: false, error: 'Latitude must be between -90 and 90' };
  }

  // Check longitude range
  if (lon < -180 || lon > 180) {
    return { isValid: false, error: 'Longitude must be between -180 and 180' };
  }

  return { isValid: true };
}

/**
 * Convert coordinate object to lat/lon numbers
 */
export function coordinateToNumbers(coord: Coordinate): [number, number] {
  return [coord.latitude, coord.longitude];
}

/**
 * Convert lat/lon numbers to coordinate object
 */
export function numbersToCoordinate(lat: number, lon: number): Coordinate {
  return { latitude: lat, longitude: lon };
}

/**
 * Calculate bearing between two points (in degrees)
 * Useful for routing optimization
 */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360; // Normalize to 0-360 degrees
}

/**
 * Format distance for display (human readable)
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  } else {
    const km = meters / 1000;
    return `${km.toFixed(1)} km`;
  }
}

/**
 * Format duration for display (human readable)
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Create a bounding box around a point (useful for spatial queries)
 */
export function createBoundingBox(
  centerLat: number, 
  centerLon: number, 
  radiusMeters: number
): {
  north: number;
  south: number;
  east: number;
  west: number;
} {
  // Approximate degrees per meter (this is rough but good enough for bounding boxes)
  const latDegreesPerMeter = 1 / 111000; // Roughly 111km per degree latitude
  const lonDegreesPerMeter = 1 / (111000 * Math.cos(centerLat * Math.PI / 180)); // Adjust for longitude
  
  const latRadius = radiusMeters * latDegreesPerMeter;
  const lonRadius = radiusMeters * lonDegreesPerMeter;
  
  return {
    north: centerLat + latRadius,
    south: centerLat - latRadius,
    east: centerLon + lonRadius,
    west: centerLon - lonRadius
  };
}
