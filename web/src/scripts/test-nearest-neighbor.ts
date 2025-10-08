import fs from 'fs';
import path from 'path';
import { isPointWalkable } from './process-osm-walkability';

async function testNearestNeighbor() {
  console.log('Testing nearest neighbor walkability function...\n');

  // Load OSM walkable areas
  const walkableAreasPath = path.join(process.cwd(), 'data', 'osm-walkability', 'walkable-areas.json');
  const walkableAreasArray = JSON.parse(fs.readFileSync(walkableAreasPath, 'utf-8'));
  const walkableAreas = new Map<string, boolean>();
  walkableAreasArray.forEach((key: string) => walkableAreas.set(key, true));
  
  console.log(`Loaded ${walkableAreas.size} walkable areas`);

  // Test some known DC coordinates
  const testPoints = [
    { lat: 38.9072, lon: -77.0369, name: 'DC Center' },
    { lat: 38.9647, lon: -77.0428, name: 'Rock Creek Park' },
    { lat: 38.8800, lon: -77.0200, name: 'Water Area' },
    { lat: 38.9200, lon: -77.0000, name: 'DC Area 1' },
    { lat: 38.9000, lon: -77.0500, name: 'DC Area 2' }
  ];

  console.log('Testing individual points:');
  for (const point of testPoints) {
    const isWalkable = isPointWalkable(point.lat, point.lon, walkableAreas);
    console.log(`${point.name}: ${isWalkable ? 'Walkable' : 'Non-walkable'}`);
  }

  // Test with a larger sample
  console.log('\nTesting larger sample...');
  let walkableCount = 0;
  const testCount = 1000;
  
  for (let i = 0; i < testCount; i++) {
    // Generate random DC coordinates
    const lat = 38.791 + Math.random() * (38.995 - 38.791);
    const lon = -77.119 + Math.random() * (-76.909 - (-77.119));
    
    if (isPointWalkable(lat, lon, walkableAreas)) {
      walkableCount++;
    }
  }
  
  const walkabilityRate = (walkableCount / testCount) * 100;
  console.log(`Random sample results: ${walkabilityRate.toFixed(1)}% walkable (${walkableCount}/${testCount})`);
}

testNearestNeighbor().catch(console.error); 