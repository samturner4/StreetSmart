import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

// Cache for processed data by time filter
let cachedData: any = null;
let cachedResults: { [key: string]: any } = {}; // Clear this on restart
let lastModified: number = 0;

interface CrimeRecord {
  [key: string]: string;
}

interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: number[][] | number[][][];
  };
  properties: {
    [key: string]: any;
    STREET_NAME?: string;
    BLOCK_NAME?: string;
    FULLNAME?: string;
    OBJECTID?: string | number;
    safety_score?: number;
    street_name?: string;
    block?: string;
    crime_count?: number;
  };
}

interface StreetSegment {
  id: string;
  street_name: string;
  block: string;
  crime_count: number;
  safety_score: number;
}

interface GeoJSONResponse {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timeFilter = searchParams.get('time') || 'overall';
    
    console.log(`Processing street safety data for time filter: ${timeFilter}...`);
    
    // Get absolute paths - Fix path to use the correct data directory
    const projectRoot = process.cwd();
    console.log('Project root:', projectRoot);
    
    // Try multiple possible data paths
    const possiblePaths = [
      path.join(projectRoot, '..', 'data', 'DC'),
      path.join(projectRoot, '..', 'data'),
      path.join(projectRoot, 'data'),
      path.join(projectRoot, 'data', 'DC'),
      path.join(projectRoot, 'src', 'data'),
      projectRoot
    ];

    console.log('Checking possible data paths:', possiblePaths);

    let dataRoot: string | null = null;
    let crimeFilePath: string | null = null;

    // Try each possible path
    for (const basePath of possiblePaths) {
      const testPath = path.join(basePath, 'crime-incidents', 'processed', 'street-safety-scores.geojson');
      console.log('Trying path:', testPath);
      
      if (fs.existsSync(testPath)) {
        console.log('Found crime data at:', testPath);
        dataRoot = basePath;
        crimeFilePath = testPath;
        break;
      }
    }

    if (!dataRoot || !crimeFilePath) {
      console.error('Crime data file not found in any of the tried locations');
      return NextResponse.json(
        { error: `Crime data file not found. Tried paths:\n${possiblePaths.map(p => 
          path.join(p, 'crime-incidents', 'processed', 'street-safety-scores.geojson')
        ).join('\n')}` },
        { status: 404 }
      );
    }

    console.log('Using data root:', dataRoot);
    console.log('Using crime file path:', crimeFilePath);

    // Check if we can use cached data
    const fileStats = fs.statSync(crimeFilePath);
    const fileModified = fileStats.mtime.getTime();
    
    if (cachedData && fileModified === lastModified) {
      console.log('Using cached data - skipping file read');
          } else {
        console.log('Reading and caching new data...');
    let crimeContent: string;
    try {
      console.log('READING FROM FILE:', crimeFilePath);
      crimeContent = fs.readFileSync(crimeFilePath, 'utf-8');
      // Log first safety score to verify data
      const data = JSON.parse(crimeContent);
      console.log('FIRST FEATURE SAFETY SCORE:', data.features[0].properties.safety_score);
      console.log('Successfully read crime data file');
      console.log('File size:', crimeContent.length, 'bytes');
      console.log('First 100 characters:', crimeContent.substring(0, 100));
          
          // Parse and cache the data
          cachedData = JSON.parse(crimeContent);
          lastModified = fileModified;
          
          // Clear processed results cache when raw data changes
          cachedResults = {};
          console.log('Data cached successfully, cleared processed cache');
    } catch (err: unknown) {
      console.error('Error reading crime data file:', err);
      return NextResponse.json(
        { error: `Error reading crime data file: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
        }
    }

    let geoJsonData: GeoJSONResponse;
    try {
      geoJsonData = cachedData;
      console.log('Using cached GeoJSON data');
      console.log('Number of features:', geoJsonData.features.length);
      
      // Map the appropriate safety score based on time filter
      const getSafetyScoreField = (filter: string) => {
        switch (filter) {
          case 'day': return 'day_safety_score';
          case 'night': return 'night_safety_score';
          case 'overall':
          default: 
            return 'safety_score'; // overall
        }
      };

                const safetyScoreField = getSafetyScoreField(timeFilter);
      console.log(`Time filter: ${timeFilter} -> Using field: ${safetyScoreField}`);

    // Check if we have cached results for this time filter
    if (cachedResults[timeFilter]) {
      console.log(`Using cached results for ${timeFilter}`);
      return NextResponse.json(cachedResults[timeFilter]);
    }

    console.log(`Processing features for ${timeFilter}...`);
      
      // Ensure safety scores are properly set
      geoJsonData.features = geoJsonData.features.map(feature => {
        // Log the first few features to debug
        if (geoJsonData.features.indexOf(feature) < 5) {
          console.log('Original feature properties:', feature.properties);
        }

        // Get the appropriate safety score based on time filter
        let safetyScore = feature.properties[safetyScoreField];
        
        // Convert to number if it's a string
        if (typeof safetyScore === 'string') {
          safetyScore = parseFloat(safetyScore);
        }
        
        // Validate and default if needed (allow full 1-100 range)
        if (typeof safetyScore !== 'number' || isNaN(safetyScore) || safetyScore < 1 || safetyScore > 100) {
          console.warn(`Invalid ${timeFilter} safety score found:`, safetyScore, 'for street:', feature.properties.ST_NAME);
          safetyScore = 100; // Default to safest if invalid
        }

        // Keep the original feature but update only the specific time-based score
        const updatedFeature = { ...feature };
        updatedFeature.properties = { ...feature.properties };
        
        // Use the full precision score (no rounding to 1-5)
        const score = safetyScore;
        
        // Log the first few features to verify scores
        if (geoJsonData.features.indexOf(feature) < 2) {
          console.log(`Feature ${geoJsonData.features.indexOf(feature)} scores:`, {
            timeFilter,
            safetyScoreField,
            originalScore: feature.properties[safetyScoreField],
            processedScore: score,
            allScores: {
              overall: feature.properties.safety_score,
              day: feature.properties.day_safety_score,
              night: feature.properties.night_safety_score
            }
          });
        }

        // Set the appropriate score field
        if (timeFilter === 'overall') {
          updatedFeature.properties.safety_score = score;
        } else if (timeFilter === 'day') {
          updatedFeature.properties.day_safety_score = score;
        } else if (timeFilter === 'night') {
          updatedFeature.properties.night_safety_score = score;
        }
        
        return updatedFeature;
      });

      // Log unique safety scores after transformation
      const safetyScores = new Set(geoJsonData.features.map(f => f.properties.safety_score));
      console.log('Safety scores after transformation:', Array.from(safetyScores).sort());
      
      if (geoJsonData.features.length > 0) {
        console.log('Sample transformed feature:', geoJsonData.features[0]);
      }

      // Cache the processed results
      cachedResults[timeFilter] = geoJsonData;
      console.log(`Cached results for ${timeFilter}`);

    } catch (err: unknown) {
      console.error('Error parsing or transforming GeoJSON data:', err);
      return NextResponse.json(
        { error: `Error processing GeoJSON data: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }

    // Return the GeoJSON data with validated safety scores
    return NextResponse.json(geoJsonData);
  } catch (error) {
    console.error('Error processing street safety data:', error);
    return NextResponse.json(
      { error: `Failed to process street safety data: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
} 