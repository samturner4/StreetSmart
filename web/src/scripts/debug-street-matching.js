const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

// Test the current normalization function
function normalizeStreetName(name) {
  if (!name) return '';
  
  // Remove leading dash and block number - CURRENT LOGIC
  let normalized = name.replace(/^-?\s*\d+\s+BLOCK\s+OF\s+/, '');
  
  // Street type abbreviations
  const streetTypes = {
    'AVENUE': 'AVE',
    'STREET': 'ST',
    'ROAD': 'RD',
    'BOULEVARD': 'BLVD',
    'CIRCLE': 'CIR',
    'COURT': 'CT',
    'DRIVE': 'DR',
    'LANE': 'LN',
    'PLACE': 'PL',
    'TERRACE': 'TER',
    'PARKWAY': 'PKWY'
  };

  normalized = normalized.toUpperCase();
  
  Object.entries(streetTypes).forEach(([full, abbr]) => {
    normalized = normalized.replace(new RegExp(`\\b${full}\\b`), abbr);
  });

  // Remove quadrant
  normalized = normalized.replace(/\s+(NW|NE|SW|SE)\s*$/, '');
  
  return normalized.trim();
}

// IMPROVED normalization function
function normalizeStreetNameImproved(name) {
  if (!name) return '';
  
  // Remove block number ranges like "3000 - 3099 BLOCK OF" or "100 BLOCK OF"
  let normalized = name.replace(/^-?\s*\d+(\s*-\s*\d+)?\s+BLOCK\s+OF\s+/, '');
  
  // Street type abbreviations
  const streetTypes = {
    'AVENUE': 'AVE',
    'STREET': 'ST',
    'ROAD': 'RD',
    'BOULEVARD': 'BLVD',
    'CIRCLE': 'CIR',
    'COURT': 'CT',
    'DRIVE': 'DR',
    'LANE': 'LN',
    'PLACE': 'PL',
    'TERRACE': 'TER',
    'PARKWAY': 'PKWY'
  };

  normalized = normalized.toUpperCase();
  
  Object.entries(streetTypes).forEach(([full, abbr]) => {
    normalized = normalized.replace(new RegExp(`\\b${full}\\b`), abbr);
  });

  // Remove quadrant
  normalized = normalized.replace(/\s+(NW|NE|SW|SE)\s*$/, '');
  
  return normalized.trim();
}

async function analyzeCrimeData() {
  const filePath = path.join(__dirname, '..', 'data', 'crime-incidents', '2024', 'Crime_Incidents_in_2024.csv');
  const sampleIncidents = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true }))
      .on('data', (row) => {
        if (row.BLOCK && sampleIncidents.length < 10) {
          sampleIncidents.push(row.BLOCK);
        }
      })
      .on('end', () => resolve(sampleIncidents))
      .on('error', reject);
  });
}

async function analyzeStreetData() {
  const filePath = path.join(__dirname, '..', 'data', 'streets', 'Street_Centerlines.geojson');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  const sampleStreets = data.features.slice(0, 10).map(f => f.properties.ST_NAME);
  return sampleStreets;
}

async function main() {
  console.log('=== STREET NAME MATCHING ANALYSIS ===\\n');
  
  const crimeBlocks = await analyzeCrimeData();
  const streetNames = await analyzeStreetData();
  
  console.log('Sample Crime Incident Blocks:');
  crimeBlocks.forEach((block, i) => {
    console.log(`${i+1}. "${block}"`);
    console.log(`   Current normalization: "${normalizeStreetName(block)}"`);
    console.log(`   Improved normalization: "${normalizeStreetNameImproved(block)}"`);
    console.log('');
  });
  
  console.log('Sample Street Names from GeoJSON:');
  streetNames.forEach((name, i) => {
    console.log(`${i+1}. "${name}"`);
    console.log(`   Normalized: "${normalizeStreetName(name || '')}"`);
    console.log('');
  });
  
  console.log('=== TESTING MATCHES ===\\n');
  
  // Test if we can find matches
  const normalizedStreets = streetNames.map(name => normalizeStreetName(name || ''));
  const normalizedCrimeImproved = crimeBlocks.map(block => normalizeStreetNameImproved(block));
  
  console.log('Potential matches with improved normalization:');
  normalizedCrimeImproved.forEach((crimeStreet, i) => {
    const matches = normalizedStreets.filter(street => street === crimeStreet);
    if (matches.length > 0) {
      console.log(`✓ "${crimeBlocks[i]}" matches "${matches[0]}"`);
    } else {
      console.log(`✗ "${crimeBlocks[i]}" -> "${crimeStreet}" (no match)`);
    }
  });
}

main().catch(console.error); 