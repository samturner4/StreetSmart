import * as fs from 'fs';
import * as path from 'path';

async function checkAlleyFiltering() {
  console.log('Checking if segment 24411 (alley) is still in the routing graph...');
  
  const routingGraphPath = path.join(process.cwd(), 'data/streets/processed/routing-graph.json');
  
  if (!fs.existsSync(routingGraphPath)) {
    console.log('Routing graph not found');
    return;
  }
  
  const routingGraph = JSON.parse(fs.readFileSync(routingGraphPath, 'utf8'));
  console.log('Routing graph loaded');
  
  // Check if any edge contains segment 24411
  const edges = routingGraph.edges;
  console.log(`Graph has ${edges.length} edges`);
  
  // Look for any edge that might be related to segment 24411
  // Since we don't have direct mapping, let's check if the number of edges decreased
  // and look for any patterns that might indicate alley segments were removed
  
  // Also check the raw data to see how many alley segments there were
  const streetCenterlinesPath = path.join(process.cwd(), 'data/streets/Street_Centerlines.geojson');
  const streetCenterlines = JSON.parse(fs.readFileSync(streetCenterlinesPath, 'utf8'));
  
  console.log(`Raw data has ${streetCenterlines.features.length} segments`);
  console.log(`Processed graph has ${edges.length} edges`);
  console.log(`Difference: ${streetCenterlines.features.length - edges.length} segments removed`);
  
  // Count how many alley segments were in the raw data
  let alleyCount = 0;
  for (const feature of streetCenterlines.features) {
    const roadType = feature.properties?.ROADTYPE?.toLowerCase() || '';
    const streetType = feature.properties?.ST_TYPE?.toLowerCase() || '';
    const streetName = feature.properties?.ST_NAME?.toLowerCase() || '';
    
    const isAlley = streetType.includes('alley') ||
                   streetName.includes('alley') ||
                   streetType.includes('driveway') ||
                   streetType.includes('private') ||
                   roadType.includes('alley') ||
                   roadType.includes('driveway') ||
                   roadType.includes('private');
    
    if (isAlley) {
      alleyCount++;
    }
  }
  
  console.log(`Found ${alleyCount} alley segments in raw data`);
  console.log(`Expected segments after filtering: ${streetCenterlines.features.length - alleyCount}`);
  console.log(`Actual segments in graph: ${edges.length}`);
  
  if (edges.length <= streetCenterlines.features.length - alleyCount) {
    console.log('✅ Alley filtering appears to have worked correctly');
  } else {
    console.log('❌ Alley filtering may not have worked as expected');
  }
}

checkAlleyFiltering().catch(console.error); 