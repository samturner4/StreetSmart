import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface StreetFeature {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
  properties: {
    [key: string]: any;
    safety_score?: number;
    day_safety_score?: number;
    night_safety_score?: number;
    crime_count?: number;
  };
}

interface StreetGeoJSON {
  type: 'FeatureCollection';
  features: StreetFeature[];
}

interface VoronoiCell {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties: {
    center_lat: number;
    center_lng: number;
    safety_score: number;
    safety_zone: number;
    zone_color: string;
    crime_count: number;
    street_name?: string;
  };
}

interface VoronoiGeoJSON {
  type: 'FeatureCollection';
  features: VoronoiCell[];
}

// Safety zone colors from green to red
const SAFETY_ZONE_COLORS = {
  1: '#ff0000', // red - least safe
  2: '#ff9900', // orange
  3: '#ffff00', // yellow
  4: '#90EE90', // light green
  5: '#006400'  // dark green - most safe
};

function getSafetyZone(safetyScore: number): number {
  // Convert safety score (1-5) to zone (1-5)
  // Lower safety score = higher zone number (more dangerous)
  if (safetyScore <= 1) return 1; // red
  if (safetyScore <= 2) return 2; // orange
  if (safetyScore <= 3) return 3; // yellow
  if (safetyScore <= 4) return 4; // light green
  return 5; // dark green
}

// Calculate center point of a line segment
function getLineCenter(coordinates: number[][]): { lat: number; lng: number } {
  const midIndex = Math.floor(coordinates.length / 2);
  const midPoint = coordinates[midIndex];
  return {
    lng: midPoint[0],
    lat: midPoint[1]
  };
}

// Merge adjacent cells of the same safety zone
function mergeAdjacentCells(cells: VoronoiCell[]): VoronoiCell[] {
  const zoneGroups = new Map<number, VoronoiCell[]>();
  
  // Group cells by safety zone
  for (const cell of cells) {
    const zone = cell.properties.safety_zone;
    if (!zoneGroups.has(zone)) {
      zoneGroups.set(zone, []);
    }
    zoneGroups.get(zone)!.push(cell);
  }
  
  const mergedCells: VoronoiCell[] = [];
  
  // For each zone, create a single merged polygon
  for (const [zone, zoneCells] of zoneGroups) {
    if (zoneCells.length === 0) continue;
    
    // Create a simple convex hull around all cells in the zone
    // This is a simplified approach - for more precise merging we'd need a proper geometric library
    const allPoints: number[][] = [];
    
    for (const cell of zoneCells) {
      // Add all points from the cell's polygon
      for (const ring of cell.geometry.coordinates) {
        for (const point of ring) {
          allPoints.push(point);
        }
      }
    }
    
    // Create a bounding box for the zone (simplified approach)
    const lngs = allPoints.map(p => p[0]);
    const lats = allPoints.map(p => p[1]);
    
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    
    // Add some padding to make zones overlap slightly
    const padding = 0.001;
    const zoneCoordinates = [
      [
        [minLng - padding, minLat - padding],
        [maxLng + padding, minLat - padding],
        [maxLng + padding, maxLat + padding],
        [minLng - padding, maxLat + padding],
        [minLng - padding, minLat - padding] // Close the polygon
      ]
    ];
    
    // Calculate average properties for the merged zone
    const avgSafetyScore = zoneCells.reduce((sum, cell) => sum + cell.properties.safety_score, 0) / zoneCells.length;
    const totalCrimeCount = zoneCells.reduce((sum, cell) => sum + cell.properties.crime_count, 0);
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    
    mergedCells.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: zoneCoordinates
      },
      properties: {
        center_lat: centerLat,
        center_lng: centerLng,
        safety_score: avgSafetyScore,
        safety_zone: zone,
        zone_color: SAFETY_ZONE_COLORS[zone as keyof typeof SAFETY_ZONE_COLORS],
        crime_count: totalCrimeCount,
        street_name: `${zoneCells.length} streets`
      }
    });
  }
  
  return mergedCells;
}

// Generate cells from street safety data
function generateVoronoiCells(streetData: StreetGeoJSON, timeFilter: string): VoronoiCell[] {
  const cells: VoronoiCell[] = [];
  
  for (const street of streetData.features) {
    const center = getLineCenter(street.geometry.coordinates);
    const safetyScore = timeFilter === 'overall' 
      ? street.properties.safety_score 
      : timeFilter === 'day' 
        ? street.properties.day_safety_score 
        : street.properties.night_safety_score;
    
    if (typeof safetyScore !== 'number' || isNaN(safetyScore)) {
      continue; // Skip streets without valid safety scores
    }
    
    const safetyZone = getSafetyZone(safetyScore);
    
    // Create a simple square cell around the center point
    const cellSize = 0.002; // Adjust based on zoom level
    const cellCoordinates = [
      [
        [center.lng - cellSize, center.lat - cellSize],
        [center.lng + cellSize, center.lat - cellSize],
        [center.lng + cellSize, center.lat + cellSize],
        [center.lng - cellSize, center.lat + cellSize],
        [center.lng - cellSize, center.lat - cellSize] // Close the polygon
      ]
    ];
    
    cells.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: cellCoordinates
      },
      properties: {
        center_lat: center.lat,
        center_lng: center.lng,
        safety_score: safetyScore,
        safety_zone: safetyZone,
        zone_color: SAFETY_ZONE_COLORS[safetyZone as keyof typeof SAFETY_ZONE_COLORS],
        crime_count: street.properties.crime_count || 0,
        street_name: street.properties.ST_NAME || street.properties.street_name
      }
    });
  }
  
  // Merge adjacent cells of the same zone
  return mergeAdjacentCells(cells);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeFilter = searchParams.get('time') || 'overall';

    // Load DC street segments
    const streetsPath = path.join(
      process.cwd(),
      'data',
      'crime-incidents',
      'processed',
      'street-safety-scores.geojson'
    );

    if (!fs.existsSync(streetsPath)) {
      return NextResponse.json(
        { error: 'DC street data not found' },
        { status: 404 }
      );
    }

    const streetsContent = fs.readFileSync(streetsPath, 'utf-8');
    const streetData: StreetGeoJSON = JSON.parse(streetsContent);

    // Generate merged zones from street safety data
    const mergedZones = generateVoronoiCells(streetData, timeFilter);

    const processedData: VoronoiGeoJSON = {
      type: 'FeatureCollection',
      features: mergedZones
    };

    return NextResponse.json(processedData);
  } catch (error) {
    console.error('Error processing zone safety data:', error);
    return NextResponse.json(
      { error: `Failed to process zone safety data: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
} 