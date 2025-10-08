import { isPointWalkable } from './process-osm-walkability';
import fs from 'fs';
import path from 'path';

async function debugWalkabilityCoordinates() {
  console.log('Debugging walkability for specific coordinates...\n');

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

  console.log('Testing walkability of specific coordinates:');
  for (const coord of coordinates) {
    console.log(`\n--- ${coord.name} ---`);
    console.log(`Coordinates: ${coord.lat}, ${coord.lon}`);
    
    // Check Rock Creek Park bounds
    const rockCreekBounds = {
      north: 38.975,
      south: 38.950,
      east: -77.030,
      west: -77.055
    };
    const inRockCreek = coord.lat >= rockCreekBounds.south && coord.lat <= rockCreekBounds.north &&
                       coord.lon >= rockCreekBounds.west && coord.lon <= rockCreekBounds.east;
    console.log(`In Rock Creek Park bounds: ${inRockCreek}`);
    
    const isWalkable = isPointWalkable(coord.lat, coord.lon, walkableAreas);
    console.log(`Walkable: ${isWalkable}`);
    
    // Check what's in the spatial index around these coordinates
    console.log('\nChecking spatial index around coordinates:');
    for (let latOffset = -0.001; latOffset <= 0.001; latOffset += 0.0001) {
      for (let lonOffset = -0.001; lonOffset <= 0.001; lonOffset += 0.0001) {
        const testLat = coord.lat + latOffset;
        const testLon = coord.lon + lonOffset;
        const key = `${testLat.toFixed(4)},${testLon.toFixed(4)}`;
        if (walkableAreas.has(key)) {
          console.log(`Found walkable area at: ${testLat.toFixed(6)}, ${testLon.toFixed(6)} (offset: ${latOffset.toFixed(4)}, ${lonOffset.toFixed(4)})`);
        }
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total walkable areas in index: ${walkableAreas.size}`);
  console.log('These coordinates should be walkable if they are legitimate street addresses.');
}

debugWalkabilityCoordinates().catch(console.error); 