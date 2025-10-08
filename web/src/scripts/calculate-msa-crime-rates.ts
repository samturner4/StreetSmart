import fs from 'fs/promises';
import path from 'path';

// Crime type weights (1-10 scale) - same as safety scores
const CRIME_WEIGHTS: { [key: string]: number } = {
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

// Map FBI crime categories to our weight system
const FBI_TO_WEIGHT_MAP: { [key: string]: string } = {
  'murder': 'HOMICIDE',
  'rape': 'SEX ABUSE',
  'robbery': 'ROBBERY',
  'aggravated_assault': 'ASSAULT W/DANGEROUS WEAPON',
  'burglary': 'BURGLARY',
  'larceny': 'THEFT/OTHER',
  'motor_vehicle_theft': 'MOTOR VEHICLE THEFT'
  // Note: property_crime is sum of burglary + larceny + motor_vehicle_theft
  // Note: violent_crime is sum of murder + rape + robbery + aggravated_assault
};

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
  years_included: number;
}

interface MSACrimeRates extends MSACrime {
  // Raw rates per 100k
  violent_crime_rate: number;
  murder_rate: number;
  rape_rate: number;
  robbery_rate: number;
  aggravated_assault_rate: number;
  property_crime_rate: number;
  burglary_rate: number;
  larceny_rate: number;
  motor_vehicle_theft_rate: number;
  
  // Weighted scores
  weighted_violent_score: number;
  weighted_property_score: number;
  weighted_total_score: number;
}

function calculateRate(crimeCount: number, population: number): number {
  if (population === 0) return 0;
  return (crimeCount / population) * 100000;
}

function getWeightedScore(crimeType: string, crimeCount: number, population: number): number {
  const weightKey = FBI_TO_WEIGHT_MAP[crimeType];
  const weight = weightKey ? CRIME_WEIGHTS[weightKey] : 1;
  const rate = calculateRate(crimeCount, population);
  return rate * weight;
}

async function calculateMSACrimeRates() {
  try {
    // Read the averaged MSA data
    const data = await fs.readFile(
      path.join(__dirname, '../nationaldata/msa_averages_2017_2019.json'),
      'utf-8'
    );
    
    const msaData: MSACrime[] = JSON.parse(data);
    
    console.log(`Processing ${msaData.length} MSAs...`);
    
    // Calculate rates and weighted scores for each MSA
    const msaRates: MSACrimeRates[] = msaData.map(msa => {
      // Calculate raw rates per 100k
      const violentCrimeRate = calculateRate(msa.violent_crime, msa.population);
      const murderRate = calculateRate(msa.murder, msa.population);
      const rapeRate = calculateRate(msa.rape, msa.population);
      const robberyRate = calculateRate(msa.robbery, msa.population);
      const aggravatedAssaultRate = calculateRate(msa.aggravated_assault, msa.population);
      const propertyCrimeRate = calculateRate(msa.property_crime, msa.population);
      const burglaryRate = calculateRate(msa.burglary, msa.population);
      const larcenyRate = calculateRate(msa.larceny, msa.population);
      const motorVehicleTheftRate = calculateRate(msa.motor_vehicle_theft, msa.population);
      
      // Calculate weighted scores
      const weightedViolentScore = 
        getWeightedScore('murder', msa.murder, msa.population) +
        getWeightedScore('rape', msa.rape, msa.population) +
        getWeightedScore('robbery', msa.robbery, msa.population) +
        getWeightedScore('aggravated_assault', msa.aggravated_assault, msa.population);
        
      const weightedPropertyScore = 
        getWeightedScore('burglary', msa.burglary, msa.population) +
        getWeightedScore('larceny', msa.larceny, msa.population) +
        getWeightedScore('motor_vehicle_theft', msa.motor_vehicle_theft, msa.population);
        
      const weightedTotalScore = weightedViolentScore + weightedPropertyScore;
      
      return {
        ...msa,
        violent_crime_rate: Math.round(violentCrimeRate * 10) / 10,
        murder_rate: Math.round(murderRate * 10) / 10,
        rape_rate: Math.round(rapeRate * 10) / 10,
        robbery_rate: Math.round(robberyRate * 10) / 10,
        aggravated_assault_rate: Math.round(aggravatedAssaultRate * 10) / 10,
        property_crime_rate: Math.round(propertyCrimeRate * 10) / 10,
        burglary_rate: Math.round(burglaryRate * 10) / 10,
        larceny_rate: Math.round(larcenyRate * 10) / 10,
        motor_vehicle_theft_rate: Math.round(motorVehicleTheftRate * 10) / 10,
        weighted_violent_score: Math.round(weightedViolentScore * 10) / 10,
        weighted_property_score: Math.round(weightedPropertyScore * 10) / 10,
        weighted_total_score: Math.round(weightedTotalScore * 10) / 10
      };
    }).filter(msa => msa.population > 0); // Only include MSAs with population data
    
    // Calculate national averages
    const totalPopulation = msaRates.reduce((sum, msa) => sum + msa.population, 0);
    const totalViolentCrime = msaRates.reduce((sum, msa) => sum + msa.violent_crime, 0);
    const totalPropertyCrime = msaRates.reduce((sum, msa) => sum + msa.property_crime, 0);
    const totalMurder = msaRates.reduce((sum, msa) => sum + msa.murder, 0);
    
    const nationalViolentRate = calculateRate(totalViolentCrime, totalPopulation);
    const nationalPropertyRate = calculateRate(totalPropertyCrime, totalPopulation);
    const nationalMurderRate = calculateRate(totalMurder, totalPopulation);
    
    // Calculate weighted national averages
    const totalWeightedViolent = msaRates.reduce((sum, msa) => sum + (msa.weighted_violent_score * msa.population), 0);
    const totalWeightedProperty = msaRates.reduce((sum, msa) => sum + (msa.weighted_property_score * msa.population), 0);
    const nationalWeightedViolent = totalWeightedViolent / totalPopulation;
    const nationalWeightedProperty = totalWeightedProperty / totalPopulation;
    
    const nationalAverages = {
      violent_crime_rate: Math.round(nationalViolentRate * 10) / 10,
      property_crime_rate: Math.round(nationalPropertyRate * 10) / 10,
      murder_rate: Math.round(nationalMurderRate * 10) / 10,
      weighted_violent_score: Math.round(nationalWeightedViolent * 10) / 10,
      weighted_property_score: Math.round(nationalWeightedProperty * 10) / 10,
      weighted_total_score: Math.round((nationalWeightedViolent + nationalWeightedProperty) * 10) / 10,
      total_population: totalPopulation,
      total_msas: msaRates.length
    };
    
    // Save results
    const output = {
      national_averages: nationalAverages,
      msa_data: msaRates.sort((a, b) => b.weighted_total_score - a.weighted_total_score) // Sort by highest crime score
    };
    
    await fs.writeFile(
      path.join(__dirname, '../nationaldata/msa_crime_rates_2017_2019.json'),
      JSON.stringify(output, null, 2)
    );
    
    console.log(`\n✅ Processed ${msaRates.length} MSAs with population data`);
    console.log(`📊 National Averages (2017-2019):`);
    console.log(`   Violent Crime Rate: ${nationalAverages.violent_crime_rate} per 100k`);
    console.log(`   Property Crime Rate: ${nationalAverages.property_crime_rate} per 100k`);
    console.log(`   Murder Rate: ${nationalAverages.murder_rate} per 100k`);
    console.log(`   Weighted Violent Score: ${nationalAverages.weighted_violent_score}`);
    console.log(`   Weighted Property Score: ${nationalAverages.weighted_property_score}`);
    console.log(`   Weighted Total Score: ${nationalAverages.weighted_total_score}`);
    
    console.log(`\n🏆 Top 5 Highest Crime MSAs (by weighted total score):`);
    msaRates.slice(0, 5).forEach((msa, i) => {
      console.log(`   ${i + 1}. ${msa.msa_name}: ${msa.weighted_total_score} (Pop: ${msa.population.toLocaleString()})`);
    });
    
    console.log(`\n🏆 Top 5 Lowest Crime MSAs (by weighted total score):`);
    msaRates.slice(-5).reverse().forEach((msa, i) => {
      console.log(`   ${i + 1}. ${msa.msa_name}: ${msa.weighted_total_score} (Pop: ${msa.population.toLocaleString()})`);
    });
    
    console.log(`\n💾 Output saved to nationaldata/msa_crime_rates_2017_2019.json`);
    
  } catch (error) {
    console.error('Error processing MSA crime rates:', error);
  }
}

calculateMSACrimeRates().catch(console.error); 