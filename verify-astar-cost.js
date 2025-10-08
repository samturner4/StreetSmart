const fs = require('fs');
const path = require('path');

// Load the routing graph
const graphPath = path.join(__dirname, 'data', 'DC', 'streets', 'processed', 'routing-graph.json');
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

console.log('=== A* Cost Function Verification ===\n');

// Convert arrays to Maps for easier access
const nodesMap = new Map(graph.nodes);
const edgesMap = new Map(graph.edges);

// Configuration for weight calculation (should match routing.ts)
const WEIGHT_FACTORS = {
  safety: 0.6,    // 60% weight for safety score
  distance: 0.4   // 40% weight for distance - increased to make distance more meaningful
};

// Function to calculate edge weight (should match build-routing-graph.ts)
function calculateEdgeWeight(edge) {
  const safetyScore = edge.properties.safety_score;
  const lengthMeters = edge.properties.length_meters;
  
  // Normalize safety score (1-5 → 0-1, inverted since higher safety should mean lower weight)
  const normalizedSafety = 1 - ((safetyScore - 1) / 4);
  
  // Normalize distance using typical block length (~100m) as reference
  // No cap - let long detours pay their full distance penalty
  const normalizedLength = lengthMeters / 100;
  
  // Combine weights (lower is better for routing)
  return (
    WEIGHT_FACTORS.safety * normalizedSafety +
    WEIGHT_FACTORS.distance * normalizedLength
  );
}

console.log('Analyzing A* cost function behavior...\n');

// Test 1: Verify weight calculation consistency
console.log('--- Test 1: Weight Calculation Consistency ---');
const sampleEdges = Array.from(edgesMap.entries()).slice(0, 10);

sampleEdges.forEach(([edgeId, edge]) => {
  const calculatedWeight = calculateEdgeWeight(edge);
  const storedWeight = edge.properties.weight;
  const diff = Math.abs(calculatedWeight - storedWeight);
  
  console.log(`Edge: ${edgeId.substring(0, 50)}...`);
  console.log(`  Safety: ${edge.properties.safety_score}, Length: ${edge.properties.length_meters.toFixed(2)}m`);
  console.log(`  Calculated: ${calculatedWeight.toFixed(6)}, Stored: ${storedWeight.toFixed(6)}, Diff: ${diff.toFixed(6)}`);
  console.log(`  ${diff < 0.000001 ? '✅' : '❌'} ${diff < 0.000001 ? 'Match' : 'Mismatch'}`);
  console.log('');
});

// Test 2: Verify safety score impact on weights
console.log('--- Test 2: Safety Score Impact Analysis ---');
const safetyImpact = {};

edgesMap.forEach(edge => {
  const safety = edge.properties.safety_score;
  const length = edge.properties.length_meters;
  const weight = edge.properties.weight;
  
  if (!safetyImpact[safety]) {
    safetyImpact[safety] = { count: 0, totalWeight: 0, totalLength: 0, weights: [] };
  }
  
  safetyImpact[safety].count++;
  safetyImpact[safety].totalWeight += weight;
  safetyImpact[safety].totalLength += length;
  safetyImpact[safety].weights.push(weight);
});

console.log('Safety Score Impact on Weights:');
Object.entries(safetyImpact).sort(([a], [b]) => a - b).forEach(([safety, data]) => {
  const avgWeight = data.totalWeight / data.count;
  const avgLength = data.totalLength / data.count;
  const minWeight = Math.min(...data.weights);
  const maxWeight = Math.max(...data.weights);
  
  console.log(`Safety Score ${safety}:`);
  console.log(`  Count: ${data.count} edges`);
  console.log(`  Avg Weight: ${avgWeight.toFixed(6)}`);
  console.log(`  Avg Length: ${avgLength.toFixed(2)}m`);
  console.log(`  Weight Range: ${minWeight.toFixed(6)} - ${maxWeight.toFixed(6)}`);
  console.log('');
});

// Test 3: Verify that safer edges have lower weights (for same distance)
console.log('--- Test 3: Safety vs Weight Relationship ---');
const lengthGroups = {};

// Group edges by similar lengths
edgesMap.forEach(edge => {
  const length = edge.properties.length_meters;
  const lengthGroup = Math.round(length * 10) / 10; // Round to nearest 0.1m
  
  if (!lengthGroups[lengthGroup]) {
    lengthGroups[lengthGroup] = [];
  }
  
  lengthGroups[lengthGroup].push({
    safety: edge.properties.safety_score,
    weight: edge.properties.weight,
    length: edge.properties.length_meters
  });
});

console.log('Weight vs Safety for Similar Lengths:');
Object.entries(lengthGroups)
  .filter(([length, edges]) => edges.length >= 3) // Only groups with 3+ edges
  .slice(0, 5) // Show first 5 groups
  .forEach(([length, edges]) => {
    console.log(`\nLength ~${length}m (${edges.length} edges):`);
    
    // Group by safety score
    const bySafety = {};
    edges.forEach(edge => {
      if (!bySafety[edge.safety]) bySafety[edge.safety] = [];
      bySafety[edge.safety].push(edge.weight);
    });
    
    Object.entries(bySafety).sort(([a], [b]) => a - b).forEach(([safety, weights]) => {
      const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
      console.log(`  Safety ${safety}: avg weight ${avgWeight.toFixed(6)} (${weights.length} edges)`);
    });
  });

// Test 4: Verify A* heuristic consistency
console.log('\n--- Test 4: A* Heuristic Analysis ---');

// Sample some nodes and calculate heuristic distances
const sampleNodes = Array.from(nodesMap.entries()).slice(0, 5);
const testNode = sampleNodes[0];

console.log(`Using test node: ${testNode[0]}`);
console.log('Distance to other sample nodes:');

sampleNodes.slice(1).forEach(([nodeId, node]) => {
  const lat1 = testNode[1].lat;
  const lon1 = testNode[1].lon;
  const lat2 = node.lat;
  const lon2 = node.lon;
  
  // Haversine distance calculation (should match routing.ts)
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  console.log(`  ${nodeId}: ${distance.toFixed(2)}m`);
});

// Test 5: Verify edge lookup functionality
console.log('\n--- Test 5: Edge Lookup Verification ---');
const edgeLookupMap = new Map(graph.edgeLookup || []);

console.log(`Edge lookup entries: ${edgeLookupMap.size}`);

if (edgeLookupMap.size === 0) {
  console.log('❌ Edge lookup is empty - this will cause routing issues!');
  console.log('   The routing algorithm needs edgeLookup for bidirectional edge finding.');
} else {
  console.log('✅ Edge lookup has entries');
  
  // Test a few lookups
  const sampleLookups = Array.from(edgeLookupMap.entries()).slice(0, 3);
  sampleLookups.forEach(([key, edgeId]) => {
    const edge = edgesMap.get(edgeId);
    console.log(`  Lookup "${key}" -> Edge "${edgeId}"`);
    console.log(`    Edge exists: ${edge ? '✅' : '❌'}`);
    if (edge) {
      console.log(`    Safety: ${edge.properties.safety_score}, Weight: ${edge.properties.weight.toFixed(6)}`);
    }
  });
}

console.log('\n=== A* Cost Function Verification Complete ===');
