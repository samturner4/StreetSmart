import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

const CITIES = ['DC']; // Add more cities as needed

interface CityConfig {
  inputFile: string;
  outputDir: string;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

// City-specific configurations
const CITY_CONFIGS: { [key: string]: CityConfig } = {
  DC: {
    inputFile: 'crime-incidents/processed/street-safety-scores.geojson',
    outputDir: 'vector-tiles',
    bounds: {
      north: 38.995,
      south: 38.791,
      east: -76.909,
      west: -77.119
    }
  }
};

function checkTippecanoe() {
  try {
    // Use local tippecanoe executable
    const tippecanoePath = './tippecanoe/tippecanoe';
    console.log(`🔍 Checking tippecanoe at: ${tippecanoePath}`);
    console.log(`🔍 Current working directory: ${process.cwd()}`);
    
    execSync(`${tippecanoePath} --version`, { stdio: 'ignore' });
    console.log('✅ Tippecanoe found and working!');
    return true;
  } catch (e) {
    console.error('❌ Local tippecanoe not found. Please check the tippecanoe directory.');
    console.error('Error details:', e);
    return false;
  }
}

function generateVectorTiles(city: string) {
  const config = CITY_CONFIGS[city];
  if (!config) {
    console.error(`❌ No configuration found for city: ${city}`);
    return;
  }

  const inputPath = path.join(process.cwd(), 'data', city, config.inputFile);
  const outputDir = path.join(process.cwd(), 'data', city, config.outputDir);
  const outputPath = path.join(outputDir, 'safety-tiles.mbtiles');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Verify input file exists
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}`);
    return;
  }

  console.log(`\n🏙️ Processing ${city}...`);
  console.log(`📍 Input: ${inputPath}`);
  console.log(`📍 Output: ${outputPath}`);

  try {
    // Generate vector tiles using tippecanoe
    const tippecanoePath = './tippecanoe/tippecanoe';
    const args = [
      tippecanoePath,
      '-o', outputPath,
      '-Z9',                     // min zoom
      '-z15',                    // max zoom
      '--drop-rate=1',          // drop densest features first when simplifying
      '--minimum-zoom=9',        // features won't appear below this zoom
      '--maximum-zoom=15',       // features won't be further subdivided above this zoom
      '--generate-ids',          // generate unique IDs for features
      '--force',                 // overwrite existing files
      '--simplification=10',     // simplify geometries
      '--base-zoom=15',         // zoom level to preserve full detail
      '--include=safety_score',  // properties to preserve
      '--include=normalized_safety_score',  // normalized 1-100 scale
      '--include=ST_NAME',
      '--include=QUADRANT',
      '--layer=safety',         // layer name in the vector tiles
      inputPath
    ];

    console.log('\n🔨 Generating vector tiles...');
    console.log('Command:', args.join(' '));
    
    execSync(args.join(' '), { stdio: 'inherit' });
    
    console.log('\n✅ Vector tiles generated successfully!');
    console.log(`📦 Output file: ${outputPath}`);
    
    // Get file size
    const stats = fs.statSync(outputPath);
    console.log(`📊 File size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);

  } catch (error) {
    console.error('\n❌ Error generating vector tiles:', error);
  }
}

function main() {
  console.log('🗺️ Vector Tile Generation Script');
  
  // Check if tippecanoe is installed
  if (!checkTippecanoe()) {
    process.exit(1);
  }

  // Process each city
  for (const city of CITIES) {
    generateVectorTiles(city);
  }
}

main();

