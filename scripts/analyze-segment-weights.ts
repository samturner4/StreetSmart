import fs from 'fs';
import path from 'path';
import csv from 'csv-parse/sync';

const OLD_WEIGHTS = {
  'HOMICIDE': 10,
  'ASSAULT W/DANGEROUS WEAPON': 8,
  'SEX ABUSE': 8,
  'ROBBERY': 7,
  'ARSON': 6,
  'BURGLARY': 4,
  'MOTOR VEHICLE THEFT': 3,
  'THEFT F/AUTO': 2,
  'THEFT/OTHER': 1
};

const NEW_WEIGHTS = {
  'HOMICIDE': 7042,
  'ASSAULT W/DANGEROUS WEAPON': 405,
  'SEX ABUSE': 1047,
  'ROBBERY': 583,
  'ARSON': 68,
  'BURGLARY': 187,
  'MOTOR VEHICLE THEFT': 84,
  'THEFT F/AUTO': 37,
  'THEFT/OTHER': 37
};

interface CrimeIncident {
  offense: string;
  latitude: number;
  longitude: number;
  year: number;
  timeOfDay: 'day' | 'night';
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

async function analyzeSegmentWithWeights(objectId: number, weights: typeof OLD_WEIGHTS) {
  // Load street segment
  const geojsonPath = path.join(process.cwd(), 'data/DC/crime-incidents/processed/street-safety-scores.geojson');
  const geojsonContent = fs.readFileSync(geojsonPath, 'utf-8');
  const geojson = JSON.parse(geojsonContent);

  const segment = geojson.features.find((f: any) => f.properties.OBJECTID === objectId);
  if (!segment) {
    console.error(`Segment ${objectId} not found!`);
    return;
  }

  // Get segment center
  const coords = segment.geometry.coordinates;
  const centerLat = coords.reduce((sum: number, point: number[]) => sum + point[1], 0) / coords.length;
  const centerLon = coords.reduce((sum: number, point: number[]) => sum + point[0], 0) / coords.length;

  // Process each year's crime data
  const years = ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];
  const crimesByType: { [key: string]: number } = {};
  let totalWeight = 0;

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
        const BASE_RADIUS = 200;

        if (distance <= BASE_RADIUS) {
          // Count crime
          crimesByType[offense] = (crimesByType[offense] || 0) + 1;

          // Calculate weight with distance decay
          const baseWeight = weights[offense] || 1;
          const temporalWeight = Math.max(0.5, (parseInt(year) - 2015) / (2025 - 2015));
          const distanceDecay = 1 - (distance / BASE_RADIUS);
          const weight = baseWeight * temporalWeight * distanceDecay;
          
          totalWeight += weight;
        }
      }
    });
  }

  console.log(`\nSegment OBJECTID ${objectId} (STREETSEGID: ${segment.properties.STREETSEGID})`);
  console.log('Crimes within 200m:');
  Object.entries(crimesByType)
    .sort(([,a], [,b]) => b - a)
    .forEach(([type, count]) => {
      console.log(`  ${type}: ${count} incidents`);
    });
  console.log(`Total Raw Weight: ${totalWeight.toFixed(2)}`);
}

async function main() {
  // Analyze Dupont Circle segment
  console.log("=== OLD WEIGHTS ===");
  await analyzeSegmentWithWeights(4539, OLD_WEIGHTS);
  await analyzeSegmentWithWeights(31671, OLD_WEIGHTS);

  console.log("\n=== NEW WEIGHTS ===");
  await analyzeSegmentWithWeights(4539, NEW_WEIGHTS);
  await analyzeSegmentWithWeights(31671, NEW_WEIGHTS);
}

main().catch(console.error);


