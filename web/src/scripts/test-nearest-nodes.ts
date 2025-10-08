// @ts-nocheck
import { loadRoutingGraph, findSafestRoute } from './routing';

async function testNearestNodes() {
  console.log('Testing routing between nearest nodes...\n');

  const graph = loadRoutingGraph();
  console.log(`Loaded routing graph with ${graph.nodes.size} nodes and ${graph.edges.size} edges`);

  // The exact nearest nodes we found earlier
  const startNodeId = 'node_38.97284275893686_-77.05805242626116'; // 6278 29th st NW
  const endNodeId = 'node_38.96898779675116_-77.03277441657137';   // 1356 Van buren st NW

  const startNode = graph.nodes.get(startNodeId);
  const endNode = graph.nodes.get(endNodeId);

  if (!startNode || !endNode) {
    console.error('Could not find nodes!');
    return;
  }

  console.log('Testing routing between nearest nodes:');
  console.log(`Start node: ${startNodeId} at (${startNode.lat}, ${startNode.lon})`);
  console.log(`End node: ${endNodeId} at (${endNode.lat}, ${endNode.lon})`);

  // Calculate distance
  const distance = Math.sqrt(
    Math.pow(startNode.lat - endNode.lat, 2) + Math.pow(startNode.lon - endNode.lon, 2)
  ) * 111000;
  console.log(`Distance: ${distance.toFixed(0)} meters`);

  // Check if these nodes have edges
  const startEdges = Array.from(graph.edges.values()).filter(edge => 
    edge.sourceId === startNodeId || edge.targetId === startNodeId
  );
  const endEdges = Array.from(graph.edges.values()).filter(edge => 
    edge.sourceId === endNodeId || edge.targetId === endNodeId
  );

  console.log(`Start node edges: ${startEdges.length}`);
  console.log(`End node edges: ${endEdges.length}`);

  // Try routing between these exact nodes
  try {
    const result = findSafestRoute(
      graph,
      startNode.lat,
      startNode.lon,
      endNode.lat,
      endNode.lon
    );

    console.log('✅ Route found!');
    console.log(`Safety score: ${result.safety_score.toFixed(2)}`);
    console.log(`Number of waypoints: ${result.waypoints.length}`);

  } catch (error: any) {
    console.error('❌ Error finding route:', error.message);
    
    // Try with very relaxed constraints
    console.log('\nTrying with very relaxed constraints...');
    try {
      const result = findSafestRoute(
        graph,
        startNode.lat,
        startNode.lon,
        endNode.lat,
        endNode.lon,
        { maxDetourFactor: 10.0, safetyWeight: 0.1 } // Very relaxed
      );
      console.log('✅ Route found with very relaxed constraints!');
      console.log(`Safety score: ${result.safety_score.toFixed(2)}`);
      console.log(`Number of waypoints: ${result.waypoints.length}`);
    } catch (relaxedError: any) {
      console.log(`❌ Still failed: ${relaxedError.message}`);
    }
  }
}

testNearestNodes().catch(console.error); 