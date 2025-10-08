import fs from 'fs';
import path from 'path';

interface SegmentStats {
  length: number;
  connectedCount: number;
  nearbyCount: number;
  nearbyLength: number;
  isCircle: boolean;
  isIntersection: boolean;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function analyzeSegment(objectId: number, geojson: any): SegmentStats {
  const segment = geojson.features.find((f: any) => f.properties.OBJECTID === objectId);
  if (!segment) {
    throw new Error(`Segment ${objectId} not found!`);
  }

  // Calculate segment length
  const coords = segment.geometry.coordinates;
  let segmentLength = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    segmentLength += calculateDistance(
      coords[i][1], coords[i][0],
      coords[i+1][1], coords[i+1][0]
    );
  }

  // Find connected segments (segments that share an endpoint)
  const startPoint = coords[0];
  const endPoint = coords[coords.length - 1];
  
  const connectedSegments = geojson.features.filter((f: any) => {
    if (f.properties.OBJECTID === objectId) return false;
    
    const fCoords = f.geometry.coordinates;
    const fStart = fCoords[0];
    const fEnd = fCoords[fCoords.length - 1];
    
    // Check if any endpoints match (within small tolerance)
    const tolerance = 0.0001; // about 10 meters
    return (
      (Math.abs(startPoint[0] - fStart[0]) < tolerance && Math.abs(startPoint[1] - fStart[1]) < tolerance) ||
      (Math.abs(startPoint[0] - fEnd[0]) < tolerance && Math.abs(startPoint[1] - fEnd[1]) < tolerance) ||
      (Math.abs(endPoint[0] - fStart[0]) < tolerance && Math.abs(endPoint[1] - fStart[1]) < tolerance) ||
      (Math.abs(endPoint[0] - fEnd[0]) < tolerance && Math.abs(endPoint[1] - fEnd[1]) < tolerance)
    );
  });

  // Find segments within 150m (our influence radius)
  const segmentCenter = coords.reduce((sum: number[], point: number[]) => [sum[0] + point[1], sum[1] + point[0]], [0,0])
    .map((sum: number) => sum / coords.length);

  const nearbySegments = geojson.features.filter((f: any) => {
    if (f.properties.OBJECTID === objectId) return false;
    
    const fCenter = f.geometry.coordinates.reduce((sum: number[], point: number[]) => [sum[0] + point[1], sum[1] + point[0]], [0,0])
      .map((sum: number) => sum / f.geometry.coordinates.length);
    
    const dist = calculateDistance(segmentCenter[0], segmentCenter[1], fCenter[0], fCenter[1]);
    return dist <= 150;
  });

  // Calculate total length of nearby segments
  const nearbyLength = nearbySegments.reduce((sum: number, f: any) => {
    const fCoords = f.geometry.coordinates;
    let length = 0;
    for (let i = 0; i < fCoords.length - 1; i++) {
      length += calculateDistance(
        fCoords[i][1], fCoords[i][0],
        fCoords[i+1][1], fCoords[i+1][0]
      );
    }
    return sum + length;
  }, 0);

  console.log(`\nAnalyzing segment OBJECTID ${objectId} (${segment.properties.ST_NAME || 'unnamed'})`);
  console.log(`Length: ${Math.round(segmentLength)}m`);
  console.log(`Connected segments: ${connectedSegments.length}`);
  console.log('Connected to:');
  connectedSegments.forEach((f: any) => {
    console.log(`  ${f.properties.ST_NAME || 'unnamed'} (ID: ${f.properties.OBJECTID})`);
  });
  console.log(`\nSegments within 150m: ${nearbySegments.length}`);
  console.log(`Total length of nearby street network: ${Math.round(nearbyLength)}m`);
  console.log(`Average segment length in area: ${Math.round(nearbyLength / nearbySegments.length)}m`);

  // Check if this is part of a major intersection/circle
  const isCircle = segment.properties.ST_NAME?.toLowerCase().includes('cir') || 
                   connectedSegments.some((f: any) => f.properties.ST_NAME?.toLowerCase().includes('cir'));
  const isIntersection = connectedSegments.length > 2;
  
  if (isCircle) console.log('\nThis segment is part of or connects to a circle/roundabout');
  if (isIntersection) console.log(`This segment is part of an intersection (${connectedSegments.length} connections)`);

  return {
    length: segmentLength,
    connectedCount: connectedSegments.length,
    nearbyCount: nearbySegments.length,
    nearbyLength,
    isCircle,
    isIntersection
  };
}

// Load data
const geojsonPath = path.join(process.cwd(), 'data/DC/crime-incidents/processed/street-safety-scores.geojson');
const geojsonContent = fs.readFileSync(geojsonPath, 'utf-8');
const geojson = JSON.parse(geojsonContent);

console.log('=== COMPARING SEGMENT STRUCTURE ===');

const dupontStats = analyzeSegment(4539, geojson);  // Dupont
const neStats = analyzeSegment(31671, geojson);     // NE DC

console.log('\n=== COMPARISON ===');
console.log('Metric               Dupont    NE DC');
console.log('-'.repeat(40));
console.log(`Segment length       ${Math.round(dupontStats.length).toString().padEnd(9)} ${Math.round(neStats.length)}m`);
console.log(`Connected segments   ${dupontStats.connectedCount.toString().padEnd(9)} ${neStats.connectedCount}`);
console.log(`Nearby segments      ${dupontStats.nearbyCount.toString().padEnd(9)} ${neStats.nearbyCount}`);
console.log(`Total nearby length  ${Math.round(dupontStats.nearbyLength).toString().padEnd(9)} ${Math.round(neStats.nearbyLength)}m`);