import { loadRoutingGraph } from './routing';

async function analyzeGraphConnectivity() {
  console.log('Analyzing routing graph connectivity...\n');

  const graph = loadRoutingGraph();
  console.log(`Loaded routing graph with ${graph.nodes.size} nodes and ${graph.edges.size} edges`);

  // Count connected vs isolated nodes
  let connectedNodes = 0;
  let isolatedNodes = 0;
  const isolatedNodeIds: string[] = [];

  for (const [nodeId, node] of graph.nodes) {
    const edges = Array.from(graph.edges.values()).filter(edge => 
      edge.sourceId === nodeId || edge.targetId === nodeId
    );
    
    if (edges.length > 0) {
      connectedNodes++;
    } else {
      isolatedNodes++;
      isolatedNodeIds.push(nodeId);
    }
  }

  console.log(`Connected nodes: ${connectedNodes}`);
  console.log(`Isolated nodes: ${isolatedNodes}`);
  console.log(`Connectivity rate: ${(connectedNodes / graph.nodes.size * 100).toFixed(1)}%`);

  if (isolatedNodes > 0) {
    console.log(`\nFirst 10 isolated node IDs:`);
    isolatedNodeIds.slice(0, 10).forEach(id => console.log(`  ${id}`));
  }

  // Check if the graph is connected (can reach all nodes from any starting point)
  console.log('\nChecking if graph is fully connected...');
  
  // Start with any connected node
  let startNode = null;
  for (const [nodeId, node] of graph.nodes) {
    const edges = Array.from(graph.edges.values()).filter(edge => 
      edge.sourceId === nodeId || edge.targetId === nodeId
    );
    if (edges.length > 0) {
      startNode = nodeId;
      break;
    }
  }

  if (!startNode) {
    console.log('No connected nodes found! Graph is completely disconnected.');
    return;
  }

  // Simple BFS to count reachable nodes
  const visited = new Set<string>();
  const queue = [startNode];
  visited.add(startNode);

  while (queue.length > 0) {
    const current = queue.shift()!;
    
    const edges = Array.from(graph.edges.values()).filter(edge => 
      edge.sourceId === current || edge.targetId === current
    );
    
    for (const edge of edges) {
      const next = edge.sourceId === current ? edge.targetId : edge.sourceId;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  console.log(`Reachable nodes from ${startNode}: ${visited.size}`);
  console.log(`Unreachable nodes: ${connectedNodes - visited.size}`);
  
  if (visited.size < connectedNodes) {
    console.log('Graph has multiple disconnected components!');
  } else {
    console.log('Graph is fully connected (all connected nodes are reachable).');
  }
}

analyzeGraphConnectivity().catch(console.error); 