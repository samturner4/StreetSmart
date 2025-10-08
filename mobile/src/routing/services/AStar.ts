/**
 * A* search implementation ported from web routing system
 * Handles pathfinding with safety optimization
 */

import { RoutingGraph, GraphNode, RoutingError } from '../types';
import { calculateDistance } from '../utils/distance';
import { PriorityQueue } from '../utils/PriorityQueue';
import { isWithinEllipticalCorridor } from './GraphSearch';

// Constants from web routing (ported)
const SAFETY_IMPORTANCE = 10.0;

/**
 * A* search implementation
 * Ported from web routing system with mobile optimizations
 */
export function aStarSearch(
  graph: RoutingGraph,
  startNode: GraphNode,
  endNode: GraphNode,
  maxAllowedDistance: number,
  shortestDistance: number
): GraphNode[] | null {
  const aStarStartTime = Date.now();
  
  const openSet = new PriorityQueue<string>(); // nodeId -> fScore
  openSet.enqueue(startNode.id, 0);

  // Track visited nodes to prevent cycles
  const closedSet = new Set<string>();

  // Distance travelled so far in metres for each node
  const gDistance = new Map<string, number>();
  gDistance.set(startNode.id, 0);

  // Combined cost (distance ratio + safety penalty) from start to node
  const gScore = new Map<string, number>();
  gScore.set(startNode.id, 0);

  const fScore = new Map<string, number>(); // Estimated total cost
  fScore.set(startNode.id, calculateDistance(startNode.lat, startNode.lon, endNode.lat, endNode.lon));

  const cameFrom = new Map<string, { nodeId: string; edgeId: string }>();

  // Cache for safety scores - avoid recalculating entire path
  const safetyCache = new Map<string, { safetySum: number; lengthSum: number }>();
  safetyCache.set(startNode.id, { safetySum: 0, lengthSum: 0 });

  // Track iterations for debugging
  let iterations = 0;
  
  // Calculate corridor width based on route length (adaptive boundary sizing)
  const directDistance = calculateDistance(startNode.lat, startNode.lon, endNode.lat, endNode.lon);
  const corridorWidth = Math.max(directDistance * 0.3, 200); // 30% of direct distance, minimum 200m

  while (!openSet.isEmpty()) {
    iterations++;
    
    // Mobile optimization: limit iterations to prevent hanging
    if (iterations > 10000) {
      console.warn(`A* search exceeded iteration limit (${iterations})`);
      return null;
    }
    
    const current = openSet.dequeue()!;

    // Skip if already processed
    if (closedSet.has(current)) {
      continue;
    }

    // Mark as processed
    closedSet.add(current);

    if (current === endNode.id) {
      console.log(`✅ A* found path in ${iterations} iterations, ${Date.now() - aStarStartTime}ms`);
      
      // Reconstruct path
      const path: GraphNode[] = [];
      const visited = new Set<string>(); // Prevent cycles in path reconstruction
      let node = graph.nodes.get(current)!;
      
      while (node && path.length < 1000) { // Max 1000 nodes to prevent infinite loops
        // Check for cycles before adding node
        if (visited.has(node.id)) {
          console.error(`❌ Cycle detected in path reconstruction at node ${node.id}`);
          return null;
        }
        
        visited.add(node.id);
        path.unshift(node);
        
        const prev = cameFrom.get(node.id);
        if (prev) {
          node = graph.nodes.get(prev.nodeId)!;
        } else {
          break;
        }
      }
      
      if (path.length >= 1000) {
        console.error(`❌ Path too long in reconstruction: ${path.length} nodes`);
        return null;
      }
      
      console.log(`✅ Reconstructed path with ${path.length} nodes`);
      return path;
    }

    // Explore neighbors
    for (const neighborId of graph.adjacencyList.get(current) || new Set<string>()) {
      // O(1) edge lookup - check both directions
      const edgeKey = `${current}->${neighborId}`;
      const edgeId = graph.edgeLookup.get(edgeKey);

      if (!edgeId) continue;
      const edge = graph.edges.get(edgeId)!;

      // Elliptical corridor boundary check - skip nodes outside the corridor
      const neighborNode = graph.nodes.get(neighborId)!;
      
      // Check if neighbor is within the elliptical corridor
      if (!isWithinEllipticalCorridor(
        neighborNode.lat, 
        neighborNode.lon, 
        startNode.lat, 
        startNode.lon, 
        endNode.lat, 
        endNode.lon, 
        corridorWidth
      )) {
        continue; // Skip this neighbor entirely
      }

      // Actual distance travelled if we step onto this edge
      const tentativeDistance = gDistance.get(current)! + edge.properties.length_meters;

      // Mobile optimization: skip if distance exceeds limit early
      if (tentativeDistance > maxAllowedDistance) {
        continue;
      }

      // Re-compute distance cost relative to the fastest path length
      const distanceCost = tentativeDistance / shortestDistance; // 1 for shortest path

      // Use cached safety data instead of recalculating entire path
      const currentSafetyData = safetyCache.get(current)!;
      const newSafetySum = currentSafetyData.safetySum + (edge.properties.safety_score * edge.properties.length_meters);
      const newLengthSum = currentSafetyData.lengthSum + edge.properties.length_meters;
      const avgSafetyScore = newSafetySum / newLengthSum;
      const avgSafetyCost = (5 - avgSafetyScore) / 4; // 0 (best) – 1 (worst)

      // Combined cost we will accumulate for this path
      const combinedCost = distanceCost + SAFETY_IMPORTANCE * (avgSafetyCost ** 2);

      if (!gScore.has(neighborId) || combinedCost < gScore.get(neighborId)!) {
        // Only set parent the first time to avoid cycles
        if (!cameFrom.has(neighborId)) {
          cameFrom.set(neighborId, { nodeId: current, edgeId });
        }
        
        // Update distance & combined cost tables
        gDistance.set(neighborId, tentativeDistance);
        gScore.set(neighborId, combinedCost);

        // Cache the safety data for this neighbor
        safetyCache.set(neighborId, { safetySum: newSafetySum, lengthSum: newLengthSum });

        // Calculate heuristic (optimistic) in the same units
        const distanceHeuristic = calculateDistance(
          graph.nodes.get(neighborId)!.lat,
          graph.nodes.get(neighborId)!.lon,
          endNode.lat,
          endNode.lon
        ) / shortestDistance;

        const safetyHeuristic = (5 - edge.properties.safety_score) / 4;
        
        // More aggressive heuristic for mobile performance (multiply by 1.5)
        // This prioritizes promising paths more strongly, reducing exploration
        const heuristicCost = (distanceHeuristic + SAFETY_IMPORTANCE * (safetyHeuristic ** 2)) * 1.5;

        const totalCost = combinedCost + heuristicCost;

        fScore.set(neighborId, totalCost);
        openSet.enqueue(neighborId, totalCost);
      }
    }
  }

  console.log(`❌ A* search failed after ${iterations} iterations, ${Date.now() - aStarStartTime}ms`);
  return null;
}


