import { GraphNode, GraphEdge, RoutingGraph } from '../types';

export class GraphBuilder {
  /**
   * Creates a fully connected graph with efficient lookups
   */
  static buildGraph(
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): RoutingGraph {
    // Create Maps from arrays
    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    const edgeMap = new Map(edges.map(edge => [edge.id, edge]));

    // Build adjacency list
    const adjacencyList = new Map<string, Set<string>>();
    const edgeLookup = new Map<string, string>();

    // Initialize empty sets for all nodes
    for (const node of nodes) {
      adjacencyList.set(node.id, new Set());
    }

    // Build bidirectional connections
    for (const edge of edges) {
      // Add to adjacency list (both directions)
      adjacencyList.get(edge.sourceId)?.add(edge.targetId);
      adjacencyList.get(edge.targetId)?.add(edge.sourceId);

      // Add to edge lookup (both directions)
      const key1 = `${edge.sourceId}->${edge.targetId}`;
      const key2 = `${edge.targetId}->${edge.sourceId}`;
      edgeLookup.set(key1, edge.id);
      edgeLookup.set(key2, edge.id);
    }

    return {
      nodes: nodeMap,
      edges: edgeMap,
      adjacencyList,
      edgeLookup
    };
  }

  /**
   * Validates graph connectivity
   */
  static validateGraph(graph: RoutingGraph): void {
    // Check all nodes have entries in adjacency list
    for (const nodeId of graph.nodes.keys()) {
      if (!graph.adjacencyList.has(nodeId)) {
        throw new Error(`Node ${nodeId} missing from adjacency list`);
      }
    }

    // Check all edges have valid nodes
    for (const edge of graph.edges.values()) {
      if (!graph.nodes.has(edge.sourceId)) {
        throw new Error(`Edge ${edge.id} references missing source node ${edge.sourceId}`);
      }
      if (!graph.nodes.has(edge.targetId)) {
        throw new Error(`Edge ${edge.id} references missing target node ${edge.targetId}`);
      }
    }

    // Check edge lookup consistency
    for (const [key, edgeId] of graph.edgeLookup) {
      if (!graph.edges.has(edgeId)) {
        throw new Error(`Edge lookup references missing edge ${edgeId}`);
      }
      const [sourceId, targetId] = key.split('->');
      if (!graph.adjacencyList.get(sourceId)?.has(targetId)) {
        throw new Error(`Edge lookup inconsistent with adjacency list: ${key}`);
      }
    }
  }
}


