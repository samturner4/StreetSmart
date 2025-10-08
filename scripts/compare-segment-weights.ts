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

interface CrimeImpact {
  offense: string;
  distance: number;
  year: number;
  timeOfDay: 'day' | 'night';
  weight: number;
}

async function analyzeSegmentWithWeights(objectId: number, weights: typeof OLD_WEIGHTS) {
  const geojsonPath = path.join(process.cwd(), 'data/DC/crime-incidents/processed/street-safety-scores.geojson');
  const geojsonContent = fs.readFileSync(geojsonPath, 'utf-8');
  const geojson = JSON.parse(geojsonContent);

  // Find our target segment
  const segment = geojson.features.find((f: any) => f.properties.OBJECTID === objectId);
  if (!segment) {
    console.error(`Segment ${objectId} not found!`);
    return;
  }

  const segmentScore = segment.properties.safety_score;
  const normalizedScore = segment.properties.normalized_safety_score;

  console.log(`\nSegment OBJECTID ${objectId} (STREETSEGID: ${segment.properties.STREETSEGID})`);
  console.log(`Raw Safety Score: ${segmentScore}`);
  console.log(`Normalized Score (1-100): ${normalizedScore}`);
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


