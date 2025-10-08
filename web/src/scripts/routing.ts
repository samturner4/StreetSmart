import { RoutingGraph, GraphNode, GraphEdge, EdgeProperties, EdgeWeights } from './types';
import { RouteType, RouteOptions, RouteResult, RouteMetrics } from './types/routing';
import fs from 'fs';
import * as pathModule from 'path';

declare global {
  // augment globalThis with a cache property
  // eslint-disable-next-line no-var
  var __routingGraphCache: RoutingGraph | undefined; // NOSONAR
}

// DC bounding box
export const DC_BOUNDS = {
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
  endNode: GraphNode,
  routeType: RouteType
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
      
      const weight = getEdgeWeight(edge, routeType);
      const tentative = currentDist + weight;
      if (!dist.has(neighborId) || tentative < dist.get(neighborId)!) {
        dist.set(neighborId, tentative);
        open.set(neighborId, tentative);
      }
    }
  }
  // Fallback – shouldn't happen if graph is connected
  return Infinity;
}

// Types moved to types/routing.ts

// Load the pre-built routing graph
function loadRoutingGraph(): RoutingGraph {
  // Return cached instance if already loaded
  if (globalThis.__routingGraphCache) {
    return globalThis.__routingGraphCache;
  }

  // Try a list of potential locations in priority order (stop at first that exists)
  const candidatePaths = [
    // New full-geometry graph exported to top-level data/DC
    pathModule.join(process.cwd(), 'data', 'DC', 'routing-graph-full.json'),
    // Processed graph nested under data/DC/streets/processed (current structure)
    pathModule.join(process.cwd(), 'data', 'DC', 'streets', 'processed', 'routing-graph.json'),
    // Legacy location used during early development (no city folder)
    pathModule.join(process.cwd(), 'data', 'streets', 'processed', 'routing-graph.json'),
    // Fallback to repo-relative path (when executed from /web directory in Vercel build)
    pathModule.join(process.cwd(), 'src', 'data', 'DC', 'streets', 'processed', 'routing-graph.json')
  ];

  const graphPath = candidatePaths.find(p => fs.existsSync(p));

  if (!graphPath) {
    throw new Error('Routing graph JSON not found in any expected location');
  }
  const graphData = JSON.parse(fs.readFileSync(graphPath!, 'utf-8'));
  
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
  
  const graph: RoutingGraph = {
    nodes,
    edges,
    adjacencyList,
    edgeLookup // Add this for fast edge lookups
  };

  // Cache for future calls (using globalThis to persist across Next.js hot reloads & serverless cold starts)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  globalThis.__routingGraphCache = graph;

  return graph;
}

// Calculate distance between two points using Haversine formula
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
  console.log(`🔍 [findNearestNode] Looking for node near (${lat}, ${lon})`);
  console.log(`🔍 [findNearestNode] Graph has ${graph.nodes.size} total nodes`);
  
  let nearestNode: GraphNode | null = null;
  let minDistance = Infinity;

  // Spatial optimization: only check nodes within a reasonable bounding box
  const searchRadius = 0.01; // ~1km in lat/lon units
  const minLat = lat - searchRadius;
  const maxLat = lat + searchRadius;
  const minLon = lon - searchRadius;
  const maxLon = lon + searchRadius;
  
  console.log(`🔍 [findNearestNode] Search bounds: lat [${minLat.toFixed(6)}, ${maxLat.toFixed(6)}], lon [${minLon.toFixed(6)}, ${maxLon.toFixed(6)}]`);

  let nodesChecked = 0;
  let nodesInBounds = 0;
  
  for (const [_, node] of graph.nodes) {
    nodesChecked++;
    // Quick bounding box check before expensive distance calculation
    if (node.lat < minLat || node.lat > maxLat || node.lon < minLon || node.lon > maxLon) {
      continue;
    }
    
    nodesInBounds++;
    const distance = calculateDistance(lat, lon, node.lat, node.lon);
    if (distance < minDistance) {
      minDistance = distance;
      nearestNode = node;
      console.log(`🔍 [findNearestNode] Found closer node: ${node.id} at (${node.lat.toFixed(6)}, ${node.lon.toFixed(6)}) - ${distance.toFixed(1)}m away`);
    }
  }
  
  console.log(`🔍 [findNearestNode] Checked ${nodesChecked} nodes, ${nodesInBounds} were in bounds`);

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

// Blended edge cost helper
// cost = alpha * distance + (1-alpha) * safetyCost
function getBlendedCost(edge: GraphEdge, alpha: number): number {
  // Safety cost is pre-computed as weights.safetyOnly (0-100 range)
  const safetyCost = edge.properties.weights?.safetyOnly ?? 50;
  const distance = edge.properties.length_meters;
  return alpha * distance + (1 - alpha) * safetyCost;
}

// Legacy wrapper used by helper functions (e.g., quickest distance calc)
function getEdgeWeight(edge: GraphEdge, routeType: RouteType): number {
  const alpha = alphaForRouteType(routeType);
  return getBlendedCost(edge, alpha);
}

// Map preset alpha values per route type
function alphaForRouteType(routeType: RouteType): number {
  if (routeType === 'quickest') return 1;
  if (routeType === 'balanced') return 0.5;
  // All detour variants and 'safest' use pure safety
  return 0;
}

// Enhanced heuristic that considers remaining detour budget
function getHeuristic(
  node: GraphNode, 
  endNode: GraphNode, 
  alpha: number, 
  currentDistance: number, 
  maxDistanceMeters?: number
): number {
  const straightLineToGoal = calculateDistance(node.lat, node.lon, endNode.lat, endNode.lon);
  
  if (alpha > 0) {
    // Normal blended heuristic with small distance component for runtime optimization
    return alpha * straightLineToGoal + 0.1 * straightLineToGoal;
  } else {
    // Pure safety (α=0) but use remaining detour to guide search
    if (!maxDistanceMeters) {
      return 0.1 * straightLineToGoal; // Small distance heuristic for runtime
    }
    
    const remainingDetour = maxDistanceMeters - currentDistance;
    // If straight line to goal > remaining detour, this path can't possibly succeed
    if (remainingDetour < straightLineToGoal) {
      return Infinity;
    }
    
    // Small distance heuristic to improve runtime while staying within detour bounds
    return 0.1 * straightLineToGoal;
  }
}

// A* search implementation
async function aStarSearch(
  graph: RoutingGraph,
  startNode: GraphNode,
  endNode: GraphNode,
  routeType: RouteType,
  maxDistanceMeters?: number
): Promise<GraphNode[] | null> {
  const alpha = alphaForRouteType(routeType);
  const aStarStartTime = Date.now();
  console.log(`A* DEBUG: Starting search from ${startNode.id} to ${endNode.id}`);
  console.log(`Starting route calculation from (${startNode.lat}, ${startNode.lon}) to (${endNode.lat}, ${endNode.lon})`);
  console.log(`Using route type: ${routeType}`);

  const openSet = new PriorityQueue<string>(); // nodeId -> fScore
  openSet.enqueue(startNode.id, 0);

  // Track visited nodes to prevent cycles
  const closedSet = new Set<string>();

  // Distance travelled so far in metres for each node
  const gDistance = new Map<string, number>();
  gDistance.set(startNode.id, 0);

  // Combined cost (pure safety weight) from start to node
  const gScore = new Map<string, number>();
  gScore.set(startNode.id, 0);

  const fScore = new Map<string, number>(); // Estimated total cost
  fScore.set(startNode.id, getHeuristic(startNode, endNode, alpha, 0, maxDistanceMeters));

  console.log(`A* DEBUG: maxDistanceMeters = ${maxDistanceMeters || 'unlimited'}`);

  const cameFrom = new Map<string, { nodeId: string; edgeId: string }>();

  // Cache for safety scores - avoid recalculating entire path
  const safetyCache = new Map<string, { safetySum: number; lengthSum: number }>();
  safetyCache.set(startNode.id, { safetySum: 0, lengthSum: 0 });

  // Track iterations and performance metrics
  let iterations = 0;
  const searchStartTime = Date.now();
  const MAX_SEARCH_TIME = 25000; // 25 seconds max
  
  // Debug metrics
  let nodesExplored = 0;
  let nodesSkippedByDistance = 0;
  let nodesSkippedByCorridor = 0;
  let maxOpenSetSize = 0;
  

  
  // Calculate corridor width based on route length (adaptive boundary sizing)
  const directDistance = calculateDistance(startNode.lat, startNode.lon, endNode.lat, endNode.lon);
  const corridorWidth = Math.max(directDistance * 0.3, 200); // 30% of direct distance, minimum 200m

  while (!openSet.isEmpty()) {
    iterations++;
    
    // Add detailed progress logging
    if (iterations % 500 === 0) {
      const currentSize = openSet.size();
      maxOpenSetSize = Math.max(maxOpenSetSize, currentSize);
      const elapsedTime = Date.now() - searchStartTime;
      
      console.log(`A* progress [${elapsedTime}ms]:
        Iterations: ${iterations}
        Open set size: ${currentSize} (max: ${maxOpenSetSize})
        Nodes explored: ${nodesExplored}
        Skipped by distance: ${nodesSkippedByDistance}
        Skipped by corridor: ${nodesSkippedByCorridor}
        Current node: (processing)
      `);

      if (elapsedTime > MAX_SEARCH_TIME) {
        throw new Error(`Search exceeded ${MAX_SEARCH_TIME}ms. Metrics:
          Iterations: ${iterations}
          Nodes explored: ${nodesExplored}
          Distance skips: ${nodesSkippedByDistance}
          Corridor skips: ${nodesSkippedByCorridor}
          Max open set: ${maxOpenSetSize}
        `);
      }
    }
    
    const current = openSet.dequeue()!;

    // Skip if already processed
    if (closedSet.has(current)) {
      continue;
    }

    // Mark as processed
    closedSet.add(current);

    // Get current node's distance
    const currentDistance = gDistance.get(current) || 0;

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
      if (closedSet.has(neighborId)) continue;

      // O(1) edge lookup - check both directions
      const edgeKey = `${current}->${neighborId}`;
      const reverseKey = `${neighborId}->${current}`;
      const edgeId = graph.edgeLookup.get(edgeKey) ?? graph.edgeLookup.get(reverseKey);

      if (!edgeId) continue;
      const edge = graph.edges.get(edgeId)!;

      // Calculate new total distance
      const edgeDistance = edge.properties.length_meters;
      const newDistance = currentDistance + edgeDistance;

      // Skip if exceeds max distance
      if (maxDistanceMeters && newDistance > maxDistanceMeters) {
        nodesSkippedByDistance++;
        continue;
      }
      nodesExplored++;

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
        nodesSkippedByCorridor++;
        continue; // Skip this neighbor entirely
      }

      // We already checked distance limit above
      const tentativeGScore = (gScore.get(current) || 0) + getBlendedCost(edge, alpha);
      const tentativeGDistance = (gDistance.get(current) || 0) + edge.properties.length_meters;

      if (!gScore.has(neighborId) || tentativeGScore < gScore.get(neighborId)!) {
        // Only set parent the first time to avoid cycles
        if (!cameFrom.has(neighborId)) {
          cameFrom.set(neighborId, { nodeId: current, edgeId });
        }
        // Update distance & combined cost tables
        gDistance.set(neighborId, tentativeGDistance);
        gScore.set(neighborId, tentativeGScore);

        // Cache the safety data for this neighbor
        safetyCache.set(neighborId, { safetySum: 0, lengthSum: 0 }); // Safety data is now pre-calculated in loadRoutingGraph

        // Debug logging for path decisions (only log every 1000 iterations to reduce noise)
        if (iterations % 1000 === 0) {
          console.log(`Evaluating edge ${edge.id} (iteration ${iterations}):`, {
            safety_score: edge.properties.safety_score,
            length_meters: edge.properties.length_meters,
            distanceCost: getBlendedCost(edge, alpha),
            avgSafetyScore: 0, // Safety score is now pre-calculated
            combinedCost: tentativeGScore, // Changed to tentativeG
            currentTotalDistance: tentativeGScore, // Changed to tentativeG
            percentOfQuickest: 0 // Removed maxAllowedDistance reference
          });
        }

        // Use enhanced heuristic that considers remaining detour budget
        const h = getHeuristic(neighborNode, endNode, alpha, tentativeGDistance, maxDistanceMeters);
        const f = tentativeGScore + h;

        fScore.set(neighborId, f);
        openSet.enqueue(neighborId, f);
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


export async function findRoute(
  startLat: number, 
  startLon: number,
  endLat: number,
  endLon: number,
  options: RouteOptions = { routeType: 'safest' }
): Promise<RouteResult> {
  const startTime = Date.now();
  const graph = loadRoutingGraph();
  console.log(`=== ROUTE DEBUG START: ${startLat}, ${startLon} to ${endLat}, ${endLon} ===`);
  // Validate coordinates are within DC
  //   if (!isWithinDC(startLat, startLon)) {
  //     throw new Error('Start point must be within Washington DC boundaries');
  //   }
  //   if (!isWithinDC(endLat, endLon)) {
  //     throw new Error('End point must be within Washington DC boundaries');
  //   }

  // Load walkable areas
  const walkableAreasPath = fs.existsSync(pathModule.join(process.cwd(), 'data', 'osm-walkability', 'walkable-areas.json'))
  ? pathModule.join(process.cwd(), 'data', 'osm-walkability', 'walkable-areas.json')
  : fs.existsSync(pathModule.join(process.cwd(), 'data', 'DC', 'osm-walkability', 'walkable-areas.json'))
    ? pathModule.join(process.cwd(), 'data', 'DC', 'osm-walkability', 'walkable-areas.json')
    : pathModule.join(process.cwd(), 'src', 'data', 'DC', 'osm-walkability', 'walkable-areas.json');
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
    const nearestStart = findNearestWalkablePoint(adjustedStartLat, adjustedStartLon, walkableAreas, 0.1); // ~10km
    if (nearestStart) {
      const originalDistance = calculateDistance(adjustedStartLat, adjustedStartLon, nearestStart.lat, nearestStart.lon);
      adjustedStartLat = nearestStart.lat;
      adjustedStartLon = nearestStart.lon;
      console.log(`Using nearest walkable start point: (${adjustedStartLat.toFixed(4)}, ${adjustedStartLon.toFixed(4)}) - ${originalDistance.toFixed(1)}m from original`);
    } else {
      console.warn('No walkable start point found within 10km, proceeding with original coordinates');
    }
  }

  if (!walkableAreas.has(endKey)) {
    console.log(`End point not walkable, finding nearest walkable point...`);
    const nearestEnd = findNearestWalkablePoint(adjustedEndLat, adjustedEndLon, walkableAreas, 0.1); // ~10km
    if (nearestEnd) {
      const originalDistance = calculateDistance(adjustedEndLat, adjustedEndLon, nearestEnd.lat, nearestEnd.lon);
      adjustedEndLat = nearestEnd.lat;
      adjustedEndLon = nearestEnd.lon;
      console.log(`Using nearest walkable end point: (${adjustedEndLat.toFixed(4)}, ${adjustedEndLon.toFixed(4)}) - ${originalDistance.toFixed(1)}m from original`);
    } else {
      console.warn('No walkable end point found within 10km, proceeding with original coordinates');
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
      metrics: {
        distance: directDistance,
        duration: Math.ceil((directDistance / 5000) * 60 * 60),
        safety_score: 3,
        distance_increase: 0
      },
      geometry: {
        type: 'LineString',
        coordinates: [[adjustedStartLat, adjustedStartLon], [adjustedEndLat, adjustedEndLon]]
      }
    };
  }


  // Find route using A* with pre-calculated weights
  const aStarStart = Date.now();

  // Determine maxDistanceMeters based on detour percentage
  let maxDistanceMeters: number | undefined = undefined;
  const rt = (options.routeType || 'safest') as RouteType;
  const detourPercMap: Record<RouteType, number> = {
    quickest: 0,
    balanced: 0,
    safest: 100,
    detour5: 5,
    detour10: 10,
    detour15: 15,
    detour20: 20,
    detour25: 25,
    detour30: 30
  } as const;

  if (rt.startsWith('detour')) {
    // compute quickest distance once
    const quickestPath = await aStarSearch(graph, startNode, endNode, 'quickest');
    if (!quickestPath) throw new Error('Failed to compute quickest path for detour cap');
    let qDist = 0;
    for (let i = 0; i < quickestPath.length - 1; i++) {
      const curr = quickestPath[i];
      const next = quickestPath[i + 1];
      const edgeId = graph.edgeLookup.get(`${curr.id}->${next.id}`) ?? graph.edgeLookup.get(`${next.id}->${curr.id}`);
      if (edgeId) {
        qDist += graph.edges.get(edgeId)!.properties.length_meters;
      }
    }
    const perc = detourPercMap[rt] || 0;
    maxDistanceMeters = qDist * (1 + perc / 100);
  }

  let path = await aStarSearch(
    graph,
    startNode,
    endNode,
    rt,
    maxDistanceMeters
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

  const waypoints: {longitude:number; latitude:number}[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const curr = path[i];
    const next = path[i+1];

    // Push current node (avoid duplicates)
    if (waypoints.length === 0 || waypoints[waypoints.length-1].latitude !== curr.lat || waypoints[waypoints.length-1].longitude !== curr.lon) {
      waypoints.push({ longitude: curr.lon, latitude: curr.lat });
    }

    // Try both directions to find the edge
    const forwardKey = `${curr.id}->${next.id}`;
    const reverseKey = `${next.id}->${curr.id}`;
    const edgeId = graph.edgeLookup.get(forwardKey) ?? graph.edgeLookup.get(reverseKey);
    
    if (edgeId) {
      const edge = graph.edges.get(edgeId)!;
      if (edge.properties.geometry && edge.properties.geometry.length > 2) {
        // Get geometry points in correct order based on traversal direction
        const isReverse = graph.edgeLookup.get(reverseKey) === edgeId;
        const geometry = isReverse ? [...edge.properties.geometry].reverse() : edge.properties.geometry;
        
        // Include all geometry points except first (already added as curr)
        for (let j = 1; j < geometry.length; j += WAYPOINT_INTERVAL) {
          const [lat, lon] = geometry[j];
          // Only add if different from previous point
          if (waypoints.length === 0 || 
              waypoints[waypoints.length-1].latitude !== lat || 
              waypoints[waypoints.length-1].longitude !== lon) {
            waypoints.push({ longitude: lon, latitude: lat });
          }
        }
        console.log(`Added ${Math.floor(geometry.length/WAYPOINT_INTERVAL)} waypoints from edge ${edgeId} (${isReverse ? 'reverse' : 'forward'} direction)`);
      }
    } else {
      console.warn(`No edge found between nodes ${curr.id} and ${next.id} in either direction`);
      }
    }


  // Add final node if not already present
  const last = path[path.length-1];
  if (waypoints.length === 0 || waypoints[waypoints.length-1].latitude !== last.lat || waypoints[waypoints.length-1].longitude !== last.lon) {
    waypoints.push({ longitude: last.lon, latitude: last.lat });
    console.log(`Added final waypoint: (${last.lat}, ${last.lon})`);
  }

  console.log(`Generated ${waypoints.length} waypoints from ${path.length} nodes`);

  console.log(`Final waypoints count: ${waypoints.length}`);
  console.log(`First waypoint: (${waypoints[0].latitude}, ${waypoints[0].longitude})`);
  console.log(`Last waypoint: (${waypoints[waypoints.length - 1].latitude}, ${waypoints[waypoints.length - 1].longitude})`);

  // Calculate route metrics
  let totalDistance = 0;
  let totalSafetyScore = 0;
  const edges: GraphEdge[] = [];

  // Collect edges and calculate totals
  for (let i = 0; i < path.length - 1; i++) {
    const currentNode = path[i];
    const nextNode = path[i + 1];
    const edgeKey = `${currentNode.id}->${nextNode.id}`;
    const edgeId = graph.edgeLookup.get(edgeKey);
    if (edgeId) {
      const edge = graph.edges.get(edgeId)!;
      edges.push(edge);
      totalDistance += edge.properties.length_meters;
      totalSafetyScore += edge.properties.safety_score;
    }
  }

  // Calculate average safety score
  const avgSafetyScore = totalSafetyScore / edges.length;

  // Calculate metrics
  const metrics: RouteMetrics = {
    distance: totalDistance,
    duration: Math.ceil((totalDistance / 5000) * 60 * 60), // Assuming 5 km/h walking speed
    safety_score: avgSafetyScore,
    distance_increase: 0 // Will be calculated if not quickest route
  };

  // If not quickest route, calculate distance increase
  if (options.routeType !== 'quickest') {
    // Find quickest route distance
    const quickestPath = await aStarSearch(graph, startNode, endNode, 'quickest');
    if (quickestPath) {
      let quickestDistance = 0;
      for (let i = 0; i < quickestPath.length - 1; i++) {
        const currentNode = quickestPath[i];
        const nextNode = quickestPath[i + 1];
        const edgeKey = `${currentNode.id}->${nextNode.id}`;
        const edgeId = graph.edgeLookup.get(edgeKey);
        if (edgeId) {
          const edge = graph.edges.get(edgeId)!;
          quickestDistance += edge.properties.length_meters;
        }
      }
      metrics.distance_increase = ((totalDistance - quickestDistance) / quickestDistance) * 100;
    }
  }

  // Create route geometry
  const geometry = {
    type: 'LineString' as const,
    coordinates: edges.flatMap(edge => edge.properties.geometry)
  };

  const result: RouteResult = {
    waypoints,
    metrics,
    geometry
  };

  console.log(`Route calculated with ${waypoints.length} waypoints:`);
  console.log(`- Distance: ${metrics.distance.toFixed(0)}m`);
  console.log(`- Duration: ${Math.ceil(metrics.duration / 60)}min`);
  console.log(`- Safety Score: ${metrics.safety_score.toFixed(1)}`);
  console.log(`- Distance Increase: ${metrics.distance_increase.toFixed(1)}%`);
  console.log(`=== TOTAL ROUTE TIME: ${Date.now() - startTime}ms ===`);
  
  return result;
}

export { loadRoutingGraph };
export { findRoute as findSafestRoute };
export type { RouteOptions, RouteResult }; 