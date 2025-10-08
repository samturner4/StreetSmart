// @ts-nocheck
import { loadRoutingGraph, findSafestRoute } from './routing';

async function testSimpleRoute() {
  console.log('Testing simple routing...\n');

  try {
    // Load the routing graph
    const graph = loadRoutingGraph();
    console.log(`Loaded routing graph with ${graph.nodes.size} nodes and ${graph.edges.size} edges`);

    // Test coordinates in walkable areas
    const testRoute = {
      start: { lat: 38.9072, lon: -77.0369, name: 'DC Downtown' },
      end: { lat: 38.9200, lon: -77.0000, name: 'DC Residential' }
    };

    console.log(`Testing route from ${testRoute.start.name} to ${testRoute.end.name}`);
    console.log(`Start: ${testRoute.start.lat}, ${testRoute.start.lon}`);
    console.log(`End: ${testRoute.end.lat}, ${testRoute.end.lon}`);

    const result = findSafestRoute(
      graph,
      testRoute.start.lat,
      testRoute.start.lon,
      testRoute.end.lat,
      testRoute.end.lon
    );

    console.log('Route found successfully!');
    console.log(`Safety score: ${result.safety_score.toFixed(2)}`);
    console.log(`Number of waypoints: ${result.waypoints.length}`);
    console.log('First few waypoints:');
    result.waypoints.slice(0, 3).forEach((wp, i) => {
      console.log(`  ${i + 1}. ${wp.latitude.toFixed(6)}, ${wp.longitude.toFixed(6)}`);
    });

  } catch (error: any) {
    console.error('Error testing route:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testSimpleRoute().catch(console.error); 