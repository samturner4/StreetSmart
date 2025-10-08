import fs from 'fs';
import path from 'path';

interface OSMElement {
  id: number;
  type: string;
  tags?: Record<string, string>;
}

function checkOSMData() {
  console.log('Checking OSM data composition...\n');

  // Load OSM data
  const osmPath = path.join(process.cwd(), 'data', 'osm-walkability', 'dc-walkable-streets.json');
  const osmData = JSON.parse(fs.readFileSync(osmPath, 'utf-8'));

  console.log(`Total elements: ${osmData.elements.length}`);

  // Count by type
  const typeCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};

  for (const element of osmData.elements) {
    const type = element.type;
    typeCounts[type] = (typeCounts[type] || 0) + 1;

    // Count tags for ways
    if (type === 'way' && element.tags) {
      for (const [key, value] of Object.entries(element.tags)) {
        const tagKey = `${key}=${value}`;
        tagCounts[tagKey] = (tagCounts[tagKey] || 0) + 1;
      }
    }
  }

  console.log('Element types:');
  for (const [type, count] of Object.entries(typeCounts)) {
    console.log(`  ${type}: ${count.toLocaleString()}`);
  }

  console.log('\nMost common way tags:');
  const sortedTags = Object.entries(tagCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 20);
  
  for (const [tag, count] of sortedTags) {
    console.log(`  ${tag}: ${count.toLocaleString()}`);
  }

  // Check for park-related tags
  console.log('\nPark-related tags:');
  const parkTags = Object.entries(tagCounts)
    .filter(([tag]) => tag.includes('park') || tag.includes('leisure') || tag.includes('boundary'))
    .sort(([,a], [,b]) => b - a);
  
  for (const [tag, count] of parkTags) {
    console.log(`  ${tag}: ${count.toLocaleString()}`);
  }

  // Check file size and source
  const stats = fs.statSync(osmPath);
  console.log(`\nFile size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  
  // Check if this looks like a complete OSM extract
  if (typeCounts.relation === 0) {
    console.log('\n⚠️  WARNING: No relations found in OSM data!');
    console.log('This suggests the OSM extract is incomplete or filtered.');
    console.log('Park boundaries are typically stored as relations in OSM.');
    console.log('You may need to get a more complete OSM extract that includes relations.');
  }
}

checkOSMData(); 