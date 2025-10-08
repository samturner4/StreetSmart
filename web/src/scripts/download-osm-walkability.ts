import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// DC bounding box
const DC_BOUNDS = {
  north: 38.995,
  south: 38.791,
  east: -76.909,
  west: -77.119
};

async function downloadOSMWalkability() {
  console.log('Downloading OpenStreetMap walkability data for DC...');
  
  // Create output directory
  const outputDir = path.join(process.cwd(), 'data', 'osm-walkability');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Download OSM data for DC using Overpass API
  const overpassQuery = `
    [out:json][timeout:300];
    (
      way["highway"="footway"]["leisure"!="park"]["landuse"!="recreation_ground"]["natural"!="water"]["natural"!="wood"]["natural"!="forest"]["boundary"!="national_park"]["boundary"!="protected_area"](38.791,-77.119,38.995,-76.909);
      way["highway"="pedestrian"]["leisure"!="park"]["landuse"!="recreation_ground"]["natural"!="water"]["natural"!="wood"]["natural"!="forest"]["boundary"!="national_park"]["boundary"!="protected_area"](38.791,-77.119,38.995,-76.909);
      way["highway"="path"]["foot"!="no"]["leisure"!="park"]["landuse"!="recreation_ground"]["natural"!="water"]["natural"!="wood"]["natural"!="forest"]["boundary"!="national_park"]["boundary"!="protected_area"](38.791,-77.119,38.995,-76.909);
      way["highway"="residential"](38.791,-77.119,38.995,-76.909);
      way["highway"="service"](38.791,-77.119,38.995,-76.909);
      way["highway"="tertiary"](38.791,-77.119,38.995,-76.909);
      way["highway"="secondary"](38.791,-77.119,38.995,-76.909);
      way["highway"="primary"](38.791,-77.119,38.995,-76.909);
      way["highway"="trunk"](38.791,-77.119,38.995,-76.909);
      way["highway"="motorway_link"](38.791,-77.119,38.995,-76.909);
      way["highway"="unclassified"](38.791,-77.119,38.995,-76.909);
      way["highway"="living_street"](38.791,-77.119,38.995,-76.909);
      way["highway"="track"]["leisure"!="park"]["landuse"!="recreation_ground"]["natural"!="water"]["natural"!="wood"]["natural"!="forest"]["boundary"!="national_park"]["boundary"!="protected_area"](38.791,-77.119,38.995,-76.909);
      way["highway"="steps"]["leisure"!="park"]["landuse"!="recreation_ground"]["natural"!="water"]["natural"!="wood"]["natural"!="forest"]["boundary"!="national_park"]["boundary"!="protected_area"](38.791,-77.119,38.995,-76.909);
      way["highway"="corridor"](38.791,-77.119,38.995,-76.909);
    );
    out body;
    >;
    out skel qt;
  `;

  const overpassUrl = 'https://overpass-api.de/api/interpreter';
  
  try {
    console.log('Fetching walkable streets from OpenStreetMap...');
    const response = await fetch(overpassUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(overpassQuery)}`
    });

    if (response.ok) {
      const data = await response.json();
      const outputPath = path.join(outputDir, 'dc-walkable-streets.json');
      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
      console.log(`Downloaded ${data.elements?.length || 0} walkable street elements`);
      console.log('Data saved to:', outputPath);
    } else {
      console.error('Failed to download OSM data:', response.status);
    }
  } catch (error) {
    console.error('Error downloading OSM data:', error);
  }
}

// Alternative: Download a pre-filtered dataset
async function downloadPreFilteredData() {
  console.log('Downloading pre-filtered walkability data...');
  
  const outputDir = path.join(process.cwd(), 'data', 'osm-walkability');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Download from Geofabrik (pre-filtered OSM data)
  const geofabrikUrl = 'https://download.geofabrik.de/north-america/us/district-of-columbia-latest.osm.pbf';
  const outputPath = path.join(outputDir, 'dc-latest.osm.pbf');
  
  try {
    console.log('Downloading DC OSM data from Geofabrik...');
    const response = await fetch(geofabrikUrl);
    
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(outputPath, Buffer.from(buffer));
      console.log('Downloaded DC OSM data successfully!');
      console.log('File size:', (buffer.byteLength / 1024 / 1024).toFixed(2), 'MB');
    } else {
      console.error('Failed to download:', response.status);
    }
  } catch (error) {
    console.error('Error downloading:', error);
  }
}

// Run both methods
console.log('Starting OSM walkability data download...');
downloadOSMWalkability()
  .then(() => console.log('Overpass API download completed'))
  .catch(console.error);

downloadPreFilteredData()
  .then(() => console.log('Geofabrik download completed'))
  .catch(console.error); 