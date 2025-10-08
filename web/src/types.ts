export interface GraphNode {
  id: string;
  lat: number;
  lon: number;
}

export interface EdgeProperties {
  safety_score: number;
  normalized_safety_score: number;
  length_meters: number;
  weight: number;
  street_name?: string;
  street_type?: string;
  geometry?: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  // Full centerline coordinates for the entire street segment (may include many points)
  full_geometry?: {
    type: 'LineString';
    coordinates: [number, number][];
  };
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
  adjacencyList: Map<string, Set<string>>; // Changed to Set<string> to match implementation
}