// Core routing types ported from web
export interface GraphNode {
  id: string;
  lat: number;
  lon: number;
}

export interface EdgeProperties {
  safety_score: number;
  length_meters: number;
  weight: number;
  street_name?: string;
  street_type?: string;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  properties: EdgeProperties;
}

export interface RoutingGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  adjacencyList: Map<string, Set<string>>;
  edgeLookup: Map<string, string>; // "node1->node2" -> edgeId for O(1) lookups
}

// Mobile-specific route interfaces
export interface RouteSegment {
  coordinates: [number, number][];
  safety_score: number;
  street_name?: string;
}

export interface MobileRouteResult {
  path: GraphNode[];
  totalDistance: number;
  averageSafetyScore: number;
  segments: RouteSegment[];
  geometry: GeoJSON.LineString;
}

export interface RouteSegmentResult {
  street_name: string;
  safety_score: number;
  length_meters: number;
  geometry: GeoJSON.LineString;
}

export interface SafeRouteResult {
  waypoints: Array<{
    longitude: number;
    latitude: number;
  }>;
  safety_score: number;
  normalized_safety_score: number; // 1-100 scale for better precision
  total_distance: number; // meters
  estimated_duration: number; // minutes
  geometry: GeoJSON.LineString;
  segments: RouteSegmentResult[];
}

// Route calculation options
export interface RouteOptions {
  safetyWeight?: number; // 0-1, how much to prioritize safety vs distance (default: 0.7)
  maxDetourFactor?: number; // How much longer the route can be compared to shortest (default: 1.5)
}

// Route calculation progress callback
export interface RouteProgress {
  stage: 'loading_data' | 'finding_nodes' | 'calculating_path' | 'generating_geometry' | 'complete';
  progress: number; // 0-100
  message?: string;
}

export type RouteProgressCallback = (progress: RouteProgress) => void;
// Mobile-specific coordinate type
export interface Coordinate {
  latitude: number;
  longitude: number;
}

// Error types for routing
export class RoutingError extends Error {
  constructor(
    message: string,
    public code: 'COORDINATES_OUT_OF_BOUNDS' | 'NO_ROUTE_FOUND' | 'DATA_LOADING_ERROR' | 'INVALID_COORDINATES' | 'GRAPH_CONNECTIVITY_ERROR'
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}

