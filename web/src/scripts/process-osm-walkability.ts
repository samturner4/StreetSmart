import fs from 'fs';
import path from 'path';
import { loadStreetCenterlines } from './utils';

interface OSMWay {
  id: number;
  type: string;
  tags: {
    highway?: string;
    foot?: string;
    motor_vehicle?: string;
    motorcar?: string;
    motorcycle?: string;
    bicycle?: string;
    [key: string]: string | undefined;
  };
  nodes: number[];
}

interface OSMNode {
  id: number;
  type: string;
  lat: number;
  lon: number;
}

interface OSMRelation {
  id: number;
  type: string;
  tags: {
    leisure?: string;
    boundary?: string;
    landuse?: string;
    natural?: string;
    name?: string;
    [key: string]: string | undefined;
  };
  members: Array<{
    type: string;
    ref: number;
    role: string;
  }>;
}

interface OSMData {
  elements: Array<OSMWay | OSMNode | OSMRelation>;
}

// Walkable highway types - ONLY ACTUAL STREETS for nighttime safety
const WALKABLE_HIGHWAYS = new Set([
  'residential',
  'service',
  'tertiary',
  'secondary',
  'primary',
  'trunk',
  'motorway_link',
  'unclassified',
  'living_street'
]);

function isWalkableWay(way: OSMWay): boolean {
  const highway = way.tags.highway;
  if (!highway || !WALKABLE_HIGHWAYS.has(highway)) {
    return false;
  }

  // Check if explicitly marked as non-walkable
  if (way.tags.foot === 'no') {
    return false;
  }

  // NOTE: We no longer exclude streets with access=private|no because many legitimate paved roads
  // (e.g., military-base streets that are publicly traversable) are tagged this way. The overall
  // night-safety exclusions (parks, paths, tracks, etc.) still apply.

  // EXCLUDE ALL PARK AND NATURAL AREAS - these are inaccessible at night
  if (way.tags.leisure === 'park' || 
      way.tags.landuse === 'recreation_ground' ||
      way.tags.natural === 'water' ||
      way.tags.natural === 'wood' ||
      way.tags.natural === 'forest' ||
      way.tags.boundary === 'national_park' ||
      way.tags.boundary === 'protected_area' ||
      way.tags.natural === 'scrub' ||
      way.tags.natural === 'grassland' ||
      way.tags.landuse === 'grass' ||
      way.tags.landuse === 'meadow') {
    return false;
  }

  // EXCLUDE ALL PATHS, FOOTWAYS, AND PEDESTRIAN AREAS - too risky for nighttime
  // Only allow actual streets with proper lighting and urban context
  if (highway === 'path' || highway === 'footway' || highway === 'pedestrian') {
    return false;
  }

  // EXCLUDE TRACKS - these are usually unpaved rural roads
  if (highway === 'track') {
    return false;
  }

  // EXCLUDE STEPS - dangerous at night
  if (highway === 'steps') {
    return false;
  }

  // EXCLUDE CORRIDORS - usually indoor or institutional
  if (highway === 'corridor') {
    return false;
  }

  // ONLY ALLOW ACTUAL STREETS that are:
  // - residential, service, tertiary, secondary, primary, trunk, motorway_link, unclassified, living_street
  // - These are actual streets with proper lighting and urban context

  return true;
}

async function processOSMWalkability() {
  console.log('Processing OSM walkability data...');

  // Load OSM data
  const city = process.env.CITY || 'DC';
  const osmPath = path.join(process.cwd(), 'data', city, 'osm-walkability', `${city.toLowerCase()}-walkable-streets.json`);
  const osmData: OSMData = JSON.parse(fs.readFileSync(osmPath, 'utf-8'));

  // Separate nodes, ways, and relations
  const nodes = new Map<number, OSMNode>();
  const ways = new Map<number, OSMWay>();
  const relations: OSMRelation[] = [];
  const walkableWays: OSMWay[] = [];

  console.log('Processing OSM elements...');
  for (const element of osmData.elements) {
    if (element.type === 'node') {
      nodes.set(element.id, element as OSMNode);
    } else if (element.type === 'way') {
      const way = element as OSMWay;
      ways.set(way.id, way);
    } else if (element.type === 'relation') {
      relations.push(element as OSMRelation);
    }
  }

  console.log(`Found ${nodes.size} nodes, ${ways.size} ways, and ${relations.length} relations`);



  // Process ways for walkability
  for (const way of ways.values()) {
    if (isWalkableWay(way)) {
      walkableWays.push(way);
    }
  }

  console.log(`Found ${walkableWays.length} walkable ways`);

  // Create a spatial index for walkable areas
  const walkableAreas = new Map<string, boolean>();
  
  console.log('Creating spatial index for walkable areas...');
  for (const way of walkableWays) {
    // Get coordinates for this way
    const coordinates: [number, number][] = [];
    for (const nodeId of way.nodes) {
      const node = nodes.get(nodeId);
      if (node) {
        coordinates.push([node.lat, node.lon]);
      }
    }

    // Add all points along this way to the walkable areas
    for (const [lat, lon] of coordinates) {
      const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      walkableAreas.set(key, true);
    }
  }

  console.log(`Created spatial index with ${walkableAreas.size} walkable points`);

  // Save the walkable areas for quick lookup
  const outputDir = path.join(process.cwd(), 'data', city, 'osm-walkability');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'walkable-areas.json');
  const walkableAreasArray = Array.from(walkableAreas.keys());
  fs.writeFileSync(outputPath, JSON.stringify(walkableAreasArray, null, 2));
  console.log('Walkable areas saved to:', outputPath);

  // Test with our street segments
  console.log('\nTesting with street segments...');
  const streets = await loadStreetCenterlines();
  console.log(`Loaded ${streets.features.length} street segments`);

  let walkableCount = 0;
  let nonWalkableCount = 0;

  // Test first 100 segments
  const testSegments = streets.features.slice(0, 100);
  for (const segment of testSegments) {
    const center = getSegmentCenter(segment);
    const key = `${center.lat.toFixed(4)},${center.lon.toFixed(4)}`;
    
    if (walkableAreas.has(key)) {
      walkableCount++;
    } else {
      nonWalkableCount++;
    }
  }

  console.log(`Test results (first 100 segments):`);
  console.log(`- Walkable: ${walkableCount}`);
  console.log(`- Non-walkable: ${nonWalkableCount}`);
  console.log(`- Walkability rate: ${(walkableCount / 100 * 100).toFixed(1)}%`);

  return walkableAreas;
}

// Helper function to get segment center
function getSegmentCenter(segment: any): { lat: number, lon: number } {
  const coords = segment.geometry.coordinates;
  const midIndex = Math.floor(coords.length / 2);
  return {
    lon: coords[midIndex][0],
    lat: coords[midIndex][1]
  };
}

// Export function to check if a point is walkable using nearest neighbor approach
export function isPointWalkable(lat: number, lon: number, walkableAreas: Map<string, boolean>): boolean {
  // Debug: Check if lat and lon are numbers
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    console.error('isPointWalkable received non-number values:', { lat, lon, latType: typeof lat, lonType: typeof lon });
    return false;
  }
  
  // First try exact match
  const exactKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (walkableAreas.has(exactKey)) {
    return true;
  }
  
  // If no exact match, check within ~100m radius (0.001 degrees) - increased for better coverage
  for (let latOffset = -0.001; latOffset <= 0.001; latOffset += 0.0001) {
    for (let lonOffset = -0.001; lonOffset <= 0.001; lonOffset += 0.0001) {
      const testLat = lat + latOffset;
      const testLon = lon + lonOffset;
      const key = `${testLat.toFixed(4)},${testLon.toFixed(4)}`;
      
      if (walkableAreas.has(key)) {
        return true;
      }
    }
  }
  
  return false;
}



// Run the processing only if this script is executed directly (e.g. `ts-node process-osm-walkability.ts`)
// This prevents the heavy OSM parsing from running every time the module is merely imported.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - `require` is available in the CommonJS runtime used by ts-node
if (typeof require !== 'undefined' && require.main === module) {
  processOSMWalkability()
    .then(() => console.log('OSM walkability processing completed!'))
    .catch(console.error);
} 