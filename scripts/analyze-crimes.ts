import fs from 'fs';
import path from 'path';

// Load the geojson to get segment locations
const geojsonPath = path.join(process.cwd(), 'data/DC/crime-incidents/processed/street-safety-scores.geojson');
const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf-8'));

// Find our segments
const dupontSegment = geojson.features.find((f: any) => f.properties.OBJECTID === 4539);
const queensSegment = geojson.features.find((f: any) => f.properties.OBJECTID === 31671);

console.log('Dupont Circle Segment (4539):');
console.log('Current safety score:', dupontSegment.properties.safety_score);
console.log('Raw crime score:', dupontSegment.properties.weighted_crime_score);

console.log('\nQueens Chapel Segment (31671):');
console.log('Current safety score:', queensSegment.properties.safety_score);
console.log('Raw crime score:', queensSegment.properties.weighted_crime_score);


