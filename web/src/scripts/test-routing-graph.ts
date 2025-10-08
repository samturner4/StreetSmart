import { loadRoutingGraph } from './routing';
import { isPointWalkable } from './process-osm-walkability';
import fs from 'fs';
import path from 'path';

async function testRoutingGraph() {
  console.log('Testing routing graph for Rock Creek Park exclusion...\n');

  // Load the routing graph
  const graph = loadRoutingGraph();
  console.log(`Loaded routing graph with ${graph.nodes.size} nodes and ${graph.edges.size} edges`);

  // Load OSM walkable areas for comparison
  const walkableAreasPath = path.join(process.cwd(), 'data', 'osm-walkability', 'walkable-areas.json');
  const walkableAreasArray = JSON.parse(fs.readFileSync(walkableAreasPath, 'utf-8'));
  const walkableAreas = new Map<string, boolean>();
  walkableAreasArray.forEach((key: string) => walkableAreas.set(key, true));

  // Test Rock Creek Park coordinates
  const rockCreekPoints = [
    { lat: 38.9647, lon: -77.0428, name: 'Rock Creek Park Center' },
    { lat: 38.9600, lon: -77.0400, name: 'Rock Creek Park North' },
    { lat: 38.9700, lon: -77.0450, name: 'Rock Creek Park Deep' },
    { lat: 38.9550, lon: -77.0380, name: 'Rock Creek Park South' },
    { lat: 38.9650, lon: -77.0350, name: 'Rock Creek Park East' }
  ];

  console.log('Testing if Rock Creek Park points are in routing graph:');
  for (const point of rockCreekPoints) {
    // Check if this point is walkable according to our filtering
    const isWalkable = isPointWalkable(point.lat, point.lon, walkableAreas);
    
    // Find nearest node in routing graph
    let nearestNode = null;
    let minDistance = Infinity;
    
    for (const [nodeId, node] of graph.nodes) {
      const distance = Math.sqrt(
        Math.pow(node.lat - point.lat, 2) + Math.pow(node.lon - point.lon, 2)
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestNode = node;
      }
    }
    
    const distanceInMeters = minDistance * 111000; // Rough conversion to meters
    console.log(`${point.name}:`);
    console.log(`  Walkable by OSM filter: ${isWalkable}`);
    console.log(`  Nearest graph node: ${nearestNode ? `${nearestNode.lat.toFixed(6)}, ${nearestNode.lon.toFixed(6)}` : 'None'}`);
    console.log(`  Distance to nearest node: ${distanceInMeters.toFixed(0)}m`);
    console.log('');
  }

  // Test some known walkable areas
  console.log('Testing known walkable areas:');
  const walkablePoints = [
    { lat: 38.9072, lon: -77.0369, name: 'DC Downtown' },
    { lat: 38.9200, lon: -77.0000, name: 'DC Residential' }
  ];

  for (const point of walkablePoints) {
    const isWalkable = isPointWalkable(point.lat, point.lon, walkableAreas);
    
    let nearestNode = null;
    let minDistance = Infinity;
    
    for (const [nodeId, node] of graph.nodes) {
      const distance = Math.sqrt(
        Math.pow(node.lat - point.lat, 2) + Math.pow(node.lon - point.lon, 2)
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestNode = node;
      }
    }
    
    const distanceInMeters = minDistance * 111000;
    console.log(`${point.name}:`);
    console.log(`  Walkable by OSM filter: ${isWalkable}`);
    console.log(`  Nearest graph node: ${nearestNode ? `${nearestNode.lat.toFixed(6)}, ${nearestNode.lon.toFixed(6)}` : 'None'}`);
    console.log(`  Distance to nearest node: ${distanceInMeters.toFixed(0)}m`);
    console.log('');
  }
}

testRoutingGraph().catch(console.error); 