import { 
  SafeRouteResult, 
  RouteSegment, 
  PathSegment, 
  LineString, 
  Coordinate 
} from '../types';
import { GeometryBuilder } from './GeometryBuilder';

export class RouteFormatter {
  /**
   * Converts internal path format to MapLibre-compatible route format
   */
  static formatRoute(
    path: PathSegment[],
    geometry: LineString,
    includeDebug = false
  ): SafeRouteResult {
    // Calculate overall safety score (weighted by segment length)
    let totalSafetyScore = 0;
    let totalDistance = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const segment = path[i];
      if (segment.edge) {
        const length = segment.edge.properties.length_meters;
        totalSafetyScore += segment.edge.properties.safety_score * length;
        totalDistance += length;
      }
    }

    const avgSafetyScore = totalDistance > 0 ? totalSafetyScore / totalDistance : 3;
    const normalizedSafetyScore = Math.round(((avgSafetyScore - 1) / 4) * 100);

    // Calculate metadata
    const { total_distance, estimated_duration } = GeometryBuilder.calculateRouteMetadata(geometry);

    // Convert geometry to waypoints
    const waypoints = GeometryBuilder.geometryToWaypoints(geometry);

    // Create route segments with safety scores
    const segments: RouteSegment[] = this.createRouteSegments(path, geometry);

    // Build response
    const result: SafeRouteResult = {
      waypoints,
      safety_score: avgSafetyScore,
      normalized_safety_score: normalizedSafetyScore,
      total_distance,
      estimated_duration,
      segments,
      geometry
    };

    // Add debug data if requested
    if (includeDebug) {
      const startNode = path[0].node;
      const endNode = path[path.length - 1].node;
      
      result.debug = {
        original_points: [
          { latitude: startNode.lat, longitude: startNode.lon },
          { latitude: endNode.lat, longitude: endNode.lon }
        ],
        snapped_points: path.map(p => ({
          latitude: p.node.lat,
          longitude: p.node.lon
        })),
        centerline_geometry: geometry
      };
    }

    return result;
  }

  /**
   * Creates detailed route segments with safety information
   */
  private static createRouteSegments(
    path: PathSegment[],
    geometry: LineString
  ): RouteSegment[] {
    const segments: RouteSegment[] = [];
    let currentSegment: RouteSegment | null = null;
    let segmentStart = 0;

    // Group consecutive edges with same safety score
    for (let i = 0; i < path.length - 1; i++) {
      const segment = path[i];
      if (!segment.edge) continue;

      const safetyScore = segment.edge.properties.safety_score;
      const streetName = segment.edge.properties.street_name;

      if (!currentSegment || 
          currentSegment.safety_score !== safetyScore ||
          currentSegment.street_name !== streetName) {
        
        // If we have a current segment, add it
        if (currentSegment) {
          segments.push(currentSegment);
        }

        // Start new segment
        currentSegment = {
          coordinates: [],
          safety_score: safetyScore,
          street_name: streetName
        };
        segmentStart = i;
      }

      // Add coordinates to current segment
      if (currentSegment && segment.edge.properties.geometry) {
        const coords = segment.edge.properties.geometry.coordinates;
        currentSegment.coordinates.push(...coords.map(([lon, lat]): Coordinate => ({
          latitude: lat,
          longitude: lon
        })));
      }
    }

    // Add final segment
    if (currentSegment) {
      segments.push(currentSegment);
    }

    return segments;
  }

  /**
   * Formats a distance in meters to a human-readable string
   */
  static formatDistance(meters: number): string {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  }

  /**
   * Formats duration in minutes to a human-readable string
   */
  static formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}min`;
  }
}


