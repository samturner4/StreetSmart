import { loadRoutingGraph } from './routing';

async function testGraphStructure() {
  console.log('Testing graph structure...\n');

  const graph = loadRoutingGraph();
  console.log(`Loaded routing graph with ${graph.nodes.size} nodes and ${graph.edges.size} edges`);

  // Check a few random nodes
  const nodeIds = Array.from(graph.nodes.keys()).slice(0, 5);
  
  for (const nodeId of nodeIds) {
    console.log(`\n--- Node: ${nodeId} ---`);
    const node = graph.nodes.get(nodeId)!;
    console.log(`Coordinates: (${node.lat}, ${node.lon})`);
    
    // Check adjacency list
    const neighbors = graph.adjacencyList.get(nodeId);
    console.log(`Adjacency list size: ${neighbors ? neighbors.size : 0}`);
    if (neighbors && neighbors.size > 0) {
      console.log(`First few neighbors: ${Array.from(neighbors).slice(0, 3).join(', ')}`);
    }
    
    // Check edges
    const edges = Array.from(graph.edges.values()).filter(edge => 
      edge.sourceId === nodeId || edge.targetId === nodeId
    );
    console.log(`Number of edges: ${edges.length}`);
    
    if (edges.length > 0) {
      const edge = edges[0];
      console.log(`Sample edge: ${edge.id} from ${edge.sourceId} to ${edge.targetId}`);
    }
  }

  // Check if adjacency list matches edges
  console.log('\n--- Checking adjacency list vs edges ---');
  let adjacencyMatches = 0;
  let adjacencyMismatches = 0;

  for (const [nodeId, neighbors] of graph.adjacencyList) {
    const edges = Array.from(graph.edges.values()).filter(edge => 
      edge.sourceId === nodeId || edge.targetId === nodeId
    );
    
    const edgeNeighbors = new Set<string>();
    for (const edge of edges) {
      if (edge.sourceId === nodeId) {
        edgeNeighbors.add(edge.targetId);
      } else {
        edgeNeighbors.add(edge.sourceId);
      }
    }
    
    if (neighbors.size === edgeNeighbors.size) {
      adjacencyMatches++;
    } else {
      adjacencyMismatches++;
      if (adjacencyMismatches <= 3) {
        console.log(`Mismatch for node ${nodeId}:`);
        console.log(`  Adjacency list: ${neighbors.size} neighbors`);
        console.log(`  Edges: ${edges.length} edges -> ${edgeNeighbors.size} neighbors`);
      }
    }
  }

  console.log(`\nAdjacency list matches edges: ${adjacencyMatches}`);
  console.log(`Adjacency list mismatches: ${adjacencyMismatches}`);
}

testGraphStructure().catch(console.error); 