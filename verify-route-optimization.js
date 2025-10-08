const fs = require('fs');
const path = require('path');

// Load the routing graph
const graphPath = path.join(__dirname, 'data', 'DC', 'streets', 'processed', 'routing-graph.json');
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

console.log('=== Route Optimization Testing ===\n');

// Convert arrays to Maps for easier access
const nodesMap = new Map(graph.nodes);
const edgesMap = new Map(graph.edges);
const edgeLookupMap = new Map(graph.edgeLookup);

// Simple A* implementation for testing
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function findNearestNode(lat, lon) {
  let nearestNode = null;
  let minDistance = Infinity;
  
  nodesMap.forEach((node, nodeId) => {
    const distance = calculateDistance(lat, lon, node.lat, node.lon);
    if (distance < minDistance) {
      minDistance = distance;
      nearestNode = { id: nodeId, ...node };
    }
  });
  
  return nearestNode;
}

function aStarSearch(startNodeId, endNodeId) {
  const openSet = new Set([startNodeId]);
  const cameFrom = new Map();
  const gScore = new Map();
  const fScore = new Map();
  
  gScore.set(startNodeId, 0);
  
  const startNode = nodesMap.get(startNodeId);
  const endNode = nodesMap.get(endNodeId);
  const hStart = calculateDistance(startNode.lat, startNode.lon, endNode.lat, endNode.lon);
  fScore.set(startNodeId, hStart);
  
  while (openSet.size > 0) {
    // Find node with lowest fScore
    let current = null;
    let lowestF = Infinity;
    for (const nodeId of openSet) {
      const f = fScore.get(nodeId) || Infinity;
      if (f < lowestF) {
        lowestF = f;
        current = nodeId;
      }
    }
    
    if (current === endNodeId) {
      // Reconstruct path
      const path = [];
      let node = endNodeId;
      while (node) {
        path.unshift(node);
        node = cameFrom.get(node);
      }
      return path;
    }
    
    openSet.delete(current);
    
    // Check neighbors
    const currentAdjacency = graph.adjacencyList.find(([nodeId]) => nodeId === current);
    if (!currentAdjacency) continue;
    
    const neighbors = currentAdjacency[1];
    for (const neighborId of neighbors) {
      // Find edge between current and neighbor
      const forwardKey = `${current}->${neighborId}`;
      const reverseKey = `${neighborId}->${current}`;
      const edgeId = edgeLookupMap.get(forwardKey) || edgeLookupMap.get(reverseKey);
      
      if (!edgeId) continue;
      
      const edge = edgesMap.get(edgeId);
      if (!edge) continue;
      
      const tentativeG = gScore.get(current) + edge.properties.weight;
      
      if (!gScore.has(neighborId) || tentativeG < gScore.get(neighborId)) {
        cameFrom.set(neighborId, current);
        gScore.set(neighborId, tentativeG);
        
        const neighborNode = nodesMap.get(neighborId);
        const h = calculateDistance(neighborNode.lat, neighborNode.lon, endNode.lat, endNode.lon);
        fScore.set(neighborId, tentativeG + h);
        
        if (!openSet.has(neighborId)) {
          openSet.add(neighborId);
        }
      }
    }
  }
  
  return null; // No path found
}

function analyzeRoute(path) {
  if (!path || path.length < 2) return null;
  
  let totalWeight = 0;
  let totalDistance = 0;
  let safetyScores = [];
  let edgeCount = 0;
  
  for (let i = 0; i < path.length - 1; i++) {
    const fromNodeId = path[i];
    const toNodeId = path[i + 1];
    
    const forwardKey = `${fromNodeId}->${toNodeId}`;
    const reverseKey = `${toNodeId}->${fromNodeId}`;
    const edgeId = edgeLookupMap.get(forwardKey) || edgeLookupMap.get(reverseKey);
    
    if (edgeId) {
      const edge = edgesMap.get(edgeId);
      if (edge) {
        totalWeight += edge.properties.weight;
        totalDistance += edge.properties.length_meters;
        safetyScores.push(edge.properties.safety_score);
        edgeCount++;
      }
    }
  }
  
  const avgSafety = safetyScores.reduce((a, b) => a + b, 0) / safetyScores.length;
  const minSafety = Math.min(...safetyScores);
  const maxSafety = Math.max(...safetyScores);
  
  return {
    edgeCount,
    totalWeight,
    totalDistance,
    avgSafety,
    minSafety,
    maxSafety,
    safetyScores
  };
}

console.log('Testing route optimization with known safe vs unsafe segments...\n');

// Test 1: Find routes between different areas and analyze safety
console.log('--- Test 1: Route Safety Analysis ---');

// Define test points in DC
const testPoints = [
  { name: 'National Mall', lat: 38.8895, lon: -77.0353 },
  { name: 'Dupont Circle', lat: 38.9098, lon: -77.0434 },
  { name: 'Georgetown', lat: 38.9048, lon: -77.0673 },
  { name: 'Capitol Hill', lat: 38.8898, lon: -77.0091 },
  { name: 'Adams Morgan', lat: 38.9213, lon: -77.0431 }
];

const routes = [];

for (let i = 0; i < testPoints.length; i++) {
  for (let j = i + 1; j < testPoints.length; j++) {
    const start = testPoints[i];
    const end = testPoints[j];
    
    console.log(`\nRoute: ${start.name} -> ${end.name}`);
    
    const startNode = findNearestNode(start.lat, start.lon);
    const endNode = findNearestNode(end.lat, end.lon);
    
    if (!startNode || !endNode) {
      console.log('  ❌ Could not find nearest nodes');
      continue;
    }
    
    console.log(`  Start: ${startNode.id} (${startNode.lat.toFixed(6)}, ${startNode.lon.toFixed(6)})`);
    console.log(`  End: ${endNode.id} (${endNode.lat.toFixed(6)}, ${endNode.lon.toFixed(6)})`);
    
    const path = aStarSearch(startNode.id, endNode.id);
    
    if (!path) {
      console.log('  ❌ No path found');
      continue;
    }
    
    const analysis = analyzeRoute(path);
    if (analysis) {
      console.log(`  ✅ Path found: ${analysis.edgeCount} edges, ${analysis.totalDistance.toFixed(1)}m`);
      console.log(`  Safety: avg ${analysis.avgSafety.toFixed(2)}, min ${analysis.minSafety}, max ${analysis.maxSafety}`);
      console.log(`  Weight: ${analysis.totalWeight.toFixed(6)}`);
      
      routes.push({
        name: `${start.name} -> ${end.name}`,
        analysis,
        path
      });
    }
  }
}

// Test 2: Compare routes with different safety profiles
console.log('\n--- Test 2: Safety Profile Comparison ---');

if (routes.length > 0) {
  // Sort routes by average safety (safest first)
  const sortedBySafety = [...routes].sort((a, b) => a.analysis.avgSafety - b.analysis.avgSafety);
  
  console.log('\nRoutes sorted by average safety (safest first):');
  sortedBySafety.forEach((route, index) => {
    console.log(`${index + 1}. ${route.name}: avg safety ${route.analysis.avgSafety.toFixed(2)}`);
  });
  
  // Find routes with very different safety profiles
  const safestRoute = sortedBySafety[0];
  const leastSafeRoute = sortedBySafety[sortedBySafety.length - 1];
  
  console.log(`\nSafest route: ${safestRoute.name} (avg safety: ${safestRoute.analysis.avgSafety.toFixed(2)})`);
  console.log(`Least safe route: ${leastSafeRoute.name} (avg safety: ${leastSafeRoute.analysis.avgSafety.toFixed(2)})`);
  
  const safetyDifference = leastSafeRoute.analysis.avgSafety - safestRoute.analysis.avgSafety;
  console.log(`Safety difference: ${safetyDifference.toFixed(2)} points`);
  
  if (safetyDifference > 1.0) {
    console.log('✅ Significant safety variation detected - routing is considering safety');
  } else {
    console.log('⚠️ Limited safety variation - may indicate routing is not prioritizing safety enough');
  }
}

// Test 3: Check if safer routes are being chosen over shorter ones
console.log('\n--- Test 3: Safety vs Distance Trade-offs ---');

if (routes.length >= 2) {
  // Find routes with similar distances but different safety
  const similarDistanceRoutes = [];
  
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      const route1 = routes[i];
      const route2 = routes[j];
      const distanceDiff = Math.abs(route1.analysis.totalDistance - route2.analysis.totalDistance);
      const distanceRatio = distanceDiff / Math.min(route1.analysis.totalDistance, route2.analysis.totalDistance);
      
      if (distanceRatio < 0.2) { // Within 20% distance
        similarDistanceRoutes.push({
          route1,
          route2,
          distanceDiff,
          distanceRatio
        });
      }
    }
  }
  
  console.log(`Found ${similarDistanceRoutes.length} pairs of routes with similar distances`);
  
  if (similarDistanceRoutes.length > 0) {
    console.log('\nSimilar distance routes:');
    similarDistanceRoutes.forEach((pair, index) => {
      const { route1, route2 } = pair;
      const safetyDiff = Math.abs(route1.analysis.avgSafety - route2.analysis.avgSafety);
      
      console.log(`${index + 1}. ${route1.name} vs ${route2.name}`);
      console.log(`   Distance: ${route1.analysis.totalDistance.toFixed(1)}m vs ${route2.analysis.totalDistance.toFixed(1)}m`);
      console.log(`   Safety: ${route1.analysis.avgSafety.toFixed(2)} vs ${route2.analysis.avgSafety.toFixed(2)} (diff: ${safetyDiff.toFixed(2)})`);
      
      if (safetyDiff > 0.5) {
        console.log('   ✅ Significant safety difference for similar distances');
      } else {
        console.log('   ⚠️ Limited safety difference for similar distances');
      }
    });
  }
}

// Test 4: Verify that the algorithm is actually using safety scores
console.log('\n--- Test 4: Safety Score Usage Verification ---');

// Check if routes avoid the most unsafe segments
const allSafetyScores = [];
edgesMap.forEach(edge => {
  allSafetyScores.push(edge.properties.safety_score);
});

const safetyDistribution = {};
allSafetyScores.forEach(score => {
  safetyDistribution[score] = (safetyDistribution[score] || 0) + 1;
});

console.log('Overall safety score distribution in graph:');
Object.entries(safetyDistribution).sort(([a], [b]) => a - b).forEach(([score, count]) => {
  const percentage = (count / allSafetyScores.length * 100).toFixed(1);
  console.log(`  Safety ${score}: ${count} edges (${percentage}%)`);
});

// Check what safety scores are actually used in routes
const routeSafetyScores = [];
routes.forEach(route => {
  routeSafetyScores.push(...route.analysis.safetyScores);
});

const routeSafetyDistribution = {};
routeSafetyScores.forEach(score => {
  routeSafetyDistribution[score] = (routeSafetyDistribution[score] || 0) + 1;
});

console.log('\nSafety score distribution in actual routes:');
Object.entries(routeSafetyDistribution).sort(([a], [b]) => a - b).forEach(([score, count]) => {
  const percentage = (count / routeSafetyScores.length * 100).toFixed(1);
  console.log(`  Safety ${score}: ${count} edges (${percentage}%)`);
});

// Check if routes are biased toward safer scores
const graphSafeRatio = (safetyDistribution[4] + safetyDistribution[5]) / allSafetyScores.length;
const routeSafeRatio = ((routeSafetyDistribution[4] || 0) + (routeSafetyDistribution[5] || 0)) / routeSafetyScores.length;

console.log(`\nSafe route ratio (scores 4-5):`);
console.log(`  Graph: ${(graphSafeRatio * 100).toFixed(1)}%`);
console.log(`  Routes: ${(routeSafeRatio * 100).toFixed(1)}%`);

if (routeSafeRatio > graphSafeRatio) {
  console.log('✅ Routes are biased toward safer streets');
} else if (routeSafeRatio < graphSafeRatio * 0.8) {
  console.log('❌ Routes are not sufficiently biased toward safer streets');
} else {
  console.log('⚠️ Routes show some safety bias but may need improvement');
}

console.log('\n=== Route Optimization Testing Complete ===');

