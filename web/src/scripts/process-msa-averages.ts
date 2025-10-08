import fs from 'fs/promises';
import path from 'path';

interface MSACrime {
  msa_name: string;
  population: number;
  violent_crime: number;
  murder: number;
  rape: number;
  robbery: number;
  aggravated_assault: number;
  property_crime: number;
  burglary: number;
  larceny: number;
  motor_vehicle_theft: number;
}

interface MSAAverage extends MSACrime {
  years_included: number;
}

function parseNumber(value: string | undefined): number {
  if (!value || value.trim() === '') return 0;
  // Remove commas, quotes, and spaces, then parse
  const cleaned = value.replace(/[",\s]/g, '').trim();
  const num = parseInt(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function calculateMSAAverages() {
  const msaAverages = new Map<string, MSAAverage>();
  const years = [2017, 2018, 2019];

  for (const year of years) {
    try {
      const data = await fs.readFile(
        path.join(__dirname, `../nationaldata/${year}CrimeDataMSA.csv`),
        'utf-8'
      );
      
      const lines = data.split('\n');
      let currentMSA = '';
      let currentPopulation = 0;
      let msaCount = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = parseCSVLine(line);
        
        // Check if this line contains an MSA name
        if (values[0] && values[0].includes('M.S.A.')) {
          currentMSA = values[0].replace(/['"]/g, '').trim();
          currentPopulation = parseNumber(values[2]); // Population is in column 3
          continue;
        }
        
        // Look for data lines with "Estimated total" (preferred) or "Total area actually reporting"
        if (currentMSA && (line.includes('Estimated total') || line.includes('Total area actually reporting'))) {
          // Skip percentage-only lines
          if (line.includes('%') && !values[3]) continue;
          
          // Crime data starts from column 4 (index 3)
          const violentCrime = parseNumber(values[3]);
          const murder = parseNumber(values[4]);
          const rape = parseNumber(values[5]);
          const robbery = parseNumber(values[6]);
          const aggravatedAssault = parseNumber(values[7]);
          const propertyCrime = parseNumber(values[8]);
          const burglary = parseNumber(values[9]);
          const larceny = parseNumber(values[10]);
          const motorVehicleTheft = parseNumber(values[11]);
          
          // Skip if no meaningful data
          if (violentCrime === 0 && propertyCrime === 0) continue;
          
          // Prefer "Estimated total" over "Total area actually reporting"
          const isEstimated = line.includes('Estimated total');
          const key = currentMSA + (isEstimated ? '_estimated' : '_actual');
          
          const current = msaAverages.get(currentMSA) || {
            msa_name: currentMSA,
            population: currentPopulation,
            violent_crime: 0,
            murder: 0,
            rape: 0,
            robbery: 0,
            aggravated_assault: 0,
            property_crime: 0,
            burglary: 0,
            larceny: 0,
            motor_vehicle_theft: 0,
            years_included: 0
          };

          // Only use estimated data if available, otherwise use actual reporting data
          if (isEstimated || !msaAverages.has(currentMSA)) {
            current.violent_crime += violentCrime;
            current.murder += murder;
            current.rape += rape;
            current.robbery += robbery;
            current.aggravated_assault += aggravatedAssault;
            current.property_crime += propertyCrime;
            current.burglary += burglary;
            current.larceny += larceny;
            current.motor_vehicle_theft += motorVehicleTheft;
            current.years_included += 1;

            msaAverages.set(currentMSA, current);
            msaCount++;
          }
        }
      }
      
      console.log(`Processed ${year}: found ${msaCount} MSA entries`);
    } catch (error) {
      console.warn(`Warning: Could not process data for ${year}:`, error);
    }
  }

  // Calculate averages
  const averages = Array.from(msaAverages.values()).map(msa => ({
    msa_name: msa.msa_name,
    population: msa.population,
    violent_crime: Math.round(msa.violent_crime / msa.years_included),
    murder: Math.round(msa.murder / msa.years_included),
    rape: Math.round(msa.rape / msa.years_included),
    robbery: Math.round(msa.robbery / msa.years_included),
    aggravated_assault: Math.round(msa.aggravated_assault / msa.years_included),
    property_crime: Math.round(msa.property_crime / msa.years_included),
    burglary: Math.round(msa.burglary / msa.years_included),
    larceny: Math.round(msa.larceny / msa.years_included),
    motor_vehicle_theft: Math.round(msa.motor_vehicle_theft / msa.years_included),
    years_included: msa.years_included
  })).filter(msa => msa.years_included > 0);

  // Save results
  await fs.writeFile(
    path.join(__dirname, '../nationaldata/msa_averages_2017_2019.json'),
    JSON.stringify(averages, null, 2)
  );

  console.log(`\nProcessed ${averages.length} MSAs total`);
  console.log(`Years included: ${years.join(', ')}`);
  console.log('Output saved to nationaldata/msa_averages_2017_2019.json');
  
  // Show a few examples
  console.log('\nSample MSAs:');
  averages.slice(0, 5).forEach(msa => {
    console.log(`${msa.msa_name}: Pop ${msa.population.toLocaleString()}, Violent Crime ${msa.violent_crime}, Property Crime ${msa.property_crime}, Years: ${msa.years_included}`);
  });
}

calculateMSAAverages().catch(console.error); 