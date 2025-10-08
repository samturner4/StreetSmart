// @ts-nocheck
import { findSafestRoute } from './routing';
import { buildRoutingGraph } from './build-routing-graph';

async function testSpecificRoute() {
  const graph = await buildRoutingGraph();
  
  // 710 Rhode Island St NW to 509 U St NW
  const route = findSafestRoute(graph, 
    38.91531, -77.01953, // Rhode Island St NW coords
    38.91678, -77.02007, // U St NW coords
    { safetyWeight: 0.85 }
  );

  console.log('Route found:', route);
}

testSpecificRoute().catch(console.error);