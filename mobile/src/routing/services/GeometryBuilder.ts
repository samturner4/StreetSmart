import { GraphNode, GraphEdge, LineString, Coordinate } from '../types';
import { calculateDistance } from '../utils/distance';
import { enhanceEdgeGeometry, extractPathGeometry } from './EdgeGeometryService';

export class GeometryBuilder {
  /**
   * Converts a path of nodes into a smooth GeoJSON LineString
   */
  static buildRouteGeometry(
    path: GraphNode[],
    graph: Map<string, GraphEdge>,
    edgeLookup: Map<string, string>
  ): LineString {
    const coordinates: [number, number][] = [];
    
    // Process each consecutive pair of nodes
    for (let i = 0; i < path.length - 1; i++) {
      const currentNode = path[i];
      const nextNode = path[i + 1];
      const edgeKey = `${currentNode.id}->${nextNode.id}`;
      const edgeId = edgeLookup.get(edgeKey);

      if (edgeId) {
        const edge = graph.get(edgeId);
        if (edge) {
          // Ensure edge has geometry
          const enhancedEdge = enhanceEdgeGeometry(edge, currentNode, nextNode);
          graph.set(edgeId, enhancedEdge);

          // Add all points from this edge's geometry
          if (enhancedEdge.properties.geometry) {
            // For first edge, add all points
            if (i === 0) {
              coordinates.push(...enhancedEdge.properties.geometry.coordinates);
            } else {
              // For subsequent edges, skip first point to avoid duplicates
              coordinates.push(...enhancedEdge.properties.geometry.coordinates.slice(1));
            }
          }
        }
      }

      // Fallback: direct line if no edge found
      if (coordinates.length === 0 || 
          coordinates[coordinates.length - 1][0] !== nextNode.lon || 
          coordinates[coordinates.length - 1][1] !== nextNode.lat) {
        coordinates.push([nextNode.lon, nextNode.lat]);
      }
    }

    return {
      type: 'LineString',
      coordinates
    };
  }

  /**
   * Calculates route metadata (distance, duration, etc.)
   */
  static calculateRouteMetadata(geometry: LineString) {
    let totalDistance = 0;
    const coordinates = geometry.coordinates;

    for (let i = 0; i < coordinates.length - 1; i++) {
      const [lon1, lat1] = coordinates[i];
      const [lon2, lat2] = coordinates[i + 1];
      totalDistance += calculateDistance(lat1, lon1, lat2, lon2);
    }

    // Estimate duration (assume 5 km/h walking speed)
    const estimatedDuration = Math.ceil((totalDistance / 5000) * 60); // minutes

    return {
      total_distance: totalDistance,
      estimated_duration: estimatedDuration
    };
  }

  /**
   * Converts a GeoJSON LineString to an array of waypoints
   */
  static geometryToWaypoints(geometry: LineString): Coordinate[] {
    return geometry.coordinates.map(([lon, lat]) => ({
      latitude: lat,
      longitude: lon
    }));
  }
}
