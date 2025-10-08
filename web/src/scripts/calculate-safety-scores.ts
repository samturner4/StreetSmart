// Import required modules
import fs from 'fs';
import path from 'path';
import { FeatureCollection, LineString, Feature } from 'geojson';

// Type definitions
interface StreetSegment extends Feature<LineString> {
  properties: {
    OBJECTID: number;
    ST_NAME: string;
    STREETTYPE: string;
    QUADRANT: string;
    [key: string]: any;
  };
}

interface CrimeIncident {
  latitude: number;
  longitude: number;
  offense: string;
  date: string;
  street: string;
  timeOfDay: 'day' | 'night';
}

type ProcessIncidentsCallback = (incidents: CrimeIncident[]) => void;
type ProgressCallback = (processed: number, total: number) => void;

// Crime type weights (1-10 scale)
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

// Proximity-based scoring parameters - OPTIMIZED
const BASE_RADIUS = 200; // meters - significantly reduced to minimize overlap in dense areas

// Spatial indexing parameters
const GRID_SIZE = 0.002; // degrees (~200m at DC latitude)

// Spatial grid for fast proximity lookups
interface GridCell {
  segments: StreetSegment[];
}

// Create spatial index for fast proximity queries
function createSpatialIndex(segments: StreetSegment[]): Map<string, GridCell> {
  const grid = new Map<string, GridCell>();
  
  segments.forEach(segment => {
    const center = getSegmentCenter(segment);
    const gridX = Math.floor(center.lon / GRID_SIZE);
    const gridY = Math.floor(center.lat / GRID_SIZE);
    const key = `${gridX},${gridY}`;
    
    if (!grid.has(key)) {
      grid.set(key, { segments: [] });
    }
    grid.get(key)!.segments.push(segment);
  });
  
  return grid;
}

// Get nearby segments using spatial index
function getNearbySegments(
  lat: number, 
  lon: number, 
  radius: number, 
  grid: Map<string, GridCell>,
  segmentCenters: Map<string, { lat: number, lon: number }>
): StreetSegment[] {
  const nearbySegments: StreetSegment[] = [];
  
  // Convert radius from meters to degrees (approximate)
  const radiusInDegrees = radius / 111000; // 1 degree ≈ 111km at equator
  const gridRadius = Math.ceil(radiusInDegrees / GRID_SIZE); // Convert to grid cells
  
  const centerGridX = Math.floor(lon / GRID_SIZE);
  const centerGridY = Math.floor(lat / GRID_SIZE);
  
  // Check surrounding grid cells
  for (let dx = -gridRadius; dx <= gridRadius; dx++) {
    for (let dy = -gridRadius; dy <= gridRadius; dy++) {
      const key = `${centerGridX + dx},${centerGridY + dy}`;
      const cell = grid.get(key);
      
      if (cell) {
        // Filter segments within actual radius
        cell.segments.forEach(segment => {
          const segmentId = segment.properties.OBJECTID.toString();
          const segmentCenter = segmentCenters.get(segmentId);
          
          if (segmentCenter) {
            const distance = calculateDistance(lat, lon, segmentCenter.lat, segmentCenter.lon);
            if (distance <= radius) {
              nearbySegments.push(segment);
            }
          }
        });
      }
    }
  }
  
  return nearbySegments;
}

// Get weighted score for a crime incident
function getCrimeWeight(offense: string): number {
  return CRIME_WEIGHTS[offense] || 1; // Default to 1 if offense not found
}

// Get temporal weight based on crime year (recent crimes matter more)
function getTemporalWeight(year: number): number {
  const currentYear = 2024;
  const yearsDiff = currentYear - year;
  
  // Linear decay: 1.0 for 2024, 0.9 for 2023, 0.8 for 2022, etc.
  // Minimum weight of 0.1 for very old crimes
  return Math.max(0.1, 1.0 - (yearsDiff * 0.1));
}

// Get day/night multiplier (day crimes are more dangerous)
function getDayNightMultiplier(timeOfDay: 'day' | 'night'): number {
  return timeOfDay === 'day' ? 1.3 : 1.0;
}

// Calculate distance between two geographic points using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in meters
}

// Calculate distance decay factor using exponential decay
function getDistanceDecayFactor(distance: number, maxRadius: number): number {
  if (distance > maxRadius) return 0;
  
  // Scale factor chosen so that decay reaches ~0.01 at maxRadius
  const scale = maxRadius / 5;  // This gives e^(-5) ≈ 0.0067 at maxRadius
  
  // Exponential decay: e^(-distance/scale)
  return Math.exp(-distance / scale);
}

// Add after getDistanceDecayFactor definition (around line 155)
function logTransform(score: number): number {
  return Math.log(score + 1); // +1 to avoid log(0)
}

// Get center point of street segment (handles both LineString and MultiLineString)
function getSegmentCenter(segment: StreetSegment): { lat: number, lon: number } {
  const geometry = segment.geometry as any; // Use any to handle both LineString and MultiLineString
  const coords = geometry.coordinates;
  if (!coords || coords.length === 0) return { lat: 0, lon: 0 };
  
  let totalLat = 0, totalLon = 0, pointCount = 0;
  
  if (geometry.type === 'MultiLineString') {
    // Handle MultiLineString: coordinates is array of LineString coordinate arrays
    for (const lineString of coords) {
      for (const coord of lineString) {
        totalLon += coord[0];
        totalLat += coord[1];
        pointCount++;
      }
    }
  } else {
    // Handle LineString: coordinates is array of coordinate pairs
  for (const coord of coords) {
    totalLon += coord[0];
    totalLat += coord[1];
      pointCount++;
    }
  }
  
  return {
    lat: totalLat / pointCount,
    lon: totalLon / pointCount
  };
}

// Import utility functions
import { 
  loadStreetCenterlines, 
  initializeStreetNameMap, 
  findExactStreetMatch, 
  processIncidentsInChunks, 
  streamGeoJSONOutput 
} from './utils';
import { isPointWalkable } from './process-osm-walkability';

// Helper function for score distribution visualization
function visualizeDistribution(scores: Map<number, number>, totalStreets: number) {
  const maxBarLength = 50; // Maximum length of the visualization bar
  console.log('\nSafety Score Distribution:');
  console.log('------------------------');
  // Group scores into ranges: 1-20, 21-40, 41-60, 61-80, 81-100
  const ranges = [
    { label: '1-20', min: 1, max: 20 },
    { label: '21-40', min: 21, max: 40 },
    { label: '41-60', min: 41, max: 60 },
    { label: '61-80', min: 61, max: 80 },
    { label: '81-100', min: 81, max: 100 }
  ];
  
  for (const range of ranges) {
    let count = 0;
    for (let score = range.min; score <= range.max; score++) {
      count += scores.get(score) || 0;
    }
    const percentage = (count / totalStreets) * 100;
    const barLength = Math.round((percentage / 100) * maxBarLength);
    const bar = '█'.repeat(barLength);
    console.log(`Score ${range.label}: ${count.toString().padStart(6)} streets (${percentage.toFixed(1)}%) ${bar}`);
  }
  console.log('------------------------');
}

// Helper function for yearly statistics visualization
function visualizeYearlyStats(yearlyStats: { [year: number]: { total: number; matched: number } }) {
  console.log('\nYearly Statistics:');
  console.log('------------------------');
  const maxTotal = Math.max(...Object.values(yearlyStats).map(stats => stats.total));
  const maxBarLength = 40;

  Object.entries(yearlyStats).forEach(([year, stats]) => {
    const matchRate = (stats.matched / stats.total) * 100;
    const barLength = Math.round((stats.total / maxTotal) * maxBarLength);
    const bar = '█'.repeat(barLength);
    console.log(`${year}: ${stats.total.toString().padStart(7)} incidents, ${matchRate.toFixed(1)}% matched ${bar}`);
  });
  console.log('------------------------');
}

function calculateQuantileThresholds(safetyScores: number[]): { [key: string]: number } {
  // Sort scores in ascending order
  const sortedScores = [...safetyScores].sort((a, b) => a - b);
  
  // Calculate indices for 20th, 40th, 60th, and 80th percentiles
  const getQuantileValue = (percentile: number) => {
    const index = Math.floor((percentile / 100) * (sortedScores.length - 1));
    return sortedScores[index];
  };

  return {
    veryLow: getQuantileValue(20),    // Bottom 20% - most dangerous
    low: getQuantileValue(40),        // 20-40%
    moderate: getQuantileValue(60),    // 40-60%
    high: getQuantileValue(80),       // 60-80%
    veryHigh: getQuantileValue(100)   // Top 20% - safest
  };
}

// Filter street segments to only include walkable ones using OSM data
async function filterWalkableSegments(segments: StreetSegment[]): Promise<StreetSegment[]> {
  console.log('Loading OSM walkability data...');
  
  // Load the walkable areas from OSM data
  const walkableAreasPath = path.join(process.cwd(), 'data', 'DC', 'osm-walkability', 'walkable-areas.json');
  const walkableAreasArray = JSON.parse(fs.readFileSync(walkableAreasPath, 'utf-8'));
  const walkableAreas = new Map<string, boolean>();
  
  // Convert array to Map for fast lookup
  walkableAreasArray.forEach((key: string) => {
    walkableAreas.set(key, true);
  });
  
  console.log(`Loaded ${walkableAreas.size} walkable areas from OSM data`);
  console.log('Filtering street segments for walkability...');
  
  // Filter segments using OSM data
  const walkableSegments: StreetSegment[] = [];
  let filteredCount = 0;
  
  for (const segment of segments) {
    const center = getSegmentCenter(segment);
    
    if (isPointWalkable(center.lat, center.lon, walkableAreas)) {
      walkableSegments.push(segment);
    } else {
      filteredCount++;
      if (filteredCount <= 10) { // Only log first 10 for brevity
        console.log(`Filtered out non-walkable segment: ${segment.properties.ST_NAME || 'Unknown'}`);
      }
    }
  }
  
  console.log(`Filtered out ${filteredCount} non-walkable segments`);
  console.log(`Kept ${walkableSegments.length} walkable segments`);
  
  return walkableSegments;
}

async function calculateSafetyScores() {
  try {
    console.log('Loading street centerlines...');
    const streets = await loadStreetCenterlines();
    await initializeStreetNameMap(streets.features as StreetSegment[]);

    console.log(`Loaded ${streets.features.length} street segments`);
    
    // Filter out non-walkable street segments using Mapbox API
    console.log('Filtering out non-walkable street segments...');
    const walkableSegments = await filterWalkableSegments(streets.features as StreetSegment[]);
    console.log(`Filtered to ${walkableSegments.length} walkable segments (removed ${streets.features.length - walkableSegments.length} non-walkable segments)`);
    
    console.log('Pre-calculating segment centers for proximity analysis...');

    // Pre-calculate segment centers for efficiency
    const segmentCenters = new Map<string, { lat: number, lon: number }>();
    walkableSegments.forEach(segment => {
      const center = getSegmentCenter(segment);
      segmentCenters.set(segment.properties.OBJECTID.toString(), center);
    });

    // Create spatial index for fast proximity lookups
    const spatialIndex = createSpatialIndex(walkableSegments);
    console.log(`Created spatial index with ${spatialIndex.size} grid cells`);

    // Initialize tracking variables - now using proximity-based scoring with day/night separation
    const streetWeightedScores = new Map<string, number>(); // Segment ID -> overall weighted score
    const streetDayWeightedScores = new Map<string, number>(); // Segment ID -> day weighted score
    const streetNightWeightedScores = new Map<string, number>(); // Segment ID -> night weighted score
    const streetIncidentCounts = new Map<string, number>(); // Segment ID -> raw incident count
    const streetDayIncidentCounts = new Map<string, number>(); // Segment ID -> day incident count
    const streetNightIncidentCounts = new Map<string, number>(); // Segment ID -> night incident count
    const streetsWithHomicides = new Set<string>(); // Track segments with direct homicide impact
    const proximityInfluenceCounts = new Map<string, number>(); // Track how many crimes influenced each segment
    let totalIncidents = 0;
    let totalDayIncidents = 0;
    let totalNightIncidents = 0;
    let totalWeightedScore = 0;
    let totalDayWeightedScore = 0;
    let totalNightWeightedScore = 0;
    let totalHomicides = 0;
    let matchedIncidents = 0;
    let totalProximityInfluences = 0;
    let yearlyStats: { [year: number]: { total: number; matched: number } } = {};

    // Process each year from 2015 to 2024
    const years = Array.from({ length: 10 }, (_, i) => 2015 + i);
    const startTime = Date.now();
    
    for (const year of years) {
      const filePath = path.join(process.cwd(), 'data', 'DC', 'crime-incidents', year.toString(), `Crime_Incidents_in_${year}.csv`);
      
      if (!fs.existsSync(filePath)) {
        console.log(`Warning: No data file found for year ${year}, skipping...`);
        continue;
      }

      console.log(`\nProcessing incidents from ${year} with proximity-based scoring...`);
      yearlyStats[year] = { total: 0, matched: 0 };
      
      await processIncidentsInChunks(
        filePath,
        (incidents: CrimeIncident[]) => {
          incidents.forEach((incident: CrimeIncident) => {
            totalIncidents++;
            yearlyStats[year].total++;
            
            // Track day/night incident totals
            if (incident.timeOfDay === 'day') {
              totalDayIncidents++;
            } else {
              totalNightIncidents++;
            }
            
            const matchedStreet = findExactStreetMatch(incident);
            
            if (matchedStreet) {
              matchedIncidents++;
              yearlyStats[year].matched++;
              
              // Get crime properties with temporal weighting and day/night multiplier
              const baseWeight = getCrimeWeight(incident.offense);
              const temporalWeight = getTemporalWeight(year);
              // const dayNightMultiplier = getDayNightMultiplier(incident.timeOfDay);
              const weight = baseWeight * temporalWeight; // removed dayNightMultiplier
              const isHomicide = incident.offense === 'HOMICIDE';
              const maxRadius = BASE_RADIUS;
              
              // Count raw incidents only for the directly matched street
              const directStreetId = matchedStreet.properties.OBJECTID.toString();
              streetIncidentCounts.set(directStreetId, 
                (streetIncidentCounts.get(directStreetId) || 0) + 1
              );
              
              // Count day/night incidents separately
              if (incident.timeOfDay === 'day') {
                streetDayIncidentCounts.set(directStreetId,
                  (streetDayIncidentCounts.get(directStreetId) || 0) + 1
                );
              } else {
                streetNightIncidentCounts.set(directStreetId,
                  (streetNightIncidentCounts.get(directStreetId) || 0) + 1
                );
              }
              
              // Apply proximity-based scoring using spatial index (OPTIMIZED!)
              let influencedSegments = 0;
              const nearbySegments = getNearbySegments(
                incident.latitude, incident.longitude, maxRadius, spatialIndex, segmentCenters
              );
              

              
              nearbySegments.forEach(segment => {
                const segmentId = segment.properties.OBJECTID.toString();
                const segmentCenter = segmentCenters.get(segmentId);
                
                if (segmentCenter) {
                  const distance = calculateDistance(
                    incident.latitude, incident.longitude,
                    segmentCenter.lat, segmentCenter.lon
                  );
                  
                  const decayFactor = getDistanceDecayFactor(distance, maxRadius);
                  const adjustedWeight = weight * decayFactor;
                  
                  // Update weighted scores with distance-adjusted and length-normalized impact
                  streetWeightedScores.set(segmentId, 
                    (streetWeightedScores.get(segmentId) || 0) + adjustedWeight
                  );
                  
                  // Update day/night weighted scores separately
                  /* Commenting out day/night weighting
                  if (incident.timeOfDay === 'day') {
                    streetDayWeightedScores.set(segmentId,
                      (streetDayWeightedScores.get(segmentId) || 0) + adjustedWeight
                    );
                  } else {
                    streetNightWeightedScores.set(segmentId,
                      (streetNightWeightedScores.get(segmentId) || 0) + adjustedWeight
                    );
                  }
                  */
                  
                  
                  // Track proximity influences
                  proximityInfluenceCounts.set(segmentId,
                    (proximityInfluenceCounts.get(segmentId) || 0) + 1
                  );
                  
                  influencedSegments++;
                }
              });
              
              totalProximityInfluences += influencedSegments;
              totalWeightedScore += weight;
              
              // Update day/night totals
              if (incident.timeOfDay === 'day') {
                totalDayWeightedScore += weight;
              } else {
                totalNightWeightedScore += weight;
              }
              
              if (isHomicide) totalHomicides++;
            }
          });
        },
        (processed: number, total: number) => {
          const percent = ((processed / total) * 100).toFixed(1);
          process.stdout.write(`\rProcessed ${processed.toLocaleString()} of ${total.toLocaleString()} incidents (${percent}%) for ${year}...`);
        }
      );

      // Log yearly progress
      const yearlyMatchRate = ((yearlyStats[year].matched / yearlyStats[year].total) * 100).toFixed(1);
      console.log(`\nYear ${year} completed:`);
      console.log(`  Total incidents: ${yearlyStats[year].total.toLocaleString()}`);
      console.log(`  Matched incidents: ${yearlyStats[year].matched.toLocaleString()}`);
      console.log(`  Match rate: ${yearlyMatchRate}%`);
    }

    // Visualize yearly statistics
    visualizeYearlyStats(yearlyStats);

    console.log('\nCalculating proximity-based safety scores...');
    
    // Calculate weighted crime statistics
    const weightedScores = Array.from(streetWeightedScores.values());
    const incidentCounts = Array.from(streetIncidentCounts.values());
    const maxWeightedScore = Math.max(...weightedScores);
    const minWeightedScore = Math.min(...weightedScores);
    const avgWeightedScore = weightedScores.reduce((sum, score) => sum + score, 0) / weightedScores.length;
    const avgProximityInfluences = totalProximityInfluences / matchedIncidents;

    console.log('\nRaw Weight Statistics:');
console.log('Maximum cumulative weight per segment:', Math.max(...Array.from(streetWeightedScores.values())));
console.log('Minimum cumulative weight per segment:', Math.min(...Array.from(streetWeightedScores.values())));
console.log('Average cumulative weight:', Array.from(streetWeightedScores.values()).reduce((a,b) => a + b, 0) / streetWeightedScores.size);
console.log('\nTop 5 most dangerous segments:');
Array.from(streetWeightedScores.entries())
  .sort(([,a], [,b]) => b - a)
  .slice(0, 5)
  .forEach(([segmentId, weight]) => {
    console.log(`Segment ${segmentId}: ${weight.toFixed(2)} weight`);
  });

console.log('\nProximity-Based Crime Statistics (with temporal weighting):');
    console.log(`  Maximum weighted score per segment: ${maxWeightedScore.toFixed(1)}`);
    console.log(`  Minimum weighted score per segment: ${minWeightedScore.toFixed(1)}`);
    console.log(`  Average weighted score per segment: ${avgWeightedScore.toFixed(1)}`);
    console.log(`  Total weighted crime score: ${totalWeightedScore.toLocaleString()}`);
    console.log(`  Total homicides: ${totalHomicides.toLocaleString()}`);
    console.log(`  Segments with direct homicide impact: ${streetsWithHomicides.size.toLocaleString()}`);
    console.log(`  Segments influenced by crimes: ${streetWeightedScores.size.toLocaleString()}`);
    console.log(`  Average segments influenced per crime: ${avgProximityInfluences.toFixed(1)}`);
    console.log(`  Total proximity influences: ${totalProximityInfluences.toLocaleString()}`);
    console.log(`  Temporal weights: 2024=1.0, 2023=0.9, 2022=0.8, ..., 2015=0.1`);
    console.log(`  Day/Night weights: Day=1.3x, Night=1.0x`);

    console.log('\nDirect Incident Statistics (for comparison):');
    console.log(`  Segments with direct incidents: ${streetIncidentCounts.size.toLocaleString()}`);
    console.log(`  Maximum incidents per segment: ${Math.max(...incidentCounts).toLocaleString()}`);
    console.log(`  Average incidents per segment: ${(incidentCounts.reduce((sum, count) => sum + count, 0) / incidentCounts.length).toFixed(1)}`);

    // Helper function to calculate safety score from weighted score
    function calculateSafetyScore(_: number): number {
      // Legacy helper disabled; kept to satisfy imports
      return 0;
    }

    // Implementation of error function (erf)
    function erf(x: number): number {
      // Constants
      const a1 =  0.254829592;
      const a2 = -0.284496736;
      const a3 =  1.421413741;
      const a4 = -1.453152027;
      const a5 =  1.061405429;
      const p  =  0.3275911;

      // Save the sign of x
      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x);

      // A&S formula 7.1.26
      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

      return sign * y;
    }

    // Cache for sorted scores and percentiles
    let scorePercentiles: { 
      bounds: { lower: number, upper: number },
      stats: { q1: number, q3: number, iqr: number }
    } | null = null;

    // IQR-based normalization with log transform
    function normalizeSafetyScore(weightedScore: number): number {
      // Streets with no crime influence get perfect safety score
      if (weightedScore === 0) return 100;

      // Apply log transform to raw score
      const logScore = logTransform(weightedScore);

      // Compute IQR stats only once for active streets (excluding zero-crime)
      if (!scorePercentiles) {
        // Get non-zero weighted scores
        const nonZeroScores = Array.from(streetWeightedScores.values())
          .filter(score => score > 0);  // Exclude zero-crime streets

        // Log transform the non-zero scores
        const logScores = nonZeroScores.map(logTransform)
          .sort((a, b) => a - b);
        
        const n = logScores.length;
        const q1Index = Math.floor(n * 0.25);
        const q3Index = Math.floor(n * 0.75);
        const q1 = logScores[q1Index];
        const q3 = logScores[q3Index];
        const iqr = q3 - q1;
        
        // Define bounds using 1.5 * IQR rule
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;
        
        scorePercentiles = { 
          bounds: { lower: lowerBound, upper: upperBound },
          stats: { q1, q3, iqr }
        };
        
        // Log statistics for verification
        console.log('\nNormalization Statistics:');
        console.log('Total segments:', streetWeightedScores.size);
        console.log('Zero-crime segments:', streetWeightedScores.size - nonZeroScores.length);
        console.log('Non-zero segments:', nonZeroScores.length);
        console.log('\nRaw Score Stats:');
        console.log('Min (non-zero):', Math.min(...nonZeroScores));
        console.log('Max:', Math.max(...nonZeroScores));
        console.log('\nLog-transform Stats:');
        console.log('Q1:', q1.toFixed(3));
        console.log('Median:', logScores[Math.floor(n * 0.5)].toFixed(3));
        console.log('Q3:', q3.toFixed(3));
        console.log('IQR:', iqr.toFixed(3));
        console.log('Lower bound:', lowerBound.toFixed(3));
        console.log('Upper bound:', upperBound.toFixed(3));
      }

      // Clamp log score to IQR bounds and normalize to 1-99 range
      // (leaving 100 for zero-crime streets)
      const { lower, upper } = scorePercentiles.bounds;
      const clampedScore = Math.min(Math.max(logScore, lower), upper);
      
      // Map to 1-99 range (inverted since higher crime = lower safety)
      const normalizedScore = 99 - ((clampedScore - lower) / (upper - lower) * 98);
      
      return Math.round(normalizedScore);
    }

    // Track score distributions
    const scoreDistribution = new Map<number, number>();
    const dayScoreDistribution = new Map<number, number>();
    const nightScoreDistribution = new Map<number, number>();
    
    // Calculate min/max scores for normalization
    const dayWeightedScores = Array.from(streetDayWeightedScores.values());
    const nightWeightedScores = Array.from(streetNightWeightedScores.values());
    const maxDayScore = Math.max(...dayWeightedScores);
    const minDayScore = Math.min(...dayWeightedScores);
    const maxNightScore = Math.max(...nightWeightedScores);
    const minNightScore = Math.min(...nightWeightedScores);

    // Update street features with proximity-based safety scores
    const features = walkableSegments.map(street => {
      const segmentId = street.properties.OBJECTID.toString();
      const weightedScore = streetWeightedScores.get(segmentId) || 0;
      const dayWeightedScore = streetDayWeightedScores.get(segmentId) || 0;
      const nightWeightedScore = streetNightWeightedScores.get(segmentId) || 0;
      const rawIncidents = streetIncidentCounts.get(segmentId) || 0;
      const dayIncidents = streetDayIncidentCounts.get(segmentId) || 0;
      const nightIncidents = streetNightIncidentCounts.get(segmentId) || 0;
      const proximityInfluences = proximityInfluenceCounts.get(segmentId) || 0;
      const hasDirectHomicide = streetsWithHomicides.has(segmentId);
      
      // Calculate normalized safety scores (1-100 range, 1=most dangerous, 100=safest)
      // Using statistical distribution (z-scores) for more accurate representation
      const safetyScore = normalizeSafetyScore(weightedScore);
      const daySafetyScore = normalizeSafetyScore(dayWeightedScore);
      const nightSafetyScore = normalizeSafetyScore(nightWeightedScore);

      // Track distributions
      scoreDistribution.set(safetyScore, (scoreDistribution.get(safetyScore) || 0) + 1);
      dayScoreDistribution.set(daySafetyScore, (dayScoreDistribution.get(daySafetyScore) || 0) + 1);
      nightScoreDistribution.set(nightSafetyScore, (nightScoreDistribution.get(nightSafetyScore) || 0) + 1);

      return {
        ...street,
        properties: {
          ...street.properties,
          safety_score: safetyScore,
          day_safety_score: daySafetyScore,
          night_safety_score: nightSafetyScore,
          normalized_safety_score: safetyScore,
          normalized_day_safety_score: daySafetyScore,
          normalized_night_safety_score: nightSafetyScore,
          crime_count: rawIncidents,
          day_crime_count: dayIncidents,
          night_crime_count: nightIncidents,
          weighted_crime_score: weightedScore,
          day_weighted_crime_score: dayWeightedScore,
          night_weighted_crime_score: nightWeightedScore,
          log_weighted_crime_score: logTransform(weightedScore),
          log_day_weighted_crime_score: logTransform(dayWeightedScore),
          log_night_weighted_crime_score: logTransform(nightWeightedScore),
          proximity_influences: proximityInfluences,
          has_direct_homicide: hasDirectHomicide
        }
      };
    });

    // Visualize score distributions
    console.log('\n=== OVERALL SAFETY SCORE DISTRIBUTION ===');
    visualizeDistribution(scoreDistribution, streets.features.length);
    
    console.log('\n=== DAY SAFETY SCORE DISTRIBUTION ===');
    visualizeDistribution(dayScoreDistribution, streets.features.length);
    
    console.log('\n=== NIGHT SAFETY SCORE DISTRIBUTION ===');
    visualizeDistribution(nightScoreDistribution, streets.features.length);

    // Create output GeoJSON
    const outputData: FeatureCollection<LineString> = {
      type: 'FeatureCollection',
      features: features as any[]
    };

    // Save to file with streaming
    // Write to project root data folder
    const outputPath = path.join(process.cwd(), '..', 'data', 'DC', 'crime-incidents', 'processed', 'street-safety-scores.geojson');
    console.log(`\nSaving proximity-based results to ${outputPath}...`);
    await streamGeoJSONOutput(outputData, outputPath);

    // Log final statistics
    const matchRate = ((matchedIncidents / totalIncidents) * 100).toFixed(1);
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`\nTemporal + proximity + day/night processing completed in ${processingTime} seconds:`);
    console.log(`Total incidents processed: ${totalIncidents.toLocaleString()}`);
    console.log(`  Day incidents: ${totalDayIncidents.toLocaleString()} (${((totalDayIncidents/totalIncidents)*100).toFixed(1)}%)`);
    console.log(`  Night incidents: ${totalNightIncidents.toLocaleString()} (${((totalNightIncidents/totalIncidents)*100).toFixed(1)}%)`);
    console.log(`Matched incidents: ${matchedIncidents.toLocaleString()}`);
    console.log(`Overall match rate: ${matchRate}%`);
    console.log(`Total weighted crime score (with temporal decay): ${totalWeightedScore.toLocaleString()}`);
    console.log(`  Day weighted score: ${totalDayWeightedScore.toLocaleString()} (${((totalDayWeightedScore/totalWeightedScore)*100).toFixed(1)}%)`);
    console.log(`  Night weighted score: ${totalNightWeightedScore.toLocaleString()} (${((totalNightWeightedScore/totalWeightedScore)*100).toFixed(1)}%)`);
    console.log(`Total homicides: ${totalHomicides.toLocaleString()}`);
    console.log(`Segments with direct homicide impact (for reference): ${streetsWithHomicides.size.toLocaleString()}`);
    console.log(`Total proximity influences applied: ${totalProximityInfluences.toLocaleString()}`);
    console.log(`Average segments influenced per crime: ${avgProximityInfluences.toFixed(1)}`);
    
  } catch (error: any) {
    console.error('Error calculating proximity-based safety scores:', error);
    throw error;
  }
}

// Export the main function
export default calculateSafetyScores;

// Run the script if called directly
if (require.main === module) {
  calculateSafetyScores().catch(console.error);
}