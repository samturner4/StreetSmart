import { loadRoutingGraph } from './routing';

async function calculatePathDistance() {
  console.log('Calculating path distance...\n');

  const graph = loadRoutingGraph();
  
  const startNodeId = 'node_38.97284275893686_-77.05805242626116';
  const endNodeId = 'node_38.96898779675116_-77.03277441657137';

  const startNode = graph.nodes.get(startNodeId);
  const endNode = graph.nodes.get(endNodeId);

  // Calculate straight-line distance
  const straightLineDistance = Math.sqrt(
    Math.pow(startNode!.lat - endNode!.lat, 2) + Math.pow(startNode!.lon - endNode!.lon, 2)
  ) * 111000; // Convert to meters

  console.log(`Straight-line distance: ${straightLineDistance.toFixed(0)} meters`);

  // Get the BFS path
  const path = findPathBFS(graph, startNodeId, endNodeId);
  if (!path) {
    console.log('No path found!');
    return;
  }

  console.log(`Path has ${path.length} nodes`);

  // Calculate actual path distance
  let totalDistance = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const currentNodeId = path[i];
    const nextNodeId = path[i + 1];
    
    const edge = Array.from(graph.edges.values()).find(edge => 
      (edge.sourceId === currentNodeId && edge.targetId === nextNodeId) ||
      (edge.sourceId === nextNodeId && edge.targetId === currentNodeId)
    );
    
    if (edge) {
      totalDistance += edge.properties.length_meters;
    } else {
      console.log(`Warning: No edge found between ${currentNodeId} and ${nextNodeId}`);
    }
  }

  console.log(`Actual path distance: ${totalDistance.toFixed(0)} meters`);
  console.log(`Detour factor: ${(totalDistance / straightLineDistance).toFixed(2)}x`);
  
  if (totalDistance / straightLineDistance > 5.0) {
    console.log('❌ Path exceeds 5x detour factor - this is why A* fails!');
  } else {
    console.log('✅ Path is within detour factor - A* should work');
  }
}

function findPathBFS(graph: any, startId: string, endId: string): string[] | null {
  const visited = new Set<string>();
  const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: startId, path: [startId] }];
  
  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()!;
    
    if (nodeId === endId) {
      return path;
    }
    
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    
    const neighbors = graph.adjacencyList.get(nodeId) || [];
    for (const neighborId of neighbors) {
      if (!visited.has(neighborId)) {
        queue.push({ nodeId: neighborId, path: [...path, neighborId] });
      }
    }
  }
  
  return null;
}

calculatePathDistance().catch(console.error); 