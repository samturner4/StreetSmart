/**
 * Main Routing Service - Mobile implementation
 * Uses server-side routing via API calls instead of local calculation
 */

import { RouteOptions, SafeRouteResult, RoutingError, RouteProgressCallback } from '../types';
import { validateAndCheckCoordinates, calculateDistance } from '../utils/distance';
import { MobileRoutingAPI, MobileRouteResponse } from './MobileRoutingAPI';

/**
 * Main routing function - finds safest route using server-side API
 * Replaces local A* calculation with web server calls
 */
export async function findSafestRoute(
  startLat: number, 
  startLon: number,
  endLat: number,
  endLon: number,
  options: RouteOptions = {},
  progressCallback?: RouteProgressCallback
): Promise<SafeRouteResult> {
  const startTime = Date.now();
  
  try {
    // Validate coordinates
    validateAndCheckCoordinates(startLat, startLon);
    validateAndCheckCoordinates(endLat, endLon);

    // Calculate straight-line distance for sanity checks
    const directDistance = calculateDistance(startLat, startLon, endLat, endLon);
    
    // If points are too close (less than 100m), just return direct path
    if (directDistance < 100) {
      progressCallback?.({
        stage: 'complete',
        progress: 100,
        message: 'Route too short, using direct path'
      });

      return {
        waypoints: [
          { longitude: startLon, latitude: startLat },
          { longitude: endLon, latitude: endLat }
        ],
        safety_score: 3
      };
    }

    // Call server-side routing API
    const routeResponse: MobileRouteResponse = await MobileRoutingAPI.getSafeRoute({
      startLat,
      startLon,
      endLat,
      endLon
    }, progressCallback);

    // Convert API response to mobile result format
    const result: SafeRouteResult = {
      waypoints: routeResponse.waypoints,
      safety_score: routeResponse.safety_score,
      // Add the new normalized safety score for mobile
      normalized_safety_score: routeResponse.normalized_safety_score,
      total_distance: routeResponse.total_distance,
      estimated_duration: routeResponse.estimated_duration
    };

    console.log(`✅ Server route completed in ${Date.now() - startTime}ms: ${routeResponse.waypoints.length} waypoints, ${routeResponse.total_distance}m, ${routeResponse.estimated_duration}min, safety: ${routeResponse.safety_score.toFixed(2)}/5 (${routeResponse.normalized_safety_score}/100)`);
    
    return result;

  } catch (error) {
    console.error('❌ Server routing error:', error);
    if (error instanceof RoutingError) {
      throw error;
    }
    throw new RoutingError(
      `Server routing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'DATA_LOADING_ERROR'
    );
  }
}
