import fs from 'fs';
import path from 'path';
import { FeatureCollection, LineString, Feature } from 'geojson';
import { parse } from 'csv-parse';
import { finished } from 'stream/promises';

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

// Global street name map for efficient lookups
let streetNameMap: Map<string, StreetSegment[]>;
// Global reference to all street segments for geographic fallback
let allStreetSegments: StreetSegment[];
// Global spatial index for fast geographic lookups
let spatialIndex: Map<string, StreetSegment[]>;

// Load street centerlines from GeoJSON file
export async function loadStreetCenterlines(): Promise<FeatureCollection<LineString>> {
  const filePath = path.join(process.cwd(), 'data', 'streets', 'Street_Centerlines.geojson');
  const data = await fs.promises.readFile(filePath, 'utf-8');
  const rawData = JSON.parse(data) as FeatureCollection<LineString>;
  
  // Filter out alleys - they are dangerous at night and shouldn't be used for routing
  console.log('Starting alley filtering...');
  const filteredFeatures = rawData.features.filter(feature => {
    const roadType = feature.properties?.ROADTYPE;
    if (feature.properties?.OBJECTID === 21512) {
      console.log('Found OBJECTID 21512:');
      console.log('  ROADTYPE:', roadType);
      console.log('  After trim & lowercase:', roadType?.trim().toLowerCase());
      console.log('  Will be filtered?', !!(roadType && roadType.trim().toLowerCase() === 'alley'));
    }
    return !(roadType && roadType.trim().toLowerCase() === 'alley');
  });
  
  console.log(`Filtered out ${rawData.features.length - filteredFeatures.length} alley segments`);
  console.log(`Remaining street segments: ${filteredFeatures.length}`);
  
  return {
    type: 'FeatureCollection',
    features: filteredFeatures
  };
}

// Initialize street name map for efficient lookups
export async function initializeStreetNameMap(streets: StreetSegment[]): Promise<void> {
  streetNameMap = new Map();
  allStreetSegments = streets; // Store for geographic fallback
  
  // Create spatial index for fast geographic lookups
  const GRID_SIZE = 0.002; // degrees (~200m at DC latitude)
  spatialIndex = new Map();
  
  streets.forEach(street => {
    // Build name-based index
    let fullName = '';
    if (street.properties.ST_NAME) {
      fullName = street.properties.ST_NAME;
      if (street.properties.QUADRANT) {
        fullName += ' ' + street.properties.QUADRANT;
      }
    }
    
    const normalizedName = normalizeStreetName(fullName);
    if (normalizedName) { // Only add streets with valid names
      if (!streetNameMap.has(normalizedName)) {
        streetNameMap.set(normalizedName, []);
      }
      streetNameMap.get(normalizedName)!.push(street);
    }
    
    // Build spatial index
    const center = getSegmentCenter(street);
    const gridX = Math.floor(center.lon / GRID_SIZE);
    const gridY = Math.floor(center.lat / GRID_SIZE);
    const gridKey = `${gridX},${gridY}`;
    
    if (!spatialIndex.has(gridKey)) {
      spatialIndex.set(gridKey, []);
    }
    spatialIndex.get(gridKey)!.push(street);
  });
  
  console.log(`Built spatial index with ${spatialIndex.size} grid cells for ${streets.length} segments`);
}

// Normalize street name for consistent matching
function normalizeStreetName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }
  
  let normalized = name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '')
    .trim();
  
  // Normalize street type abbreviations
  normalized = normalized
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bway\b/g, 'way')
    .replace(/\bcircle\b/g, 'cir')
    .replace(/\bparkway\b/g, 'pkwy');
  
  return normalized;
}

// Extract street name from BLOCK field (e.g., "3000 - 3099 BLOCK OF SEDGWICK STREET NW" -> "SEDGWICK STREET NW")
function extractStreetName(blockField: string): string {
  if (!blockField) return '';
  
  // Look for "BLOCK OF" pattern
  const blockOfIndex = blockField.indexOf('BLOCK OF ');
  if (blockOfIndex !== -1) {
    return blockField.substring(blockOfIndex + 9); // Skip "BLOCK OF "
  }
  
  // If no "BLOCK OF" pattern, try to extract street name from the end
  // This handles cases like "1ST STREET NW" without "BLOCK OF"
  const parts = blockField.split(' ');
  if (parts.length >= 2) {
    // Look for common street suffixes
    const streetSuffixes = ['ST', 'STREET', 'AVE', 'AVENUE', 'RD', 'ROAD', 'DR', 'DRIVE', 'PL', 'PLACE', 'CT', 'COURT', 'LN', 'LANE', 'WAY', 'BLVD', 'BOULEVARD'];
    for (let i = parts.length - 1; i >= 0; i--) {
      if (streetSuffixes.includes(parts[i])) {
        // Found a street suffix, take this and previous words as street name
        const streetName = parts.slice(Math.max(0, i - 2), parts.length).join(' ');
        return streetName;
      }
    }
  }
  
  return blockField; // Return as-is if no pattern found
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in meters
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

// Find exact street match for a crime incident using geographic-first matching
export function findExactStreetMatch(incident: CrimeIncident): StreetSegment | null {
  const MAX_DISTANCE = 75; // meters - reasonable walking distance to street
  const GRID_SIZE = 0.002; // degrees (~200m at DC latitude)
  
  const radiusInDegrees = MAX_DISTANCE / 111000; // Convert meters to degrees
  const gridRadius = Math.ceil(radiusInDegrees / GRID_SIZE);
  
  const centerGridX = Math.floor(incident.longitude / GRID_SIZE);
  const centerGridY = Math.floor(incident.latitude / GRID_SIZE);
  
  let closestSegment: StreetSegment | null = null;
  let minDistance = Infinity;

  // Check surrounding grid cells using pre-built spatial index
  for (let dx = -gridRadius; dx <= gridRadius; dx++) {
    for (let dy = -gridRadius; dy <= gridRadius; dy++) {
      const gridKey = `${centerGridX + dx},${centerGridY + dy}`;
      const segmentsInCell = spatialIndex.get(gridKey);
      
      if (segmentsInCell) {
        // Only check segments actually in this grid cell (much faster!)
        segmentsInCell.forEach(segment => {
          const segmentCenter = getSegmentCenter(segment);
    const distance = calculateDistance(
      incident.latitude, incident.longitude,
      segmentCenter.lat, segmentCenter.lon
    );

          if (distance <= MAX_DISTANCE && distance < minDistance) {
      minDistance = distance;
            closestSegment = segment;
          }
        });
      }
    }
  }

  return closestSegment; // Returns closest segment within 75m, or null
}

// Process incidents in chunks to manage memory usage
export async function processIncidentsInChunks(
  filePath: string,
  processCallback: ProcessIncidentsCallback,
  progressCallback: ProgressCallback,
  chunkSize: number = 1000
): Promise<void> {
  const fileStream = fs.createReadStream(filePath);
  const parser = parse({
    columns: true,
    skip_empty_lines: true
  });

  let buffer: CrimeIncident[] = [];
  let processed = 0;
  const total = await getLineCount(filePath);

  fileStream.pipe(parser);

  for await (const record of parser) {
    const incident: CrimeIncident = {
      latitude: parseFloat(record.LATITUDE), // Use LATITUDE column
      longitude: parseFloat(record.LONGITUDE), // Use LONGITUDE column
      offense: record.OFFENSE,
      date: record.REPORT_DAT,
      street: record.BLOCK,
      timeOfDay: getTimeOfDay(record.REPORT_DAT)
    };

    buffer.push(incident);
    processed++;

    if (buffer.length >= chunkSize) {
      processCallback(buffer);
      progressCallback(processed, total);
      buffer = [];
    }
  }

  // Process remaining incidents
  if (buffer.length > 0) {
    processCallback(buffer);
    progressCallback(processed, total);
  }
}

// Stream GeoJSON output to file
export async function streamGeoJSONOutput(
  data: FeatureCollection<LineString>,
  outputPath: string
): Promise<void> {
  // Ensure the directory exists
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  
  // Write the file
  await fs.promises.writeFile(outputPath, JSON.stringify(data, null, 2));
}

// Helper function to determine time of day from timestamp
function getTimeOfDay(dateString: string): 'day' | 'night' {
  try {
    const date = new Date(dateString);
    const hour = date.getHours();
    // Day: 6 AM to 6 PM (6-18), Night: 6 PM to 6 AM (18-6)
    return (hour >= 6 && hour < 18) ? 'day' : 'night';
  } catch (error) {
    // Default to night if parsing fails
    return 'night';
  }
}

// Helper function to get line count of a file
async function getLineCount(filePath: string): Promise<number> {
  const fileContent = await fs.promises.readFile(filePath, 'utf-8');
  return fileContent.split('\n').length - 1; // -1 for header
} 