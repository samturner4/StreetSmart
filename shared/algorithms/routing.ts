import { RoutingGraph, GraphNode, GraphEdge, EdgeProperties } from './types';
import fs from 'fs';
import * as pathModule from 'path';

// DC bounding box
const DC_BOUNDS = {
  north: 38.995,
  south: 38.791,
  east: -76.909,
  west: -77.119
};

// Constants for routing calculations
// Allow safest route to be at most 30% longer than the purely-fast shortest path
const MAX_SAFETY_DETOUR = 1.3;
// Minimum extra meters we allow beyond the shortest-distance route so that very short
// trips can still take a safer parallel block.
const MIN_ABSOLUTE_DETOUR = 100; // meters

// Global tuning constant: how strongly safety affects cost relative to distance.
// distanceCost is ~1 for shortest-path, so a SAFETY_IMPORTANCE of 2 means a fully unsafe
// path (avgSafetyCost≈1) adds +2 to the cost (equivalent to doubling effective distance).
const SAFETY_IMPORTANCE = 10.0;

// ------------------------------
// Distance-only shortest path
// ------------------------------
function dijkstraDistance(
  graph: RoutingGraph,
  startNode: GraphNode,
  endNode: GraphNode
): number {
  const open = new Map<string, number>(); // nodeId -> dist
  const dist = new Map<string, number>();
  open.set(startNode.id, 0);
  dist.set(startNode.id, 0);

  while (open.size) {
    const [current, currentDist] = Array.from(open.entries()).reduce((a,b)=>a[1]<b[1]?a:b);
    if (current === endNode.id) return currentDist;
    open.delete(current);

    for (const neighborId of graph.adjacencyList.get(current) || new Set<string>()) {
      // O(1) edge lookup - check both directions
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
  // Fallback – shouldn't happen if graph is connected
  return Infinity;
}

interface RouteOptions {
  safetyWeight?: number; // 0-1, how much to prioritize safety vs distance (default: 0.7)
  maxDetourFactor?: number; // How much longer the route can be compared to shortest (default: 1.5)
}

interface RouteResult {
  path: string[]; // Array of node IDs representing the route
  totalDistance: number;
  averageSafetyScore: number;
  segments: Array<{
    nodeId: string;
    lat: number;
    lon: number;
    safetyScore: number;
    distanceFromStart: number;
  }>;
}

export interface SafeRouteResult {
  waypoints: Array<{
    longitude: number;
    latitude: number;
  }>;
  safety_score: number;
}

// Load the pre-built routing graph
function loadRoutingGraph(): RoutingGraph {
  const graphPath = pathModule.join(process.cwd(), 'data/streets/processed/routing-graph.json');
  const graphData = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
  
  const nodes = new Map(graphData.nodes) as Map<string, GraphNode>;
  const edges = new Map(graphData.edges) as Map<string, GraphEdge>;
  const adjacencyList = new Map(
    graphData.adjacencyList.map(([key, value]: [string, string[]]) => [key, new Set(value)])
  ) as Map<string, Set<string>>;
  
  // Build edge lookup map for O(1) edge finding (bidirectional)
  const edgeLookup = new Map<string, string>(); // "node1->node2" -> edgeId
  for (const [edgeId, edge] of edges) {
    const key1 = `${edge.sourceId}->${edge.targetId}`;
    const key2 = `${edge.targetId}->${edge.sourceId}`;
    edgeLookup.set(key1, edgeId);
    edgeLookup.set(key2, edgeId);
  }
  
  return {
    nodes,
    edges,
    adjacencyList,
    edgeLookup // Add this for fast edge lookups
  };
}

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Check if a point is within an elliptical corridor between start and end points
function isWithinEllipticalCorridor(
  pointLat: number, 
  pointLon: number, 
  startLat: number, 
  startLon: number, 
  endLat: number, 
  endLon: number, 
  corridorWidth: number
): boolean {
  // Calculate the direct distance between start and end
  const directDistance = calculateDistance(startLat, startLon, endLat, endLon);
  
  // Calculate distances from point to start and end
  const distanceToStart = calculateDistance(pointLat, pointLon, startLat, startLon);
  const distanceToEnd = calculateDistance(pointLat, pointLon, endLat, endLon);
  
  // For an ellipse: sum of distances to foci (start/end) must be <= major axis
  // Major axis = direct distance + corridor width
  // Minor axis = corridor width
  const majorAxis = directDistance + corridorWidth;
  
  // Check if point is within ellipse
  return (distanceToStart + distanceToEnd) <= majorAxis;
}

// Check if coordinates are within DC bounds
function isWithinDC(lat: number, lon: number): boolean {
  return lat >= DC_BOUNDS.south && 
         lat <= DC_BOUNDS.north && 
         lon >= DC_BOUNDS.west && 
         lon <= DC_BOUNDS.east;
}

// Enhanced findNearestNode with spatial optimization
function findNearestNode(graph: RoutingGraph, lat: number, lon: number): { node: GraphNode; distance: number } {
  let nearestNode: GraphNode | null = null;
  let minDistance = Infinity;

  // Spatial optimization: only check nodes within a reasonable bounding box
  const searchRadius = 0.01; // ~1km in lat/lon units
  const minLat = lat - searchRadius;
  const maxLat = lat + searchRadius;
  const minLon = lon - searchRadius;
  const maxLon = lon + searchRadius;

  for (const [_, node] of graph.nodes) {
    // Quick bounding box check before expensive distance calculation
    if (node.lat < minLat || node.lat > maxLat || node.lon < minLon || node.lon > maxLon) {
      continue;
    }
    
    const distance = calculateDistance(lat, lon, node.lat, node.lon);
    if (distance < minDistance) {
      minDistance = distance;
      nearestNode = node;
    }
  }

  if (!nearestNode) {
    throw new Error('No nodes found in graph');
  }

  // If nearest node is too far (more than 1000m), it's probably not a valid starting point
  if (minDistance > 1000) {
    throw new Error(`No street found within 1000m of coordinates (${lat}, ${lon})`);
  }

  return { node: nearestNode, distance: minDistance };
}

// Function to find the nearest walkable point within a reasonable distance
function findNearestWalkablePoint(lat: number, lon: number, walkableAreas: Map<string, boolean>, maxDistance: number = 0.01): { lat: number; lon: number } | null {
  // Search in expanding circles until we find a walkable point or hit max distance
  for (let distance = 0.0001; distance <= maxDistance; distance += 0.0001) {
    for (let latOffset = -distance; latOffset <= distance; latOffset += 0.0001) {
      for (let lonOffset = -distance; lonOffset <= distance; lonOffset += 0.0001) {
        const testLat = lat + latOffset;
        const testLon = lon + lonOffset;
        const key = `${testLat.toFixed(4)},${testLon.toFixed(4)}`;
        
        if (walkableAreas.has(key)) {
          return { lat: testLat, lon: testLon };
        }
      }
    }
  }
  
  return null;
}

// Priority Queue implementation for A* optimization
class PriorityQueue<T> {
  private heap: Array<{item: T, priority: number}> = [];
  
  enqueue(item: T, priority: number): void {
    this.heap.push({item, priority});
    this.bubbleUp(this.heap.length - 1);
  }
  
  dequeue(): T | undefined {
    if (this.isEmpty()) return undefined;
    
    const result = this.heap[0].item;
    const last = this.heap.pop()!;
    
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    
    return result;
  }
  
  peek(): T | undefined {
    return this.heap.length > 0 ? this.heap[0].item : undefined;
  }
  
  isEmpty(): boolean {
    return this.heap.length === 0;
  }
  
  size(): number {
    return this.heap.length;
  }
  
  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].priority <= this.heap[index].priority) break;
      
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }
  
  private bubbleDown(index: number): void {
    while (true) {
      let smallest = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      
      if (leftChild < this.heap.length && this.heap[leftChild].priority < this.heap[smallest].priority) {
        smallest = leftChild;
      }
      
      if (rightChild < this.heap.length && this.heap[rightChild].priority < this.heap[smallest].priority) {
        smallest = rightChild;
      }
      
      if (smallest === index) break;
      
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
}

// A* search implementation
function aStarSearch(
  graph: RoutingGraph,
  startNode: GraphNode,
  endNode: GraphNode,
  maxAllowedDistance: number,
  shortestDistance: number
): GraphNode[] | null {
  const aStarStartTime = Date.now();
  console.log(`A* DEBUG: Starting search from ${startNode.id} to ${endNode.id}`);
  console.log(`A* DEBUG: Max allowed distance: ${maxAllowedDistance}m, Shortest distance: ${shortestDistance}m`);
  console.log(`Starting route calculation from (${startNode.lat}, ${startNode.lon}) to (${endNode.lat}, ${endNode.lon})`);
  console.log(`Using safety importance: ${SAFETY_IMPORTANCE}`);
  console.log(`Max allowed network distance: ${maxAllowedDistance.toFixed(1)}m`);

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

  // Track iterations for debugging (no limit)
  let iterations = 0;
  

  
  // Calculate corridor width based on route length (adaptive boundary sizing)
  const directDistance = calculateDistance(startNode.lat, startNode.lon, endNode.lat, endNode.lon);
  const corridorWidth = Math.max(directDistance * 0.3, 200); // 30% of direct distance, minimum 200m

  while (!openSet.isEmpty()) {
    iterations++;
    
    // Add progress logging every 500 iterations
    if (iterations % 500 === 0) {
      console.log(`A* progress: iteration ${iterations}, openSet size: ${openSet.size()}`);
    }
    
    const current = openSet.dequeue()!;

    // Skip if already processed
    if (closedSet.has(current)) {
      continue;
    }

    // Mark as processed
    closedSet.add(current);

    if (current === endNode.id) {
      console.log(`Found path to destination in ${iterations} iterations`);
      const path: GraphNode[] = [];
      const visited = new Set<string>(); // Prevent cycles in path reconstruction
      let node = graph.nodes.get(current)!;
      console.log(`Starting path reconstruction from node ${current}`);
      
      while (node && path.length < 1000) { // Max 1000 nodes to prevent infinite loops
        // Check for cycles before adding node
              if (visited.has(node.id)) {
        console.error(`Cycle detected in path reconstruction! Node ${node.id} already visited. Path length: ${path.length}`);
        console.error(`Path so far: ${path.map(n => n.id).join(' -> ')}`);
        console.error(`This suggests the cameFrom map has a cycle. Debugging cameFrom entries:`);
        // Log the last few cameFrom entries to debug the cycle
        const lastFewNodes = path.slice(-5).map(n => n.id);
        lastFewNodes.forEach(nodeId => {
          const cameFromEntry = cameFrom.get(nodeId);
          console.error(`  ${nodeId} -> ${cameFromEntry?.nodeId || 'null'}`);
        });
        return null;
      }
        
        visited.add(node.id);
        path.unshift(node);
        
        // Only log every 10th node to reduce console spam
        if (path.length % 10 === 0) {
          console.log(`Added node to path: ${node.id} at (${node.lat}, ${node.lon}) - Path length: ${path.length}`);
        }
        
        const prev = cameFrom.get(node.id);
        if (prev) {
          node = graph.nodes.get(prev.nodeId)!;
        } else {
          console.log(`Reached start of path`);
          break;
        }
      }
      
      if (path.length >= 1000) {
        console.error(`Path too long in reconstruction! Path length: ${path.length}`);
        return null;
      }
      
      console.log(`Reconstructed path with ${path.length} nodes`);
      return path;
    }

    // Log neighbor exploration
    const neighbors = graph.adjacencyList.get(current) || new Set<string>();
    console.log(`Exploring ${neighbors.size} neighbors for node ${current}`);

    for (const neighborId of graph.adjacencyList.get(current) || new Set<string>()) {
      // O(1) edge lookup - check both directions
      const edgeKey = `${current}->${neighborId}`;
      const edgeId = graph.edgeLookup.get(edgeKey);

      if (!edgeId) continue;
      const edge = graph.edges.get(edgeId)!;

      // NEW: Elliptical corridor boundary check - skip nodes outside the corridor
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
        // Log boundary check skips occasionally
        if (iterations % 1000 === 0) {
          console.log(`Elliptical boundary check: skipped neighbor ${neighborId} at (${neighborNode.lat.toFixed(6)}, ${neighborNode.lon.toFixed(6)})`);
        }
        continue; // Skip this neighbor entirely
      }

      // Actual distance travelled if we step onto this edge
      const tentativeDistance = gDistance.get(current)! + edge.properties.length_meters;

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

        // Debug logging for path decisions (only log every 1000 iterations to reduce noise)
        if (iterations % 1000 === 0) {
          console.log(`Evaluating edge ${edge.id} (iteration ${iterations}):`, {
            safety_score: edge.properties.safety_score,
            length_meters: edge.properties.length_meters,
            distanceCost,
            avgSafetyScore,
            combinedCost,
            currentTotalDistance: tentativeDistance,
            percentOfMaxAllowed: (tentativeDistance / maxAllowedDistance) * 100
          });
        }

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

  if (iterations > 1000) {
    console.warn(`A* search completed with ${iterations} iterations`);
  }
  
  console.log(`A* DEBUG: Total iterations: ${iterations}, Total time: ${Date.now() - aStarStartTime}ms`);
  console.log(`A* DEBUG: Open set size at end: ${openSet.size()}`);
  
  return null;
}



export function findSafestRoute(
  graph: RoutingGraph,
  startLat: number, 
  startLon: number,
  endLat: number,
  endLon: number,
  options: RouteOptions = {}
): SafeRouteResult {
  const startTime = Date.now();
  console.log(`=== ROUTE DEBUG START: ${startLat}, ${startLon} to ${endLat}, ${endLon} ===`);
  // Validate coordinates are within DC
  if (!isWithinDC(startLat, startLon)) {
    throw new Error('Start point must be within Washington DC boundaries');
  }
  if (!isWithinDC(endLat, endLon)) {
    throw new Error('End point must be within Washington DC boundaries');
  }

  // Load walkable areas
  const walkableAreasPath = pathModule.join(process.cwd(), 'data', 'osm-walkability', 'walkable-areas.json');
  const walkableAreasArray = JSON.parse(fs.readFileSync(walkableAreasPath, 'utf-8'));
  const walkableAreas = new Map<string, boolean>();
  walkableAreasArray.forEach((key: string) => walkableAreas.set(key, true));

  // Check if start and end points are walkable, find nearest walkable points if not
  let adjustedStartLat = startLat;
  let adjustedStartLon = startLon;
  let adjustedEndLat = endLat;
  let adjustedEndLon = endLon;

  const startKey = `${adjustedStartLat.toFixed(4)},${adjustedStartLon.toFixed(4)}`;
  const endKey = `${adjustedEndLat.toFixed(4)},${adjustedEndLon.toFixed(4)}`;

  if (!walkableAreas.has(startKey)) {
    console.log(`Start point not walkable, finding nearest walkable point...`);
    const nearestStart = findNearestWalkablePoint(adjustedStartLat, adjustedStartLon, walkableAreas);
    if (nearestStart) {
      const originalDistance = calculateDistance(adjustedStartLat, adjustedStartLon, nearestStart.lat, nearestStart.lon);
      adjustedStartLat = nearestStart.lat;
      adjustedStartLon = nearestStart.lon;
      console.log(`Using nearest walkable start point: (${adjustedStartLat.toFixed(4)}, ${adjustedStartLon.toFixed(4)}) - ${originalDistance.toFixed(1)}m from original`);
    } else {
      throw new Error('No walkable point found near start location within 1km radius');
    }
  }

  if (!walkableAreas.has(endKey)) {
    console.log(`End point not walkable, finding nearest walkable point...`);
    const nearestEnd = findNearestWalkablePoint(adjustedEndLat, adjustedEndLon, walkableAreas);
    if (nearestEnd) {
      const originalDistance = calculateDistance(adjustedEndLat, adjustedEndLon, nearestEnd.lat, nearestEnd.lon);
      adjustedEndLat = nearestEnd.lat;
      adjustedEndLon = nearestEnd.lon;
      console.log(`Using nearest walkable end point: (${adjustedEndLat.toFixed(4)}, ${adjustedEndLon.toFixed(4)}) - ${originalDistance.toFixed(1)}m from original`);
    } else {
      throw new Error('No walkable point found near end location within 1km radius');
    }
  }

  // Find nearest nodes for start and end points
  const nodeFindStart = Date.now();
  const { node: startNode } = findNearestNode(graph, adjustedStartLat, adjustedStartLon);
  const { node: endNode } = findNearestNode(graph, adjustedEndLat, adjustedEndLon);
  console.log(`Node finding took: ${Date.now() - nodeFindStart}ms`);

  // Solution 1: Verify Graph Connectivity
  const startNeighbors = graph.adjacencyList.get(startNode.id) || new Set<string>();
  const endNeighbors = graph.adjacencyList.get(endNode.id) || new Set<string>();
  console.log(`Connectivity check: Start node ${startNode.id} has ${startNeighbors.size} neighbors`);
  console.log(`Connectivity check: End node ${endNode.id} has ${endNeighbors.size} neighbors`);
  
  if (startNeighbors.size === 0) {
    throw new Error(`Start node ${startNode.id} has no neighbors - graph connectivity issue`);
  }
  if (endNeighbors.size === 0) {
    throw new Error(`End node ${endNode.id} has no neighbors - graph connectivity issue`);
  }

  // Calculate straight-line distance for sanity checks
  const directDistance = calculateDistance(adjustedStartLat, adjustedStartLon, adjustedEndLat, adjustedEndLon);
  
  // If points are too close (less than 100m), just return direct path
  if (directDistance < 100) {
    return {
      waypoints: [
        { longitude: adjustedStartLon, latitude: adjustedStartLat },
        { longitude: adjustedEndLon, latitude: adjustedEndLat }
      ],
      safety_score: 3
    };
  }


  // Calculate the shortest path distance for the max allowed detour
  const dijkstraStart = Date.now();
  const shortestPathDistance = dijkstraDistance(graph, startNode, endNode);
  console.log(`Dijkstra calculation took: ${Date.now() - dijkstraStart}ms, shortest distance: ${shortestPathDistance}m`);
  const maxAllowedDistance =
      shortestPathDistance + Math.max(shortestPathDistance * (MAX_SAFETY_DETOUR - 1), MIN_ABSOLUTE_DETOUR);

  // A* search implementation (distance vs safety handled internally, so safetyWeight not used)
  const aStarStart = Date.now();
  let path = aStarSearch(
    graph,
    startNode,
    endNode,
    maxAllowedDistance,
    shortestPathDistance
  );
  console.log(`A* search took: ${Date.now() - aStarStart}ms`);

  if (!path) {
    throw new Error('A* search failed to find a valid path. This may be due to graph connectivity issues or path reconstruction problems.');
  }

  console.log(`Path found with ${path.length} nodes`);

  // Convert path to waypoints, sampling every N nodes to avoid too many waypoints
  // Use every node as a waypoint for short routes (≤ 25 nodes) so Mapbox cannot cut corners
  const WAYPOINT_INTERVAL = path.length <= 25 ? 1 : Math.ceil(path.length / 25);
  console.log(`Using waypoint interval: ${WAYPOINT_INTERVAL}`);

  const waypoints = path.filter((_, index) => index % WAYPOINT_INTERVAL === 0).map(node => ({
    longitude: node.lon,
    latitude: node.lat
  }));

  console.log(`Generated ${waypoints.length} waypoints from ${path.length} nodes`);

  // Ensure the last point is always included
  const lastNodeInPath = path[path.length - 1];
  if (waypoints[waypoints.length - 1].latitude !== lastNodeInPath.lat || 
      waypoints[waypoints.length - 1].longitude !== lastNodeInPath.lon) {
    waypoints.push({
      longitude: lastNodeInPath.lon,
      latitude: lastNodeInPath.lat
    });
    console.log(`Added final waypoint: (${lastNodeInPath.lat}, ${lastNodeInPath.lon})`);
  }

  console.log(`Final waypoints count: ${waypoints.length}`);
  console.log(`First waypoint: (${waypoints[0].latitude}, ${waypoints[0].longitude})`);
  console.log(`Last waypoint: (${waypoints[waypoints.length - 1].latitude}, ${waypoints[waypoints.length - 1].longitude})`);

  // Calculate overall safety score
  const safety_score = path.reduce((acc, node) => {
    // Each node in the path comes from an edge, find the corresponding edge
    const edge = Array.from(graph.edges.values()).find(e => e.targetId === node.id || e.sourceId === node.id);
    return acc + (edge?.properties.safety_score || 3);
  }, 0) / path.length;

  console.log(`Calculated safety score: ${safety_score}`);

  const result = {
    waypoints,
    safety_score
  };

  console.log(`Returning route result with ${waypoints.length} waypoints and safety score ${safety_score}`);
  console.log(`=== TOTAL ROUTE TIME: ${Date.now() - startTime}ms ===`);
  return result;
}

export { loadRoutingGraph };
export type { RouteOptions, RouteResult }; 