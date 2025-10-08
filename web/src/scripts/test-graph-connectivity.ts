import { loadRoutingGraph } from './routing';

async function testGraphConnectivity() {
  console.log('Testing graph connectivity...\n');

  const graph = loadRoutingGraph();
  console.log(`Loaded routing graph with ${graph.nodes.size} nodes and ${graph.edges.size} edges`);

  // Find a few connected nodes to test with
  const connectedNodes: string[] = [];
  for (const [nodeId, node] of graph.nodes) {
    const edges = Array.from(graph.edges.values()).filter(edge => 
      edge.sourceId === nodeId || edge.targetId === nodeId
    );
    if (edges.length > 0) {
      connectedNodes.push(nodeId);
      if (connectedNodes.length >= 5) break;
    }
  }

  console.log(`Found ${connectedNodes.length} connected nodes to test with`);

  // Test connectivity between different pairs
  for (let i = 0; i < connectedNodes.length; i++) {
    for (let j = i + 1; j < connectedNodes.length; j++) {
      const node1 = graph.nodes.get(connectedNodes[i])!;
      const node2 = graph.nodes.get(connectedNodes[j])!;
      
      console.log(`\nTesting connectivity between:`);
      console.log(`  Node 1: ${connectedNodes[i]} at (${node1.lat}, ${node1.lon})`);
      console.log(`  Node 2: ${connectedNodes[j]} at (${node2.lat}, ${node2.lon})`);
      
      // Calculate distance
      const distance = Math.sqrt(
        Math.pow(node1.lat - node2.lat, 2) + Math.pow(node1.lon - node2.lon, 2)
      ) * 111000;
      console.log(`  Distance: ${distance.toFixed(0)} meters`);
      
      // Try to find a path using a simple BFS
      const path = findPathBFS(graph, connectedNodes[i], connectedNodes[j]);
      if (path) {
        console.log(`  ✅ Path found with ${path.length} nodes`);
      } else {
        console.log(`  ❌ No path found - graph is disconnected!`);
        return;
      }
    }
  }

  console.log('\n✅ Graph appears to be fully connected!');
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

testGraphConnectivity().catch(console.error); 