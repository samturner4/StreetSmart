/**
 * Mobile Routing API Client
 * Handles communication with server-side routing API
 */

import { RouteProgressCallback } from '../types';
import { Point } from '../types/geometry';

interface RouteRequest {
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  routeType?: string; // 'quickest' | 'safest' | 'balanced' | detour variants
}

export interface MobileRouteResponse {
  // Route data
  waypoints: Point[];
  safety_score: number;
  normalized_safety_score: number;
  total_distance: number;
  estimated_duration: number;
  
  // Debug data (only in development)
  debug?: {
    original_points: Point[];
    snapped_points: Point[];
    centerline_geometry: {
      type: 'LineString';
      coordinates: [number, number][];
    };
  };
}

export class MobileRoutingAPI {
  private static readonly BASE_URL = __DEV__ 
    ? 'http://192.168.1.168:3001/api'  // Local development
    : 'https://api.walksafe.app/api';   // Production
  
  private static readonly TIMEOUT = 30000; // 30 seconds - routing can take longer for complex paths

  /**
   * Get safe route between two points
   */
  static async getSafeRoute(
    request: RouteRequest,
    progressCallback?: RouteProgressCallback
  ): Promise<MobileRouteResponse> {
    try {
      progressCallback?.({
        stage: 'loading_data',
        progress: 0,
        message: 'Connecting to routing server...'
      });

      const url = new URL(`${this.BASE_URL}/mobile-safe-route`);
      url.search = new URLSearchParams({
        startLat: request.startLat.toString(),
        startLon: request.startLon.toString(),
        endLat: request.endLat.toString(),
        endLon: request.endLon.toString(),
        routeType: request.routeType || 'safest',
        includeDebug: __DEV__ ? 'true' : 'false'
      }).toString();

      console.log('[MobileRoutingAPI] Request URL: ' + url.toString());

      const startTime = Date.now();
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

      try {
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Server returned ${response.status}: ${response.statusText}`);
        }

        const result: MobileRouteResponse = data;
        const duration = Date.now() - startTime;

        console.log(`[MobileRoutingAPI] Route received in ${duration}ms: ${result.waypoints.length} waypoints`);

        progressCallback?.({ stage: 'complete', progress: 100, message: 'Route calculated' });

        return result;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      console.error('[MobileRoutingAPI] Failed to fetch route:', error);
      throw error;
    }
  }
}