import * as fs from 'fs';
import * as path from 'path';

interface GeoJSONFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: number[][];
  };
  properties: {
    OBJECTID: number;
    [key: string]: any;
  };
}

interface GeoJSONFile {
  type: string;
  features: GeoJSONFeature[];
}

async function debugAlleySegment() {
  console.log('Loading street centerlines...');
  const streetCenterlinesPath = path.join(process.cwd(), 'data/streets/Street_Centerlines.geojson');
  const streetCenterlines = JSON.parse(fs.readFileSync(streetCenterlinesPath, 'utf8')) as GeoJSONFile;
  
  console.log(`Loaded ${streetCenterlines.features.length} street segments`);
  
  // Find segment with OBJECTID 24411
  const targetSegment = streetCenterlines.features.find(feature => feature.properties.OBJECTID === 24411);
  
  if (!targetSegment) {
    console.log('Segment with OBJECTID 24411 not found in raw data');
    return;
  }
  
  console.log('\n=== SEGMENT 24411 DETAILS ===');
  console.log('OBJECTID:', targetSegment.properties.OBJECTID);
  console.log('ST_TYPE:', targetSegment.properties.ST_TYPE);
  console.log('ST_NAME:', targetSegment.properties.ST_NAME);
  console.log('FULL_NAME:', targetSegment.properties.FULL_NAME);
  console.log('STREET_TYPE:', targetSegment.properties.STREET_TYPE);
  console.log('All properties:', JSON.stringify(targetSegment.properties, null, 2));
  
  // Test the alley filtering logic
  const streetType = targetSegment.properties?.ST_TYPE?.toLowerCase() || '';
  const streetName = targetSegment.properties?.ST_NAME?.toLowerCase() || '';
  
  console.log('\n=== ALLEY FILTERING TEST ===');
  console.log('streetType (lowercase):', streetType);
  console.log('streetName (lowercase):', streetName);
  
  const isAlley = streetType.includes('alley') ||
                 streetName.includes('alley') ||
                 streetType.includes('driveway') ||
                 streetType.includes('private');
  
  console.log('isAlley result:', isAlley);
  console.log('Would be filtered out:', isAlley);
  
  // Also check if it's in the processed routing graph
  console.log('\n=== CHECKING PROCESSED GRAPH ===');
  const routingGraphPath = path.join(process.cwd(), 'data/streets/processed/routing-graph.json');
  
  if (fs.existsSync(routingGraphPath)) {
    const routingGraph = JSON.parse(fs.readFileSync(routingGraphPath, 'utf8'));
    console.log('Routing graph loaded');
    
    // Look for edges that might contain this segment
    const edges = routingGraph.edges;
    console.log(`Graph has ${edges.length} edges`);
    
    // Check if any edge has a safety score that matches what we'd expect for this segment
    // We'd need to cross-reference with the safety scores data
    console.log('Note: To fully verify, we would need to check the safety scores data');
  } else {
    console.log('Routing graph not found');
  }
}

debugAlleySegment().catch(console.error); 