const fs = require('fs');
const path = require('path');

// Load the routing graph
const graphPath = path.join(__dirname, 'data', 'DC', 'streets', 'processed', 'routing-graph.json');
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

console.log('=== Edge Properties Sanity Check ===\n');

// Convert arrays to Maps for easier access
const nodesMap = new Map(graph.nodes);
const edgesMap = new Map(graph.edges);
const edgeLookupMap = new Map(graph.edgeLookup || []);

// 1. Check edge count and structure
console.log(`Total edges: ${edgesMap.size}`);
console.log(`Total nodes: ${nodesMap.size}`);
console.log(`Edge lookup entries: ${edgeLookupMap.size}`);

// 2. Sample edge properties
const edgeEntries = Array.from(edgesMap.entries());
const sampleEdges = edgeEntries.slice(0, 5);

console.log('\n--- Sample Edge Properties ---');
sampleEdges.forEach(([edgeId, edge]) => {
  console.log(`Edge ${edgeId}:`);
  console.log(`  Safety Score: ${edge.properties.safety_score}`);
  console.log(`  Geometry Points: ${edge.properties.geometry ? edge.properties.geometry.length : 'MISSING'}`);
  console.log(`  Weight: ${edge.properties.weight}`);
  console.log(`  From: ${edge.sourceId} -> To: ${edge.targetId}`);
  console.log('');
});

// 3. Check for missing safety scores
let missingSafety = 0;
let missingGeometry = 0;
let invalidSafety = 0;

edgesMap.forEach(edge => {
  if (edge.properties.safety_score === undefined || edge.properties.safety_score === null) {
    missingSafety++;
  }
  if (edge.properties.safety_score < 1 || edge.properties.safety_score > 5) {
    invalidSafety++;
  }
  if (!edge.properties.geometry || edge.properties.geometry.length < 2) {
    missingGeometry++;
  }
});

console.log('--- Edge Property Issues ---');
console.log(`Missing safety scores: ${missingSafety}`);
console.log(`Invalid safety scores (not 1-5): ${invalidSafety}`);
console.log(`Missing/invalid geometry: ${missingGeometry}`);

// 4. Check edge lookup consistency
let lookupMismatches = 0;
edgeLookupMap.forEach((edgeId, key) => {
  if (!edgesMap.has(edgeId)) {
    lookupMismatches++;
  }
});

console.log(`Edge lookup mismatches: ${lookupMismatches}`);

// 5. Safety score distribution
const safetyCounts = {};
edgesMap.forEach(edge => {
  const score = edge.properties.safety_score;
  safetyCounts[score] = (safetyCounts[score] || 0) + 1;
});

console.log('\n--- Safety Score Distribution ---');
Object.entries(safetyCounts).sort(([a], [b]) => a - b).forEach(([score, count]) => {
  console.log(`Safety Score ${score}: ${count} edges`);
});

console.log('\n=== Edge Properties Check Complete ===');
