import { NextResponse } from 'next/server';
import dotenv from 'dotenv';
import cliProgress from 'cli-progress';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// DC bounding box for validation
const DC_BOUNDS = {
  north: 38.995,
  south: 38.791,
  east: -76.909,
  west: -77.119
};

// Check if coordinates are within DC bounds
function isWithinDC(lat: number, lon: number): boolean {
  return lat >= DC_BOUNDS.south && lat <= DC_BOUNDS.north &&
         lon >= DC_BOUNDS.west && lon <= DC_BOUNDS.east;
}

// Check if a street segment is walkable using Mapbox API
export async function checkWalkability(
  startLat: number, 
  startLon: number, 
  endLat: number, 
  endLon: number
): Promise<boolean> {
  try {
    // Validate coordinates are within DC
    if (!isWithinDC(startLat, startLon) || !isWithinDC(endLat, endLon)) {
      console.warn(`Coordinates outside DC bounds: (${startLat}, ${startLon}) to (${endLat}, ${endLon})`);
      return false;
    }

    // Check if we have a Mapbox token
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN;
    if (!token) {
      console.error('Mapbox token not available for walkability check');
      return false;
    }

    // Test if there's a walkable route between the two points
    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${startLon},${startLat};${endLon},${endLat}?` +
      `geometries=geojson&` +
      `overview=simplified&` + // Use simplified for faster response
      `walkway_bias=0&` + // Bias towards street centerlines
      `exclude=ferry&` + // Exclude ferry routes
      `access_token=${token}`;

    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`Mapbox API error for walkability check: ${response.status}`);
      return false;
    }

    const data = await response.json();
    
    // Check if a route was found
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      
      // Route is walkable if:
      // 1. It has a valid distance (not 0)
      // 2. It's not too long (reasonable walking distance)
      // 3. It doesn't have extreme detours
      const distance = route.distance; // in meters
      const directDistance = calculateDistance(startLat, startLon, endLat, endLon) * 1000; // convert to meters
      
      // Check if route is reasonable
      if (distance > 0 && distance < 10000) { // Less than 10km
        const detourRatio = distance / directDistance;
        if (detourRatio < 3) { // Route shouldn't be more than 3x the direct distance
          return true;
        }
      }
    }
    
    return false;
    
  } catch (error) {
    console.error('Error checking walkability:', error);
    return false;
  }
}

// Check walkability for a single point (useful for validating street segments)
export async function checkPointWalkability(lat: number, lon: number): Promise<boolean> {
  try {
    // Test walkability by trying to route to a nearby point
    const testDistance = 0.001; // About 100 meters
    const testLat = lat + testDistance;
    const testLon = lon + testDistance;
    
    return await checkWalkability(lat, lon, testLat, testLon);
    
  } catch (error) {
    console.error('Error checking point walkability:', error);
    return false;
  }
}

// Batch check walkability for multiple street segments
export async function checkBatchWalkability(
  segments: Array<{ lat: number, lon: number, endLat?: number, endLon?: number }>
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  
  // Process in batches to avoid overwhelming the API
  const BATCH_SIZE = 3; // Reduced from 10 to 3
  const DELAY_BETWEEN_BATCHES = 3000; // Increased from 1 second to 3 seconds
  
  // Initialize progress bar
  const progressBar = new cliProgress.SingleBar({
    format: 'Walkability Check [{bar}] {percentage}% | {value}/{total} segments | ETA: {eta}s | Rate: {rate} segments/s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });
  
  console.log(`Starting walkability check for ${segments.length} segments...`);
  progressBar.start(segments.length, 0);
  
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);
    
    // Process batch sequentially to avoid rate limits
    for (let j = 0; j < batch.length; j++) {
      const segment = batch[j];
      const segmentId = `${i + j}`;
      
      if (segment.endLat && segment.endLon) {
        // Check walkability between two points
        const isWalkable = await checkWalkability(
          segment.lat, segment.lon, segment.endLat, segment.endLon
        );
        results.set(segmentId, isWalkable);
      } else {
        // Check walkability for single point
        const isWalkable = await checkPointWalkability(segment.lat, segment.lon);
        results.set(segmentId, isWalkable);
      }
      
             // Add small delay between individual calls
       if (j < batch.length - 1) {
         await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between calls
       }
       
       // Update progress bar
       progressBar.increment();
     }
     
     // Add delay between batches to respect API limits
     if (i + BATCH_SIZE < segments.length) {
       await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
     }
   }
   
   progressBar.stop();
   console.log(`\nWalkability check completed! Processed ${segments.length} segments.`);
   
   return results;
}

// Helper function to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Cache walkability results to avoid repeated API calls
const walkabilityCache = new Map<string, boolean>();

// Cached version of walkability check
export async function checkWalkabilityCached(
  startLat: number, 
  startLon: number, 
  endLat: number, 
  endLon: number
): Promise<boolean> {
  const cacheKey = `${startLat.toFixed(6)},${startLon.toFixed(6)}-${endLat.toFixed(6)},${endLon.toFixed(6)}`;
  
  if (walkabilityCache.has(cacheKey)) {
    return walkabilityCache.get(cacheKey)!;
  }
  
  const result = await checkWalkability(startLat, startLon, endLat, endLon);
  walkabilityCache.set(cacheKey, result);
  
  return result;
}

// Clear cache (useful for testing or when data changes)
export function clearWalkabilityCache(): void {
  walkabilityCache.clear();
} 