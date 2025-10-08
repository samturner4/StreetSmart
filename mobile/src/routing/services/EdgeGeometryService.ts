import { GraphNode, GraphEdge, EdgeProperties, LineString, Coordinate } from '../types';
import { calculateDistance } from '../utils/distance';

/**
 * Interpolates points between two coordinates to create a smooth line
 */
function interpolatePoints(start: Coordinate, end: Coordinate, numPoints: number): Coordinate[] {
  const points: Coordinate[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    points.push({
      latitude: start.latitude + (end.latitude - start.latitude) * t,
      longitude: start.longitude + (end.longitude - start.longitude) * t
    });
  }
  return points;
}

/**
 * Determines how many interpolation points to use based on distance
 */
function calculateInterpolationPoints(distance: number): number {
  // Add more points for longer distances
  // 100m -> 2 points
  // 500m -> 5 points
  // 1000m -> 8 points
  return Math.min(Math.max(Math.floor(distance / 100) + 1, 2), 8);
}

/**
 * Enhances an edge with detailed geometry
 */
export function enhanceEdgeGeometry(edge: GraphEdge, sourceNode: GraphNode, targetNode: GraphNode): GraphEdge {
  // Convert nodes to coordinates
  const start: Coordinate = {
    latitude: sourceNode.lat,
    longitude: sourceNode.lon
  };
  
  const end: Coordinate = {
    latitude: targetNode.lat,
    longitude: targetNode.lon
  };

  // Calculate distance and determine interpolation points
  const distance = calculateDistance(start.latitude, start.longitude, end.latitude, end.longitude);
  const numPoints = calculateInterpolationPoints(distance);

  // Generate interpolated points
  // If the edge already has geometry, use it
  if (edge.properties.geometry) {
    return edge;
  }

  // Otherwise, create interpolated points
  const points = interpolatePoints(start, end, numPoints);

  // Create LineString geometry
  const geometry: LineString = {
    type: 'LineString',
    coordinates: points.map(p => [p.longitude, p.latitude]) // Convert to [lon, lat] format
  };

  // Return enhanced edge
  return {
    ...edge,
    properties: {
      ...edge.properties,
      geometry
    }
  };
}

/**
 * Enhances all edges in a graph with detailed geometry
 */
export function enhanceGraphGeometry(graph: Map<string, GraphEdge>, nodes: Map<string, GraphNode>): Map<string, GraphEdge> {
  const enhancedEdges = new Map<string, GraphEdge>();

  for (const [edgeId, edge] of graph.entries()) {
    const sourceNode = nodes.get(edge.sourceId);
    const targetNode = nodes.get(edge.targetId);

    if (!sourceNode || !targetNode) {
      console.error(`Missing nodes for edge ${edgeId}`);
      continue;
    }

    const enhancedEdge = enhanceEdgeGeometry(edge, sourceNode, targetNode);
    enhancedEdges.set(edgeId, enhancedEdge);
  }

  return enhancedEdges;
}

/**
 * Extracts geometry from a path of edges
 */
export function extractPathGeometry(
  path: GraphNode[],
  graph: Map<string, GraphEdge>,
  edgeLookup: Map<string, string>
): LineString {
  const coordinates: [number, number][] = [];

  // Process each consecutive pair of nodes
  for (let i = 0; i < path.length - 1; i++) {
    const currentNode = path[i];
    const nextNode = path[i + 1];

    // Find the edge between these nodes
    const edgeKey = `${currentNode.id}->${nextNode.id}`;
    const edgeId = edgeLookup.get(edgeKey);

    if (!edgeId) {
      console.error(`Missing edge between nodes ${currentNode.id} and ${nextNode.id}`);
      // Fall back to direct line if edge not found
      coordinates.push([currentNode.lon, currentNode.lat]);
      if (i === path.length - 2) {
        coordinates.push([nextNode.lon, nextNode.lat]);
      }
      continue;
    }

    const edge = graph.get(edgeId);
    if (!edge?.properties.geometry) {
      // Fall back to direct line if no geometry
      coordinates.push([currentNode.lon, currentNode.lat]);
      if (i === path.length - 2) {
        coordinates.push([nextNode.lon, nextNode.lat]);
      }
      continue;
    }

    // Add the edge's geometry coordinates
    // Only add the first point of each edge (except the first edge where we add all points)
    // This prevents duplicate points where edges meet
    if (i === 0) {
      coordinates.push(...edge.properties.geometry.coordinates);
    } else {
      coordinates.push(...edge.properties.geometry.coordinates.slice(1));
    }
  }

  return {
    type: 'LineString',
    coordinates
  };
}
