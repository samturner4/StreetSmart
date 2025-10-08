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

interface CityWithRates extends CityData {
  violent_crime_rate: number;
  property_crime_rate: number;
  total_crime_rate: number;
  violent_percentile: number;
  property_percentile: number;
  total_percentile: number;
}

function calculatePercentile(value: number, values: number[]): number {
  const sortedValues = [...values].sort((a, b) => a - b);
  const index = sortedValues.findIndex(v => v >= value);
  if (index === -1) return 100;
  // Calculate what percentage of cities have HIGHER crime rates (so lower % = more dangerous)
  return Math.round(((sortedValues.length - index) / sortedValues.length) * 100);
}

async function calculateCityPercentiles() {
  console.log('Reading city data...');
  
  const csvPath = path.join(__dirname, '../../nationaldata/AllCitiesData.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const cities: CityWithRates[] = records.map((record: any) => {
    const population = parseInt(record.Population.replace(/,/g, ''));
    const violent_crime = parseInt(record['Violent crime']) || 0;
    const property_crime = parseInt(record['Property crime']) || 0;
    
    // Calculate rates per 100,000 population
    const violent_crime_rate = (violent_crime / population) * 100000;
    const property_crime_rate = (property_crime / population) * 100000;
    const total_crime_rate = violent_crime_rate + property_crime_rate;
    
    return {
      city: record.City,
      state: record.State,
      population,
      violent_crime,
      murder: parseInt(record['Murder and nonnegligent manslaughter']) || 0,
      rape: parseInt(record['Rape1']) || 0,
      robbery: parseInt(record['Robbery']) || 0,
      aggravated_assault: parseInt(record['Aggravated assault']) || 0,
      property_crime,
      burglary: parseInt(record['Burglary']) || 0,
      larceny_theft: parseInt(record['Larceny-theft']) || 0,
      motor_vehicle_theft: parseInt(record['Motor vehicle theft']) || 0,
      arson: parseInt(record['Arson']) || 0,
      violent_crime_rate,
      property_crime_rate,
      total_crime_rate,
      violent_percentile: 0, // Will be calculated later
      property_percentile: 0, // Will be calculated later
      total_percentile: 0 // Will be calculated later
    };
  });

  // Sort by population (descending)
  cities.sort((a, b) => b.population - a.population);

  // Calculate percentiles
  const violent_rates = cities.map(c => c.violent_crime_rate);
  const property_rates = cities.map(c => c.property_crime_rate);
  const total_rates = cities.map(c => c.total_crime_rate);

  cities.forEach(city => {
    city.violent_percentile = calculatePercentile(city.violent_crime_rate, violent_rates);
    city.property_percentile = calculatePercentile(city.property_crime_rate, property_rates);
    city.total_percentile = calculatePercentile(city.total_crime_rate, total_rates);
  });

  // Write to CityPercentiles file
  const outputPath = path.join(__dirname, '../../nationaldata/CityPercentiles.txt');
  
  let output = 'TOP 200 CITIES BY POPULATION - CRIME RATES AND PERCENTILES\n';
  output += '='.repeat(80) + '\n\n';
  output += 'Format: City, State | Population | Violent Crime Rate | Property Crime Rate | Total Crime Rate | Percentiles (Violent/Property/Total)\n\n';

  cities.forEach((city, index) => {
    output += `${index + 1}. ${city.city}, ${city.state}\n`;
    output += `   Population: ${city.population.toLocaleString()}\n`;
    output += `   Violent Crime Rate: ${city.violent_crime_rate.toFixed(1)} per 100k (${city.violent_crime} incidents)\n`;
    output += `   Property Crime Rate: ${city.property_crime_rate.toFixed(1)} per 100k (${city.property_crime} incidents)\n`;
    output += `   Total Crime Rate: ${city.total_crime_rate.toFixed(1)} per 100k\n`;
    output += `   Top Percentile of Most Dangerous Cities: ${city.violent_percentile}% violent / ${city.property_percentile}% property / ${city.total_percentile}% total\n`;
    output += `   (Higher % = more dangerous, lower % = safer)\n\n`;
  });

  // Add summary statistics
  output += '\n' + '='.repeat(80) + '\n';
  output += 'SUMMARY STATISTICS\n';
  output += '='.repeat(80) + '\n\n';
  
  const avgViolentRate = violent_rates.reduce((a, b) => a + b, 0) / violent_rates.length;
  const avgPropertyRate = property_rates.reduce((a, b) => a + b, 0) / property_rates.length;
  const avgTotalRate = total_rates.reduce((a, b) => a + b, 0) / total_rates.length;
  
  output += `Average Violent Crime Rate: ${avgViolentRate.toFixed(1)} per 100k\n`;
  output += `Average Property Crime Rate: ${avgPropertyRate.toFixed(1)} per 100k\n`;
  output += `Average Total Crime Rate: ${avgTotalRate.toFixed(1)} per 100k\n\n`;
  
  output += `Safest Cities (Lowest Total Crime Rate):\n`;
  cities.sort((a, b) => a.total_crime_rate - b.total_crime_rate).slice(0, 10).forEach((city, index) => {
    output += `${index + 1}. ${city.city}, ${city.state}: ${city.total_crime_rate.toFixed(1)} per 100k\n`;
  });
  
  output += `\nMost Dangerous Cities (Highest Total Crime Rate):\n`;
  cities.sort((a, b) => b.total_crime_rate - a.total_crime_rate).slice(0, 10).forEach((city, index) => {
    output += `${index + 1}. ${city.city}, ${city.state}: ${city.total_crime_rate.toFixed(1)} per 100k\n`;
  });

  fs.writeFileSync(outputPath, output);
  
  console.log(`✅ Written city percentiles to: ${outputPath}`);
  console.log(`📊 Processed ${cities.length} cities`);
  console.log(`📈 Average violent crime rate: ${avgViolentRate.toFixed(1)} per 100k`);
  console.log(`📈 Average property crime rate: ${avgPropertyRate.toFixed(1)} per 100k`);
  
  return cities;
}

// Run the script
calculateCityPercentiles().catch(console.error); 