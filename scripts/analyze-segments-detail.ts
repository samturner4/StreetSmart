import fs from 'fs';
import path from 'path';
import csv from 'csv-parse/sync';

const OLD_WEIGHTS: { [key: string]: number } = {
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

const NEW_WEIGHTS: { [key: string]: number } = {
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

async function analyzeSegment(objectId: number) {
  // Load the segment
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

  console.log(`\nAnalyzing segment OBJECTID ${objectId} (${segment.properties.ST_NAME || 'unnamed'})`);
  console.log('Current safety score:', segment.properties.safety_score);
  console.log('Location:', centerLat.toFixed(4), centerLon.toFixed(4));

  // Track crimes by type within influence radius
  const crimeCounts: { [key: string]: { count: number, totalWeight: number, distances: number[] } } = {};
  let oldTotalWeight = 0;
  let newTotalWeight = 0;

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

      if (lat && lon && offense && OLD_WEIGHTS[offense] !== undefined) {  // Only count known crime types
        const distance = calculateDistance(centerLat, centerLon, lat, lon);
        const BASE_RADIUS = 200;

        if (distance <= BASE_RADIUS) {
          // Initialize crime type tracking if needed
          if (!crimeCounts[offense]) {
            crimeCounts[offense] = { count: 0, totalWeight: 0, distances: [] };
          }

          // Count crime
          crimeCounts[offense].count++;
          crimeCounts[offense].distances.push(distance);

          // Calculate weights with distance decay
          const temporalWeight = Math.max(0.5, (parseInt(year) - 2015) / (2025 - 2015));
          const distanceDecay = 1 - (distance / BASE_RADIUS);

          // Old weight
          const oldWeight = OLD_WEIGHTS[offense] * temporalWeight * distanceDecay;
          oldTotalWeight += oldWeight;

          // New weight
          const newWeight = NEW_WEIGHTS[offense] * temporalWeight * distanceDecay;
          newTotalWeight += newWeight;
          crimeCounts[offense].totalWeight += newWeight;
        }
      }
    });
  }

  // Report findings
  console.log('\nCrimes influencing this segment:');
  Object.entries(crimeCounts)
    .sort(([,a], [,b]) => b.totalWeight - a.totalWeight)
    .forEach(([type, data]) => {
      const avgDistance = data.distances.reduce((a, b) => a + b, 0) / data.distances.length;
      console.log(`${type}:`);
      console.log(`  Count: ${data.count}`);
      console.log(`  Average distance: ${avgDistance.toFixed(0)}m`);
      console.log(`  Total weight contribution: ${data.totalWeight.toFixed(2)}`);
    });

  console.log('\nWeight Summary:');
  console.log('Old weighting total:', oldTotalWeight.toFixed(2));
  console.log('New weighting total:', newTotalWeight.toFixed(2));

  // Highlight theft vs homicide
  const theftCount = (crimeCounts['THEFT F/AUTO']?.count || 0) + (crimeCounts['THEFT/OTHER']?.count || 0);
  const homicideCount = crimeCounts['HOMICIDE']?.count || 0;
  console.log('\nKey Metrics:');
  console.log(`Homicides within 200m: ${homicideCount}`);
  console.log(`Thefts within 200m: ${theftCount}`);
}

// Main execution
(async () => {
  console.log('=== DUPONT CIRCLE SEGMENT ===');
  await analyzeSegment(4539);

  console.log('\n=== NORTHEAST DC SEGMENT ===');
  await analyzeSegment(31671);
})().catch(console.error);