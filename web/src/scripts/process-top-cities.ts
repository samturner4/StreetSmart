import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

interface CityData {
  city: string;
  state: string;
  population: number;
  violent_crime: number;
  murder: number;
  rape: number;
  robbery: number;
  aggravated_assault: number;
  property_crime: number;
  burglary: number;
  larceny_theft: number;
  motor_vehicle_theft: number;
  arson: number;
}

async function processTopCities() {
  console.log('Starting processTopCities function...');
  
  const dataDir = path.join(__dirname, '../../nationaldata/States');
  console.log('Data directory:', dataDir);
  
  // Check if directory exists
  if (!fs.existsSync(dataDir)) {
    console.error('Data directory does not exist:', dataDir);
    return;
  }
  
  const allCities: CityData[] = [];

  // Get all CSV files (excluding AllCities.csv and the Excel file)
  const allFiles = fs.readdirSync(dataDir);
  console.log('All files in directory:', allFiles);
  
  const files = allFiles.filter(file => file.endsWith('.csv') && file !== 'AllCities.csv' && !file.includes('cs-en-us'));
  console.log('CSV files to process:', files);

  console.log(`Processing ${files.length} state files...`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const progress = ((i + 1) / files.length * 100).toFixed(1);
    const stateName = file.replace('.csv', '').replace(/_/g, ' ').toUpperCase();
    const filePath = path.join(dataDir, file);
    
    console.log(`[${progress}%] Processing ${stateName}...`);
    
    try {
      console.log(`  Reading file: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      console.log(`  File size: ${content.length} characters`);
      
      // Split content into lines and skip the first 4 header rows
      const lines = content.split('\n');
      const dataLines = lines.slice(4); // Skip first 4 rows (Table 8, WISCONSIN, Offenses Known, by City)
      const dataContent = dataLines.join('\n');
      
      const records = parse(dataContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
      console.log(`  Parsed ${records.length} records`);
      console.log(`  Sample record keys:`, Object.keys(records[0] || {}));
      console.log(`  Sample record:`, records[0]);

      // Process each city in the state
      for (const record of records) {
        // Skip header rows and empty rows
        if (!record.City || record.City.includes('Table') || record.City.includes('Offenses') || 
            record.City.includes('by City') || record.City === stateName || record.City === 'City') {
          continue;
        }

        // Parse population (remove commas and quotes)
        const populationStr = record.Population?.replace(/[",]/g, '') || '0';
        const population = parseInt(populationStr);
        
        if (population <= 0) continue; // Skip cities with no population data

        // Parse crime numbers (remove commas and quotes)
        const parseCrimeNumber = (value: string) => {
          if (!value || value === '') return 0;
          return parseInt(value.replace(/[",]/g, '')) || 0;
        };

        // Skip Jackson, Missouri
        if (record.City.trim() === 'Jackson' && stateName === 'MISSOURI') {
          continue;
        }

        // Clean city name by removing footnotes (e.g., "Boston3,4" -> "Boston")
        const cleanCityName = record.City.trim().replace(/[0-9,]+$/, '');

        const cityData: CityData = {
          city: cleanCityName,
          state: stateName,
          population,
          violent_crime: parseCrimeNumber(record['Violent\ncrime'] || record['Violent crime'] || '0'),
          murder: parseCrimeNumber(record['Murder and\nnonnegligent\nmanslaughter'] || record['Murder and nonnegligent manslaughter'] || '0'),
          rape: parseCrimeNumber(record['Rape1'] || '0'),
          robbery: parseCrimeNumber(record['Robbery'] || '0'),
          aggravated_assault: parseCrimeNumber(record['Aggravated\nassault'] || record['Aggravated assault'] || '0'),
          property_crime: parseCrimeNumber(record['Property\ncrime'] || record['Property crime'] || '0'),
          burglary: parseCrimeNumber(record['Burglary'] || '0'),
          larceny_theft: parseCrimeNumber(record['Larceny-\ntheft'] || record['Larceny-theft'] || '0'),
          motor_vehicle_theft: parseCrimeNumber(record['Motor\nvehicle\ntheft'] || record['Motor vehicle theft'] || '0'),
          arson: parseCrimeNumber(record['Arson'] || '0')
        };

        allCities.push(cityData);
      }

      console.log(`  Processed ${stateName}: ${records.length} cities`);
    } catch (error: any) {
      console.error(`  Error processing ${file}:`, error);
      console.error(`  Error details:`, {
        message: error?.message || 'Unknown error',
        stack: error?.stack || 'No stack trace',
        filePath,
        stateName
      });
    }
  }

  // Sort by population (descending) and take top 200
  allCities.sort((a, b) => b.population - a.population);
  const top200 = allCities.slice(0, 200);

  console.log(`\nTop 200 cities by population:`);
  console.log(`Total cities processed: ${allCities.length}`);
  console.log(`Population range: ${top200[top200.length - 1].population.toLocaleString()} - ${top200[0].population.toLocaleString()}`);

  // Create CSV content
  const csvHeader = 'City,State,Population,"Violent crime","Murder and nonnegligent manslaughter",Rape1,Robbery,"Aggravated assault","Property crime",Burglary,"Larceny-theft","Motor vehicle theft",Arson\n';
  
  const csvRows = top200.map(city => 
    `"${city.city}","${city.state}","${city.population.toLocaleString()}",${city.violent_crime},${city.murder},${city.rape},${city.robbery},${city.aggravated_assault},${city.property_crime},${city.burglary},${city.larceny_theft},${city.motor_vehicle_theft},${city.arson}`
  ).join('\n');

  const csvContent = csvHeader + csvRows;

  // Write to AllCitiesData.csv
  const outputPath = path.join(__dirname, '../../nationaldata/AllCitiesData.csv');
  console.log(`Writing to: ${outputPath}`);
  fs.writeFileSync(outputPath, csvContent);

  console.log(`\nWritten top 200 cities to: ${outputPath}`);
  console.log(`Final stats: ${allCities.length} total cities processed, ${top200.length} cities in output`);
  
  // Show some sample data
  console.log('\nSample of top 10 cities:');
  top200.slice(0, 10).forEach((city, index) => {
    console.log(`${index + 1}. ${city.city}, ${city.state}: ${city.population.toLocaleString()} pop, ${city.violent_crime} violent crimes`);
  });

  return top200;
}

// Run the script
processTopCities().catch(console.error); 