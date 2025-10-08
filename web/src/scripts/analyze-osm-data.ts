import fs from 'fs';
import path from 'path';

async function analyzeOSMData() {
  console.log('Analyzing OSM data structure...\n');

  const osmPath = path.join(process.cwd(), 'data', 'osm-walkability', 'dc-walkable-streets.json');
  const osmData = JSON.parse(fs.readFileSync(osmPath, 'utf-8'));

  console.log(`Total elements: ${osmData.elements.length}`);

  // Collect all unique tags
  const allTags = new Set<string>();
  const tagCounts = new Map<string, number>();
  const highwayTypes = new Set<string>();
  const landuseTypes = new Set<string>();
  const surfaceTypes = new Set<string>();
  const sidewalkTypes = new Set<string>();
  const litTypes = new Set<string>();

  // Sample elements for detailed analysis
  const sampleElements: any[] = [];

  osmData.elements.forEach((element: any, index: number) => {
    if (element.tags) {
      // Collect all tag names
      Object.keys(element.tags).forEach(tag => {
        allTags.add(tag);
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });

      // Collect specific tag values
      if (element.tags.highway) highwayTypes.add(element.tags.highway);
      if (element.tags.landuse) landuseTypes.add(element.tags.landuse);
      if (element.tags.surface) surfaceTypes.add(element.tags.surface);
      if (element.tags.sidewalk) sidewalkTypes.add(element.tags.sidewalk);
      if (element.tags.lit) litTypes.add(element.tags.lit);

      // Collect sample elements for detailed analysis
      if (sampleElements.length < 20) {
        sampleElements.push(element);
      }
    }
  });

  console.log('=== AVAILABLE OSM TAGS ===');
  console.log(`Total unique tags: ${allTags.size}`);
  
  // Show most common tags
  const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
  console.log('\nMost common tags:');
  sortedTags.slice(0, 20).forEach(([tag, count]) => {
    console.log(`  ${tag}: ${count} occurrences`);
  });

  console.log('\n=== HIGHWAY TYPES ===');
  console.log(`Found ${highwayTypes.size} highway types:`);
  Array.from(highwayTypes).sort().forEach(type => console.log(`  ${type}`));

  console.log('\n=== LANDUSE TYPES ===');
  console.log(`Found ${landuseTypes.size} landuse types:`);
  Array.from(landuseTypes).sort().forEach(type => console.log(`  ${type}`));

  console.log('\n=== SURFACE TYPES ===');
  console.log(`Found ${surfaceTypes.size} surface types:`);
  Array.from(surfaceTypes).sort().forEach(type => console.log(`  ${type}`));

  console.log('\n=== SIDEWALK TYPES ===');
  console.log(`Found ${sidewalkTypes.size} sidewalk types:`);
  Array.from(sidewalkTypes).sort().forEach(type => console.log(`  ${type}`));

  console.log('\n=== LIGHTING TYPES ===');
  console.log(`Found ${litTypes.size} lighting types:`);
  Array.from(litTypes).sort().forEach(type => console.log(`  ${type}`));

  console.log('\n=== SAMPLE ELEMENTS ===');
  sampleElements.forEach((element, index) => {
    console.log(`\nSample ${index + 1}:`);
    console.log(`  Type: ${element.type}`);
    console.log(`  ID: ${element.id}`);
    console.log(`  Tags:`, JSON.stringify(element.tags, null, 4));
  });

  // Analyze specific elements for sidewalk and lighting
  console.log('\n=== SIDEWALK ANALYSIS ===');
  const elementsWithSidewalk = osmData.elements.filter((el: any) => el.tags && el.tags.sidewalk);
  console.log(`Elements with sidewalk tags: ${elementsWithSidewalk.length}`);
  
  if (elementsWithSidewalk.length > 0) {
    console.log('Sample sidewalk elements:');
    elementsWithSidewalk.slice(0, 5).forEach((el: any, index: number) => {
      console.log(`  ${index + 1}. Highway: ${el.tags.highway}, Sidewalk: ${el.tags.sidewalk}, Name: ${el.tags.name || 'unnamed'}`);
    });
  }

  console.log('\n=== LIGHTING ANALYSIS ===');
  const elementsWithLighting = osmData.elements.filter((el: any) => el.tags && el.tags.lit);
  console.log(`Elements with lighting tags: ${elementsWithLighting.length}`);
  
  if (elementsWithLighting.length > 0) {
    console.log('Sample lighting elements:');
    elementsWithLighting.slice(0, 5).forEach((el: any, index: number) => {
      console.log(`  ${index + 1}. Highway: ${el.tags.highway}, Lit: ${el.tags.lit}, Name: ${el.tags.name || 'unnamed'}`);
    });
  }

  // Check for footway elements (dedicated sidewalks)
  console.log('\n=== FOOTWAY ANALYSIS ===');
  const footwayElements = osmData.elements.filter((el: any) => el.tags && el.tags.highway === 'footway');
  console.log(`Footway elements: ${footwayElements.length}`);
  
  if (footwayElements.length > 0) {
    console.log('Sample footway elements:');
    footwayElements.slice(0, 5).forEach((el: any, index: number) => {
      console.log(`  ${index + 1}. Footway: ${el.tags.footway}, Name: ${el.tags.name || 'unnamed'}`);
    });
  }
}

analyzeOSMData(); 