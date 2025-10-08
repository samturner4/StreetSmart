import { GraphNode, GraphEdge, RoutingGraph } from '../types';
import { PriorityQueue } from '../utils/PriorityQueue';
import { calculateDistance } from '../utils/distance';

const SAFETY_IMPORTANCE = 10.0; // How strongly safety affects routing
const MAX_SAFETY_DETOUR = 1.3; // Allow 30% longer paths for safety
const MIN_ABSOLUTE_DETOUR = 100; // Minimum extra meters allowed

interface PathSegment {
  node: GraphNode;
  edge: GraphEdge | null;
  distance: number;
  safetyScore: number;
}

export class AStarService {
  /**
   * Enhanced A* search that tracks both nodes and edges
   */
  static findPath(
    graph: RoutingGraph,
    startNode: GraphNode,
    endNode: GraphNode,
    maxAllowedDistance: number,
    shortestDistance: number
  ): PathSegment[] | null {
    console.log(`🔍 A* search from ${startNode.id} to ${endNode.id}`);
    console.log(`Max allowed distance: ${maxAllowedDistance}m, Shortest: ${shortestDistance}m`);

    const openSet = new PriorityQueue<string>();
    openSet.enqueue(startNode.id, 0);

    const closedSet = new Set<string>();
    const gDistance = new Map<string, number>();
    gDistance.set(startNode.id, 0);

    const gScore = new Map<string, number>();
    gScore.set(startNode.id, 0);

    const fScore = new Map<string, number>();
    fScore.set(startNode.id, calculateDistance(
      startNode.lat, startNode.lon,
      endNode.lat, endNode.lon
    ));

    // Track both previous node and edge used
    const cameFrom = new Map<string, { nodeId: string; edgeId: string }>();

    // Cache safety scores
    const safetyCache = new Map<string, { safetySum: number; lengthSum: number }>();
    safetyCache.set(startNode.id, { safetySum: 0, lengthSum: 0 });

    while (!openSet.isEmpty()) {
      const current = openSet.dequeue()!;
      if (current === endNode.id) {
        return this.reconstructPath(graph, cameFrom, current);
      }

      closedSet.add(current);

      for (const neighborId of graph.adjacencyList.get(current) || new Set<string>()) {
        if (closedSet.has(neighborId)) continue;

        const edgeKey = `${current}->${neighborId}`;
        const edgeId = graph.edgeLookup.get(edgeKey);
        if (!edgeId) continue;

        const edge = graph.edges.get(edgeId)!;
        const neighborNode = graph.nodes.get(neighborId)!;

        const tentativeDistance = gDistance.get(current)! + edge.properties.length_meters;
        if (tentativeDistance > maxAllowedDistance) continue;

        const distanceCost = tentativeDistance / shortestDistance;

        // Calculate safety cost using cached values
        const currentSafetyData = safetyCache.get(current)!;
        const newSafetySum = currentSafetyData.safetySum + 
          (edge.properties.safety_score * edge.properties.length_meters);
        const newLengthSum = currentSafetyData.lengthSum + edge.properties.length_meters;
        const avgSafetyScore = newSafetySum / newLengthSum;
        const safetyCost = (5 - avgSafetyScore) / 4;

        const combinedCost = distanceCost + SAFETY_IMPORTANCE * (safetyCost ** 2);

        if (!gScore.has(neighborId) || combinedCost < gScore.get(neighborId)!) {
          cameFrom.set(neighborId, { nodeId: current, edgeId });
          gScore.set(neighborId, combinedCost);
          gDistance.set(neighborId, tentativeDistance);
          safetyCache.set(neighborId, { 
            safetySum: newSafetySum,
            lengthSum: newLengthSum
          });

          const heuristic = calculateDistance(
            neighborNode.lat, neighborNode.lon,
            endNode.lat, endNode.lon
          ) / shortestDistance;

          const f = combinedCost + heuristic;
          fScore.set(neighborId, f);

          openSet.enqueue(neighborId, f);
        }
      }
    }

    return null;
  }

  /**
   * Reconstructs the path including both nodes and edges used
   */
  private static reconstructPath(
    graph: RoutingGraph,
    cameFrom: Map<string, { nodeId: string; edgeId: string }>,
    current: string
  ): PathSegment[] {
    const path: PathSegment[] = [];
    let totalDistance = 0;
    let currentNode = current;

    while (cameFrom.has(currentNode)) {
      const { nodeId: prevNode, edgeId } = cameFrom.get(currentNode)!;
      const node = graph.nodes.get(currentNode)!;
      const edge = graph.edges.get(edgeId)!;

      totalDistance += edge.properties.length_meters;

      path.unshift({
        node,
        edge,
        distance: totalDistance,
        safetyScore: edge.properties.safety_score
      });

      currentNode = prevNode;
    }

    // Add start node
    path.unshift({
      node: graph.nodes.get(currentNode)!,
      edge: null,
      distance: 0,
      safetyScore: 0
    });

    return path;
  }

  /**
   * Calculates shortest path distance using Dijkstra's algorithm
   */
  static findShortestDistance(
    graph: RoutingGraph,
    startNode: GraphNode,
    endNode: GraphNode
  ): number {
    const open = new Map<string, number>();
    const dist = new Map<string, number>();
    open.set(startNode.id, 0);
    dist.set(startNode.id, 0);

    while (open.size > 0) {
      const [current, currentDist] = Array.from(open.entries())
        .reduce((a, b) => a[1] < b[1] ? a : b);

      if (current === endNode.id) return currentDist;
      open.delete(current);

      for (const neighborId of graph.adjacencyList.get(current) || new Set<string>()) {
        const edgeKey = `${current}->${neighborId}`;
        const edgeId = graph.edgeLookup.get(edgeKey);
        if (!edgeId) continue;

        const edge = graph.edges.get(edgeId)!;
        const tentative = currentDist + edge.properties.length_meters;

        if (!dist.has(neighborId) || tentative < dist.get(neighborId)!) {
          dist.set(neighborId, tentative);
          open.set(neighborId, tentative);
        }
      }
    }

    return Infinity;
  }
}
