import fs from 'fs/promises';
import path from 'path';

interface MSACrimeRates {
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
  violent_crime_rate: number;
  murder_rate: number;
  rape_rate: number;
  robbery_rate: number;
  aggravated_assault_rate: number;
  property_crime_rate: number;
  burglary_rate: number;
  larceny_rate: number;
  motor_vehicle_theft_rate: number;
  weighted_violent_score: number;
  weighted_property_score: number;
  weighted_total_score: number;
}

interface MSAWithPercentiles extends MSACrimeRates {
  safety_percentile: number; // Higher = safer (lower crime)
  violent_crime_percentile: number;
  property_crime_percentile: number;
  murder_percentile: number;
  safety_rank: number; // 1 = safest
  safety_description: string;
}

interface CrimeDataFile {
  national_averages: any;
  msa_data: MSACrimeRates[];
}

function calculatePercentile(value: number, sortedValues: number[], isLowerBetter: boolean = true): number {
  if (isLowerBetter) {
    // For crime scores, lower is better, so we reverse the percentile
    const rank = sortedValues.findIndex(v => v >= value) + 1;
    const percentile = ((sortedValues.length - rank + 1) / sortedValues.length) * 100;
    return Math.round(percentile * 10) / 10;
  } else {
    // For safety scores, higher is better
    const rank = sortedValues.findIndex(v => v >= value) + 1;
    const percentile = (rank / sortedValues.length) * 100;
    return Math.round(percentile * 10) / 10;
  }
}

function getSafetyDescription(percentile: number): string {
  if (percentile >= 95) return "Extremely Safe";
  if (percentile >= 90) return "Very Safe";
  if (percentile >= 75) return "Safe";
  if (percentile >= 60) return "Moderately Safe";
  if (percentile >= 40) return "Average Safety";
  if (percentile >= 25) return "Below Average Safety";
  if (percentile >= 10) return "High Crime";
  return "Very High Crime";
}

async function calculateMSAPercentiles() {
  try {
    // Read the crime rates data
    const data = await fs.readFile(
      path.join(__dirname, '../nationaldata/msa_crime_rates_2017_2019.json'),
      'utf-8'
    );
    
    const crimeData: CrimeDataFile = JSON.parse(data);
    const msaData = crimeData.msa_data;
    
    console.log(`Processing percentiles for ${msaData.length} MSAs...`);
    
    // Sort arrays for percentile calculations (lower crime = better)
    const sortedTotalScores = [...msaData].map(m => m.weighted_total_score).sort((a, b) => a - b);
    const sortedViolentScores = [...msaData].map(m => m.weighted_violent_score).sort((a, b) => a - b);
    const sortedPropertyScores = [...msaData].map(m => m.weighted_property_score).sort((a, b) => a - b);
    const sortedMurderRates = [...msaData].map(m => m.murder_rate).sort((a, b) => a - b);
    
    // Calculate percentiles for each MSA
    const msaWithPercentiles: MSAWithPercentiles[] = msaData.map(msa => {
      const safetyPercentile = calculatePercentile(msa.weighted_total_score, sortedTotalScores, true);
      const violentPercentile = calculatePercentile(msa.weighted_violent_score, sortedViolentScores, true);
      const propertyPercentile = calculatePercentile(msa.weighted_property_score, sortedPropertyScores, true);
      const murderPercentile = calculatePercentile(msa.murder_rate, sortedMurderRates, true);
      
      return {
        ...msa,
        safety_percentile: safetyPercentile,
        violent_crime_percentile: violentPercentile,
        property_crime_percentile: propertyPercentile,
        murder_percentile: murderPercentile,
        safety_rank: 0, // Will be filled after sorting
        safety_description: getSafetyDescription(safetyPercentile)
      };
    });
    
    // Sort by safety (highest percentile = safest = rank 1)
    msaWithPercentiles.sort((a, b) => b.safety_percentile - a.safety_percentile);
    
    // Assign ranks
    msaWithPercentiles.forEach((msa, index) => {
      msa.safety_rank = index + 1;
    });
    
    // Find DC Metro area for special highlighting
    const dcMSA = msaWithPercentiles.find(msa => 
      msa.msa_name.includes('Washington-Arlington-Alexandria')
    );
    
    // Create output with percentile data
    const output = {
      national_averages: crimeData.national_averages,
      percentile_info: {
        total_msas: msaWithPercentiles.length,
        calculation_method: "Safety percentile = (Number of MSAs with higher crime / Total MSAs) × 100",
        note: "Higher percentiles indicate safer areas (lower crime rates)"
      },
      dc_metro_stats: dcMSA ? {
        msa_name: dcMSA.msa_name,
        safety_rank: dcMSA.safety_rank,
        safety_percentile: dcMSA.safety_percentile,
        safety_description: dcMSA.safety_description,
        weighted_total_score: dcMSA.weighted_total_score,
        population: dcMSA.population
      } : null,
      msa_data: msaWithPercentiles
    };
    
    // Save results
    await fs.writeFile(
      path.join(__dirname, '../nationaldata/msa_safety_percentiles_2017_2019.json'),
      JSON.stringify(output, null, 2)
    );
    
    console.log(`\n✅ Calculated percentiles for ${msaWithPercentiles.length} MSAs`);
    
    if (dcMSA) {
      console.log(`\n🏛️  DC Metro Area Statistics:`);
      console.log(`   ${dcMSA.msa_name}`);
      console.log(`   Safety Rank: #${dcMSA.safety_rank} out of ${msaWithPercentiles.length}`);
      console.log(`   Safety Percentile: ${dcMSA.safety_percentile}% (${dcMSA.safety_description})`);
      console.log(`   Weighted Crime Score: ${dcMSA.weighted_total_score}`);
      console.log(`   Population: ${dcMSA.population.toLocaleString()}`);
    }
    
    console.log(`\n🏆 Top 10 Safest MSAs (Highest Safety Percentiles):`);
    msaWithPercentiles.slice(0, 10).forEach((msa, i) => {
      console.log(`   ${i + 1}. ${msa.msa_name}: ${msa.safety_percentile}% (${msa.safety_description})`);
    });
    
    console.log(`\n⚠️  Bottom 5 MSAs (Lowest Safety Percentiles):`);
    msaWithPercentiles.slice(-5).forEach((msa, i) => {
      const rank = msaWithPercentiles.length - 4 + i;
      console.log(`   ${rank}. ${msa.msa_name}: ${msa.safety_percentile}% (${msa.safety_description})`);
    });
    
    console.log(`\n📊 Safety Distribution:`);
    const extremely_safe = msaWithPercentiles.filter(m => m.safety_percentile >= 95).length;
    const very_safe = msaWithPercentiles.filter(m => m.safety_percentile >= 90 && m.safety_percentile < 95).length;
    const safe = msaWithPercentiles.filter(m => m.safety_percentile >= 75 && m.safety_percentile < 90).length;
    const moderate = msaWithPercentiles.filter(m => m.safety_percentile >= 60 && m.safety_percentile < 75).length;
    const average = msaWithPercentiles.filter(m => m.safety_percentile >= 40 && m.safety_percentile < 60).length;
    const below_avg = msaWithPercentiles.filter(m => m.safety_percentile >= 25 && m.safety_percentile < 40).length;
    const high_crime = msaWithPercentiles.filter(m => m.safety_percentile >= 10 && m.safety_percentile < 25).length;
    const very_high = msaWithPercentiles.filter(m => m.safety_percentile < 10).length;
    
    console.log(`   Extremely Safe (95%+): ${extremely_safe} MSAs`);
    console.log(`   Very Safe (90-95%): ${very_safe} MSAs`);
    console.log(`   Safe (75-90%): ${safe} MSAs`);
    console.log(`   Moderately Safe (60-75%): ${moderate} MSAs`);
    console.log(`   Average Safety (40-60%): ${average} MSAs`);
    console.log(`   Below Average (25-40%): ${below_avg} MSAs`);
    console.log(`   High Crime (10-25%): ${high_crime} MSAs`);
    console.log(`   Very High Crime (<10%): ${very_high} MSAs`);
    
    console.log(`\n💾 Output saved to nationaldata/msa_safety_percentiles_2017_2019.json`);
    
  } catch (error) {
    console.error('Error calculating MSA percentiles:', error);
  }
}

calculateMSAPercentiles().catch(console.error); 