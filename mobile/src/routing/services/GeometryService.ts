/**
 * Geometry Service
 * Handles route geometry generation from street centerlines
 */

import { Point, LineString, DetailedRoute, DetailedRouteSegment } from '../types/geometry';
import { calculateDistance, calculateBearing } from '../utils/distance';

export class GeometryService {
  /**
   * Convert a series of waypoints into detailed route geometry
   * Uses street centerlines to generate accurate path
   */
  static async generateRouteGeometry(waypoints: Point[]): Promise<DetailedRoute> {
    if (waypoints.length < 2) {
      throw new Error('Route must have at least 2 waypoints');
    }

    const segments: DetailedRouteSegment[] = [];
    let totalDistance = 0;
    let totalSafetyScore = 0;

    // Process each pair of waypoints
    for (let i = 0; i < waypoints.length - 1; i++) {
      const start = waypoints[i];
      const end = waypoints[i + 1];

      // For now, just create a direct line - we'll enhance this with centerlines
      const segment: DetailedRouteSegment = {
        geometry: {
          type: 'LineString',
          coordinates: [
            [start.longitude, start.latitude],
            [end.longitude, end.latitude]
          ]
        },
        safety_score: 5, // Placeholder - will come from street data
        length_meters: calculateDistance(
          start.latitude,
          start.longitude,
          end.latitude,
          end.longitude
        )
      };

      segments.push(segment);
      totalDistance += segment.length_meters;
      totalSafetyScore += segment.safety_score * segment.length_meters; // Weight by length
    }

    // Calculate average safety score weighted by segment length
    const avgSafetyScore = totalSafetyScore / totalDistance;
    
    // Normalize to 0-100 scale
    const normalizedSafetyScore = Math.round(((avgSafetyScore - 1) / 4) * 100);

    // Estimate duration: assume 5 km/h walking speed
    const estimatedDuration = Math.ceil((totalDistance / 5000) * 60);

    return {
      segments,
      total_distance: totalDistance,
      total_safety_score: avgSafetyScore,
      normalized_safety_score: normalizedSafetyScore,
      estimated_duration: estimatedDuration
    };
  }

  /**
   * Find the nearest point on a line segment to a given point
   * Used for snapping waypoints to street centerlines
   */
  static findNearestPointOnLine(
    point: Point,
    lineStart: Point,
    lineEnd: Point
  ): Point {
    const dx = lineEnd.longitude - lineStart.longitude;
    const dy = lineEnd.latitude - lineStart.latitude;
    
    if (dx === 0 && dy === 0) {
      return lineStart; // Degenerate line segment
    }

    // Calculate projection
    const t = (
      (point.longitude - lineStart.longitude) * dx +
      (point.latitude - lineStart.latitude) * dy
    ) / (dx * dx + dy * dy);

    // Clamp to line segment
    if (t < 0) return lineStart;
    if (t > 1) return lineEnd;

    // Interpolate
    return {
      longitude: lineStart.longitude + t * dx,
      latitude: lineStart.latitude + t * dy
    };
  }

  /**
   * Interpolate points along a line with a maximum spacing
   * Used to create smoother geometry
   */
  static interpolatePoints(
    start: Point,
    end: Point,
    maxSpacingMeters: number
  ): Point[] {
    const distance = calculateDistance(
      start.latitude,
      start.longitude,
      end.latitude,
      end.longitude
    );

    if (distance <= maxSpacingMeters) {
      return [start, end];
    }

    const numSegments = Math.ceil(distance / maxSpacingMeters);
    const points: Point[] = [start];

    for (let i = 1; i < numSegments; i++) {
      const t = i / numSegments;
      points.push({
        latitude: start.latitude + t * (end.latitude - start.latitude),
        longitude: start.longitude + t * (end.longitude - start.longitude)
      });
    }

    points.push(end);
    return points;
  }

  /**
   * Calculate the angle between three points in degrees
   * Used to detect sharp turns that need smoothing
   */
  static calculateTurnAngle(p1: Point, p2: Point, p3: Point): number {
    const bearing1 = calculateBearing(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
    const bearing2 = calculateBearing(p2.latitude, p2.longitude, p3.latitude, p3.longitude);
    
    let angle = Math.abs(bearing2 - bearing1);
    if (angle > 180) {
      angle = 360 - angle;
    }
    
    return angle;
  }
}



