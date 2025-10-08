import { loadRoutingGraph } from './routing';
import { isPointWalkable } from './process-osm-walkability';
import fs from 'fs';
import path from 'path';

async function debugRoutingNodes() {
  console.log('Debugging routing nodes for specific coordinates...\n');

  // Load OSM walkable areas
  const walkableAreasPath = path.join(process.cwd(), 'data', 'osm-walkability', 'walkable-areas.json');
  const walkableAreasArray = JSON.parse(fs.readFileSync(walkableAreasPath, 'utf-8'));
  const walkableAreas = new Map<string, boolean>();
  walkableAreasArray.forEach((key: string) => walkableAreas.set(key, true));

  // Test the specific coordinates from the error
  const coordinates = [
    { lat: 38.972313, lon: -77.057173, name: '6278 29th st NW' },
    { lat: 38.96974, lon: -77.03177, name: '1356 Van buren st NW' }
  ];

  // Load routing graph
  const graph = loadRoutingGraph();
  console.log(`Loaded routing graph with ${graph.nodes.size} nodes and ${graph.edges.size} edges`);

  for (const coord of coordinates) {
    console.log(`\n--- ${coord.name} ---`);
    console.log(`Coordinates: ${coord.lat}, ${coord.lon}`);
    
    const isWalkable = isPointWalkable(coord.lat, coord.lon, walkableAreas);
    console.log(`Walkable: ${isWalkable}`);

    // Find nearest node
    let nearestNode = null;
    let minDistance = Infinity;

    for (const [nodeId, node] of graph.nodes) {
      const distance = Math.sqrt(
        Math.pow(node.lat - coord.lat, 2) + Math.pow(node.lon - coord.lon, 2)
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestNode = node;
      }
    }

    if (nearestNode) {
      console.log(`Nearest node: ${nearestNode.id} at (${nearestNode.lat}, ${nearestNode.lon})`);
      console.log(`Distance to nearest node: ${(minDistance * 111000).toFixed(0)} meters`); // Convert to meters
      
      // Check if this node has any edges
      const edges = Array.from(graph.edges.values()).filter(edge => 
        edge.sourceId === nearestNode.id || edge.targetId === nearestNode.id
      );
      console.log(`Number of edges from/to this node: ${edges.length}`);
      
      // If no edges, look for nearby connected nodes
      if (edges.length === 0) {
        console.log('Looking for nearby connected nodes...');
        let nearestConnectedNode = null;
        let minConnectedDistance = Infinity;
        
        for (const [nodeId, node] of graph.nodes) {
          const distance = Math.sqrt(
            Math.pow(node.lat - coord.lat, 2) + Math.pow(node.lon - coord.lon, 2)
          );
          
          // Check if this node has edges
          const nodeEdges = Array.from(graph.edges.values()).filter(edge => 
            edge.sourceId === nodeId || edge.targetId === nodeId
          );
          
          if (nodeEdges.length > 0 && distance < minConnectedDistance) {
            minConnectedDistance = distance;
            nearestConnectedNode = { ...node, edges: nodeEdges.length };
          }
        }
        
        if (nearestConnectedNode) {
          console.log(`Nearest connected node: ${nearestConnectedNode.id} at (${nearestConnectedNode.lat}, ${nearestConnectedNode.lon})`);
          console.log(`Distance to nearest connected node: ${(minConnectedDistance * 111000).toFixed(0)} meters`);
          console.log(`Number of edges: ${nearestConnectedNode.edges}`);
        } else {
          console.log('No connected nodes found within reasonable distance');
          
          // Look for any connected nodes in a larger area
          console.log('Searching for any connected nodes in a 2km radius...');
          let anyConnectedNode = null;
          let anyConnectedDistance = Infinity;
          
          for (const [nodeId, node] of graph.nodes) {
            const distance = Math.sqrt(
              Math.pow(node.lat - coord.lat, 2) + Math.pow(node.lon - coord.lon, 2)
            );
            
            // Check if this node has edges
            const nodeEdges = Array.from(graph.edges.values()).filter(edge => 
              edge.sourceId === nodeId || edge.targetId === nodeId
            );
            
            if (nodeEdges.length > 0 && distance < anyConnectedDistance) {
              anyConnectedDistance = distance;
              anyConnectedNode = { ...node, edges: nodeEdges.length };
            }
          }
          
          if (anyConnectedNode) {
            console.log(`Found connected node at ${(anyConnectedDistance * 111000).toFixed(0)}m: ${anyConnectedNode.id}`);
          } else {
            console.log('No connected nodes found anywhere in the graph!');
          }
        }
      }
    }
  }
}

debugRoutingNodes().catch(console.error); 