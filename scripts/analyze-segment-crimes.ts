import fs from 'fs';
import path from 'path';
import csv from 'csv-parse/sync';

interface CrimeIncident {
  offense: string;
  latitude: number;
  longitude: number;
  year: number;
  timeOfDay: 'day' | 'night';
}

interface StreetSegment {
  properties: {
    OBJECTID: number;
    STREETSEGID: number;
    FULL_NAME?: string;
  };
  geometry: {
    coordinates: number[][];
  };
}

// Crime weights from calculate-safety-scores.ts
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

const BASE_RADIUS = 200; // meters
const HOMICIDE_RADIUS = 200; // meters
const DIRECT_HOMICIDE_RADIUS = 150; // meters

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function getSegmentCenter(coordinates: number[][]): { lat: number; lon: number } {
  const totalPoints = coordinates.length;
  let totalLat = 0;
  let totalLon = 0;

  coordinates.forEach(point => {
    totalLon += point[0];
    totalLat += point[1];
  });

  return {
    lat: totalLat / totalPoints,
    lon: totalLon / totalPoints
  };
}

function isNighttime(time: string): boolean {
  const hour = parseInt(time.split(':')[0]);
  return hour < 6 || hour >= 18; // 6 PM to 6 AM is night
}

interface CrimeImpact {
  offense: string;
  distance: number;
  year: number;
  timeOfDay: 'day' | 'night';
  weight: number;
  date: string;
  time: string;
}

async function analyzeSegmentCrimes(targetObjectIds: number[]) {
  // Load street centerlines
  console.log('Loading street centerlines...');
  const streetsPath = path.join(process.cwd(), 'data/DC/streets/Street_Centerlines.geojson');
  const streetsData = JSON.parse(fs.readFileSync(streetsPath, 'utf-8'));
  
  // Find our target segments
  const targetSegments = streetsData.features.filter((f: StreetSegment) => 
    targetObjectIds.includes(f.properties.OBJECTID)
  );

  if (targetSegments.length === 0) {
    console.error('Target segments not found!');
    return;
  }

  // Process each target segment
  for (const segment of targetSegments) {
    const segmentCenter = getSegmentCenter(segment.geometry.coordinates);
    const impactingCrimes: CrimeImpact[] = [];
    
    console.log(`\nAnalyzing segment OBJECTID ${segment.properties.OBJECTID} (STREETSEGID: ${segment.properties.STREETSEGID})`);
    console.log(`Location: ${segmentCenter.lat}, ${segmentCenter.lon}`);
    console.log('Street name:', segment.properties.FULL_NAME || 'Unknown');

    // Process each year's crime data
    const years = ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];
    
    for (const year of years) {
      const crimePath = path.join(process.cwd(), `data/DC/crime-incidents/${year}/Crime_Incidents_in_${year}.csv`);
      
      if (!fs.existsSync(crimePath)) {
        continue;
      }

      const fileContent = fs.readFileSync(crimePath, 'utf-8');
      const records = csv.parse(fileContent, {
        columns: true,
        skip_empty_lines: true
      });

      records.forEach((record: any) => {
        // Extract coordinates - handle different column names across years
        const lat = parseFloat(record.LATITUDE || record.Y || record.latitude || '0');
        const lon = parseFloat(record.LONGITUDE || record.X || record.longitude || '0');
        const offense = record.OFFENSE || record.OFFENSE_TYPE || record.offense;
        const reportDate = record.REPORT_DATE || record.DATE || record.date;
        const time = record.TIME || record.time || '12:00';

        if (lat && lon && offense) {
          const distance = calculateDistance(
            segmentCenter.lat, segmentCenter.lon,
            lat, lon
          );

          const maxRadius = offense === 'HOMICIDE' ? HOMICIDE_RADIUS : BASE_RADIUS;
          
          if (distance <= maxRadius) {
            // Calculate weight
            const baseWeight = CRIME_WEIGHTS[offense] || 1;
            const temporalWeight = Math.max(0.5, (parseInt(year) - 2015) / (2025 - 2015)); // Scale by year
            const dayNightMultiplier = isNighttime(time) ? 1.5 : 1.0;
            const scale = maxRadius / 5;  // This gives e^(-5) ≈ 0.0067 at maxRadius
            const distanceDecay = Math.exp(-distance / scale);
            
            // Extra weight for close homicides
            const homicideBonus = offense === 'HOMICIDE' && distance <= DIRECT_HOMICIDE_RADIUS ? 1.5 : 1.0;
            
            const totalWeight = baseWeight * temporalWeight * dayNightMultiplier * distanceDecay * homicideBonus;

            impactingCrimes.push({
              offense,
              distance: Math.round(distance),
              year: parseInt(year),
              timeOfDay: isNighttime(time) ? 'night' : 'day',
              weight: totalWeight,
              date: reportDate,
              time
            });
          }
        }
      });
    }

    // Sort crimes by weight and get top 10
    const topCrimes = impactingCrimes
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);

    // Group all crimes by type for statistics
    const crimesByType = impactingCrimes.reduce((acc, crime) => {
      acc[crime.offense] = (acc[crime.offense] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\nTop 10 Most Impactful Crimes:');
    topCrimes.forEach((crime, i) => {
      console.log(`${i + 1}. ${crime.offense}`);
      console.log(`   Date: ${crime.date} ${crime.time} (${crime.timeOfDay})`);
      console.log(`   Distance: ${crime.distance}m, Weight: ${crime.weight.toFixed(2)}`);
    });

    console.log('\nTotal Crimes by Type:');
    Object.entries(crimesByType)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`${type}: ${count}`);
      });

    console.log('\nTotal impacting crimes:', impactingCrimes.length);
    console.log('Average weight:', (impactingCrimes.reduce((sum, c) => sum + c.weight, 0) / impactingCrimes.length).toFixed(2));
  }
}

// Analyze the specific segments
analyzeSegmentCrimes([31671, 6139, 4539, 2222])
  .catch(console.error);