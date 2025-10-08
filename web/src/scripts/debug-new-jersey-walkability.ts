import fs from 'fs';
import path from 'path';
import { isPointWalkable } from './process-osm-walkability';

(async () => {
  const streetPath = path.join(process.cwd(), 'data/streets/Street_Centerlines.geojson');
  const streetGeojson = JSON.parse(fs.readFileSync(streetPath, 'utf-8'));

  const njSegments = streetGeojson.features.filter((f: any) => {
    const name = f.properties?.ST_NAME?.toLowerCase() || '';
    const quad = f.properties?.QUADRANT || '';
    return name.includes('new jersey ave') && quad === 'NW';
  });

  console.log(`Found ${njSegments.length} New Jersey Ave NW segments`);

  // Load walkable areas grid
  const walkablePath = path.join(process.cwd(), 'data/osm-walkability/walkable-areas.json');
  const walkKeys = JSON.parse(fs.readFileSync(walkablePath, 'utf-8')) as string[];
  const walkableAreas = new Map<string, boolean>();
  walkKeys.forEach(k => walkableAreas.set(k, true));

  let endpointsWalkable = 0;
  let midpointWalkable = 0;

  for (const seg of njSegments) {
    const coords = seg.geometry.coordinates;
    const startLon = coords[0][0];
    const startLat = coords[0][1];
    const endLon = coords[coords.length - 1][0];
    const endLat = coords[coords.length - 1][1];
    const mid = coords[Math.floor(coords.length / 2)];
    const midLon = mid[0];
    const midLat = mid[1];

    const startOk = isPointWalkable(startLat, startLon, walkableAreas);
    const endOk = isPointWalkable(endLat, endLon, walkableAreas);
    const midOk = isPointWalkable(midLat, midLon, walkableAreas);

    if (startOk && endOk) endpointsWalkable++;
    if (midOk) midpointWalkable++;
  }

  console.log(`Segments with both endpoints walkable: ${endpointsWalkable}`);
  console.log(`Segments with midpoint walkable: ${midpointWalkable}`);
})(); 