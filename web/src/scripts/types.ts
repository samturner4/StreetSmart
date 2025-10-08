import { RouteType } from './types/routing';

export interface GraphNode {
  id: string;
  lat: number;
  lon: number;
}

export interface EdgeWeights {
  quickest: number;    // Distance only (100% distance)
  balanced: number;    // 50% safety, 50% distance
  safest: number;     // 70% safety, 30% distance
  safetyOnly: number; // 100% safety, 0% distance
  detour5: number;    // 5% max detour
  detour10: number;   // 10% max detour
  detour15: number;   // 15% max detour
  detour20: number;   // 20% max detour
  detour25: number;   // 25% max detour
  detour30: number;   // 30% max detour
}

export interface EdgeProperties {
  safety_score: number;
  length_meters: number;
  weights: EdgeWeights;
  geometry: [number, number][];
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
  adjacencyList: Map<string, Set<string>>; // nodeId -> Set of connected nodeIds
  edgeLookup: Map<string, string>; // "node1->node2" -> edgeId for O(1) lookups
}