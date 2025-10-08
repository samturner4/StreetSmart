import fs from 'fs';
import path from 'path';

// Load the GeoJSON data
const geojsonPath = path.join(process.cwd(), '..', 'data', 'DC', 'crime-incidents', 'processed', 'street-safety-scores.geojson');
const geojsonContent = fs.readFileSync(geojsonPath, 'utf-8');
const data = JSON.parse(geojsonContent);

// Segment IDs
const DUPONT_ID = 4539;  // Dupont Circle segment
const NE_ID = 31671;     // NE DC segment

// Helper to calculate segment length
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function getSegmentLength(geometry: any): number {
  let length = 0;
  if (geometry.type === 'MultiLineString') {
    for (const lineString of geometry.coordinates) {
      for (let i = 0; i < lineString.length - 1; i++) {
        length += calculateDistance(
          lineString[i][1], lineString[i][0],
          lineString[i+1][1], lineString[i+1][0]
        );
      }
    }
  } else {
    const coords = geometry.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      length += calculateDistance(
        coords[i][1], coords[i][0],
        coords[i+1][1], coords[i+1][0]
      );
    }
  }
  return length;
}

// Find and analyze segments
const dupontSegment = data.features.find((f: any) => f.properties.OBJECTID === DUPONT_ID);
const neSegment = data.features.find((f: any) => f.properties.OBJECTID === NE_ID);

if (!dupontSegment || !neSegment) {
  console.error('Could not find one or both segments!');
  process.exit(1);
}

// Calculate lengths
const dupontLength = getSegmentLength(dupontSegment.geometry);
const neLength = getSegmentLength(neSegment.geometry);

console.log('\n=== SEGMENT ANALYSIS ===');

console.log('\nDupont Circle Segment (OBJECTID 4539):');
console.log(`Street Name: ${dupontSegment.properties.ST_NAME}`);
console.log(`Length: ${Math.round(dupontLength)}m`);
console.log(`Raw Crime Score: ${dupontSegment.properties.weighted_crime_score.toFixed(2)}`);
console.log(`Normalized Safety Score: ${dupontSegment.properties.normalized_safety_score}`);
console.log(`Direct Crimes: ${dupontSegment.properties.crime_count}`);
console.log(`Influenced by: ${dupontSegment.properties.proximity_influences} crimes`);
console.log(`Score per meter: ${(dupontSegment.properties.weighted_crime_score / dupontLength).toFixed(2)}`);

console.log('\nNE DC Segment (OBJECTID 31671):');
console.log(`Street Name: ${neSegment.properties.ST_NAME}`);
console.log(`Length: ${Math.round(neLength)}m`);
console.log(`Raw Crime Score: ${neSegment.properties.weighted_crime_score.toFixed(2)}`);
console.log(`Normalized Safety Score: ${neSegment.properties.normalized_safety_score}`);
console.log(`Direct Crimes: ${neSegment.properties.crime_count}`);
console.log(`Influenced by: ${neSegment.properties.proximity_influences} crimes`);
console.log(`Score per meter: ${(neSegment.properties.weighted_crime_score / neLength).toFixed(2)}`);

// Find all segments within 150m of each target segment
function findNearbySegments(targetSegment: any, maxDistance: number = 150): any[] {
  const nearby: any[] = [];
  const targetCenter = targetSegment.geometry.type === 'MultiLineString' 
    ? targetSegment.geometry.coordinates[0][0] // Just use first point for simplicity
    : targetSegment.geometry.coordinates[0];

  data.features.forEach((segment: any) => {
    if (segment.properties.OBJECTID === targetSegment.properties.OBJECTID) return;

    const segmentCenter = segment.geometry.type === 'MultiLineString'
      ? segment.geometry.coordinates[0][0]
      : segment.geometry.coordinates[0];

    const distance = calculateDistance(
      targetCenter[1], targetCenter[0],
      segmentCenter[1], segmentCenter[0]
    );

    if (distance <= maxDistance) {
      nearby.push({
        ...segment,
        distance
      });
    }
  });

  return nearby;
}

const dupontNearby = findNearbySegments(dupontSegment);
const neNearby = findNearbySegments(neSegment);

console.log('\n=== NEARBY SEGMENTS ANALYSIS ===');
console.log('\nDupont Circle Area:');
console.log(`Number of nearby segments: ${dupontNearby.length}`);
console.log('Average safety score of nearby segments:', 
  (dupontNearby.reduce((sum, s) => sum + s.properties.normalized_safety_score, 0) / dupontNearby.length).toFixed(2)
);

console.log('\nNE DC Area:');
console.log(`Number of nearby segments: ${neNearby.length}`);
console.log('Average safety score of nearby segments:',
  (neNearby.reduce((sum, s) => sum + s.properties.normalized_safety_score, 0) / neNearby.length).toFixed(2)
);

