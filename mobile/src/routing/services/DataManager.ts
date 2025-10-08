import { RoutingGraph, GraphNode, GraphEdge, RoutingError } from '../types';

interface SerializedRoutingGraph {
  nodes: [string, GraphNode][];
  edges: [string, GraphEdge][];
  adjacencyList: [string, string[]][];
}

export class DataManager {
  private static routingGraphCache: RoutingGraph | null = null;
  private static walkableAreasCache: Map<string, boolean> | null = null;

  static async loadRoutingGraph(): Promise<RoutingGraph> {
    try {
      if (this.routingGraphCache) return this.routingGraphCache;

      // Load JSON bundled by Metro – require returns the parsed object in React Native
      console.log('🔍 [DataManager] About to require routing-graph.json...');
      const graphData: SerializedRoutingGraph = require('../data/routing-graph.json');
      console.log('✅ [DataManager] routing-graph.json loaded successfully');

      const nodes = new Map(graphData.nodes) as Map<string, GraphNode>;
      const edges = new Map(graphData.edges) as Map<string, GraphEdge>;
      const adjacencyList = new Map(
        graphData.adjacencyList.map(([k, v]) => [k, new Set(v)])
      ) as Map<string, Set<string>>;

      const edgeLookup = new Map<string, string>();
      for (const [edgeId, edge] of edges) {
        edgeLookup.set(`${edge.sourceId}->${edge.targetId}`, edgeId);
        edgeLookup.set(`${edge.targetId}->${edge.sourceId}`, edgeId);
      }

      this.routingGraphCache = { nodes, edges, adjacencyList, edgeLookup };
      return this.routingGraphCache;
    } catch (error) {
      throw new RoutingError('Failed to load routing graph', 'DATA_LOADING_ERROR');
    }
  }

  static async loadWalkableAreas(): Promise<Map<string, boolean>> {
    try {
      if (this.walkableAreasCache) return this.walkableAreasCache;
      const walkableArray: string[] = require('../data/walkable-areas.json');
      const map = new Map<string, boolean>();
      walkableArray.forEach(k => map.set(k, true));
      this.walkableAreasCache = map;
      return map;
    } catch {
      throw new RoutingError('Failed to load walkable areas', 'DATA_LOADING_ERROR');
    }
  }

  static clearCache() {
    this.routingGraphCache = null;
    this.walkableAreasCache = null;
  }

  static getCacheStatus() {
    return {
      routingGraphLoaded: !!this.routingGraphCache,
      walkableAreasLoaded: !!this.walkableAreasCache,
    };
  }
}
