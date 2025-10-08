import fs from 'fs';
import path from 'path';
import csv from 'csv-parse/sync';

interface GeoJSONFeature {
  properties: {
    OBJECTID: number;
    ST_NAME?: string;
    crime_count: number;
  };
  geometry: {
    coordinates: number[][];
  };
}

interface NearbySegment {
  id: number;
  name: string | undefined;
  crimeCount: number;
}

interface CrimeType {
  type: string;
  newCount: number;
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

async function analyzeCrimeDensity(objectId: number) {
  // Load the segment
  const geojsonPath = path.join(process.cwd(), 'data/DC/crime-incidents/processed/street-safety-scores.geojson');
  const geojsonContent = fs.readFileSync(geojsonPath, 'utf-8');
  const geojson = JSON.parse(geojsonContent);

  const segment = geojson.features.find((f: GeoJSONFeature) => f.properties.OBJECTID === objectId);
  if (!segment) {
    console.error(`Segment ${objectId} not found!`);
    return;
  }

  // Get segment center and length
  const coords = segment.geometry.coordinates;
  const centerLat = coords.reduce((sum: number, point: number[]) => sum + point[1], 0) / coords.length;
  const centerLon = coords.reduce((sum: number, point: number[]) => sum + point[0], 0) / coords.length;
  
  // Calculate segment length
  let segmentLength = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    segmentLength += calculateDistance(
      coords[i][1], coords[i][0],
      coords[i+1][1], coords[i+1][0]
    );
  }

  console.log(`\nAnalyzing segment OBJECTID ${objectId} (${segment.properties.ST_NAME || 'unnamed'})`);
  console.log('Center:', centerLat.toFixed(6), centerLon.toFixed(6));
  console.log('Length:', Math.round(segmentLength), 'meters');

  // Track crimes by distance bands
  const bands = [25, 50, 100, 150, 200];
  const crimesByBand: { [key: number]: { total: number, byType: { [key: string]: number } } } = {};
  bands.forEach(band => {
    crimesByBand[band] = { total: 0, byType: {} };
  });

  // Process each year's crime data
  const years = ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];
  
  for (const year of years) {
    const crimePath = path.join(process.cwd(), `data/DC/crime-incidents/${year}/Crime_Incidents_in_${year}.csv`);
    if (!fs.existsSync(crimePath)) continue;

    const fileContent = fs.readFileSync(crimePath, 'utf-8');
    const records = csv.parse(fileContent, { columns: true, skip_empty_lines: true });

    records.forEach((record: any) => {
      const lat = parseFloat(record.LATITUDE || record.Y || record.latitude || '0');
      const lon = parseFloat(record.LONGITUDE || record.X || record.longitude || '0');
      const offense = record.OFFENSE || record.OFFENSE_TYPE || record.offense;

      if (lat && lon && offense) {
        const distance = calculateDistance(centerLat, centerLon, lat, lon);
        
        // Count in each band that contains this distance
        bands.forEach(band => {
          if (distance <= band) {
            crimesByBand[band].total++;
            crimesByBand[band].byType[offense] = (crimesByBand[band].byType[offense] || 0) + 1;
          }
        });
      }
    });
  }

  // Report findings
  console.log('\nCrime density by distance:');
  bands.forEach((band, i) => {
    const prevBand = i > 0 ? bands[i-1] : 0;
    const totalInBand = crimesByBand[band].total;
    const newInBand = totalInBand - (i > 0 ? crimesByBand[prevBand].total : 0);
    const area = Math.PI * (band * band - prevBand * prevBand);
    const density = newInBand / area * 1000000; // crimes per km²

    console.log(`\n${prevBand}-${band}m:`);
    console.log(`  New crimes in band: ${newInBand}`);
    console.log(`  Density: ${density.toFixed(1)} crimes/km²`);
    
    // Show top crime types in this band
    const crimeTypes = Object.entries(crimesByBand[band].byType)
      .map(([type, count]): CrimeType => ({
        type,
        newCount: count - (i > 0 ? (crimesByBand[prevBand].byType[type] || 0) : 0)
      }))
      .filter(c => c.newCount > 0)
      .sort((a, b) => b.newCount - a.newCount)
      .slice(0, 3);
    
    console.log('  Top crimes:');
    crimeTypes.forEach(c => console.log(`    ${c.type}: ${c.newCount}`));
  });

  // Compare to nearby segments
  console.log('\nAnalyzing nearby segments for comparison...');
  const nearbySegments = geojson.features
    .filter((f: GeoJSONFeature) => {
      if (f.properties.OBJECTID === objectId) return false;
      const fCenter = f.geometry.coordinates.reduce((sum: number[], point: number[]) => [sum[0] + point[1], sum[1] + point[0]], [0,0])
        .map((sum: number) => sum / f.geometry.coordinates.length);
      const dist = calculateDistance(centerLat, centerLon, fCenter[0], fCenter[1]);
      return dist <= 200;
    })
    .map((f: GeoJSONFeature): NearbySegment => ({
      id: f.properties.OBJECTID,
      name: f.properties.ST_NAME,
      crimeCount: f.properties.crime_count
    }))
    .sort((a: NearbySegment, b: NearbySegment) => b.crimeCount - a.crimeCount)
    .slice(0, 5);

  console.log('\nTop 5 nearby segments by crime count:');
  nearbySegments.forEach((s: NearbySegment) => {
    console.log(`  ${s.name || 'unnamed'} (ID: ${s.id}): ${s.crimeCount} crimes`);
  });
}

// Analyze Dupont Circle segment
console.log('=== ANALYZING DUPONT CIRCLE CRIME DENSITY ===');
(async () => {
  await analyzeCrimeDensity(4539);
})().catch(console.error);