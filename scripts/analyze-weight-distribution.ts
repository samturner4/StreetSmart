import fs from 'fs';
import path from 'path';
import csv from 'csv-parse/sync';

const CRIME_WEIGHTS: { [key: string]: number } = {
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
  totalWeight: number;
  count: number;
  avgDistance: number;
  avgFinalScore: number;
}

async function analyzeWeightDistribution() {
  const crimeImpacts = new Map<string, CrimeImpact>();
  const segmentScores = new Map<string, number>();
  
  // Process each year's crime data
  const years = ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];
  
  for (const year of years) {
    const crimePath = path.join(process.cwd(), `data/DC/crime-incidents/${year}/Crime_Incidents_in_${year}.csv`);
    
    if (!fs.existsSync(crimePath)) continue;

    const fileContent = fs.readFileSync(crimePath, 'utf-8');
    const records = csv.parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });

    records.forEach((record: any) => {
      const offense = record.OFFENSE || record.OFFENSE_TYPE || record.offense;
      if (!offense) return;

      const impact = crimeImpacts.get(offense) || {
        offense,
        totalWeight: 0,
        count: 0,
        avgDistance: 0,
        avgFinalScore: 0
      };

      const baseWeight = CRIME_WEIGHTS[offense] || 1;
      const temporalWeight = Math.max(0.5, (parseInt(year) - 2015) / (2025 - 2015));
      const weight = baseWeight * temporalWeight;

      impact.totalWeight += weight;
      impact.count++;
      crimeImpacts.set(offense, impact);
    });
  }

  // Calculate statistics
  console.log('\nCrime Weight Analysis:');
  console.log('------------------------');
  
  const sortedImpacts = Array.from(crimeImpacts.values())
    .sort((a, b) => b.totalWeight - a.totalWeight);

  const totalWeight = sortedImpacts.reduce((sum, i) => sum + i.totalWeight, 0);

  sortedImpacts.forEach(impact => {
    const avgWeight = impact.totalWeight / impact.count;
    const percentOfTotal = (impact.totalWeight / totalWeight) * 100;
    const baseWeight = CRIME_WEIGHTS[impact.offense] || 1;
    
    console.log(`\n${impact.offense}:`);
    console.log(`  Base Weight: ${baseWeight}`);
    console.log(`  Count: ${impact.count.toLocaleString()}`);
    console.log(`  Total Weight Impact: ${impact.totalWeight.toFixed(2)}`);
    console.log(`  Average Weight per Incident: ${avgWeight.toFixed(2)}`);
    console.log(`  % of Total Weight: ${percentOfTotal.toFixed(2)}%`);
  });

  // Analyze distribution
  const weights = Array.from(crimeImpacts.values()).map(i => i.totalWeight);
  const max = Math.max(...weights);
  const min = Math.min(...weights);
  const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length;
  const median = weights.sort((a, b) => a - b)[Math.floor(weights.length / 2)];

  console.log('\nWeight Distribution Statistics:');
  console.log(`  Range: ${min.toFixed(2)} - ${max.toFixed(2)}`);
  console.log(`  Mean: ${mean.toFixed(2)}`);
  console.log(`  Median: ${median.toFixed(2)}`);
  console.log(`  Skew: ${((mean - median) / mean).toFixed(2)}`);
}

analyzeWeightDistribution().catch(console.error);