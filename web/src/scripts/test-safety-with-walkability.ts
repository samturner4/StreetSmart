// @ts-nocheck
import { checkBatchWalkability } from './walkability-check';
import { loadStreetCenterlines } from './utils';

async function testSafetyWithWalkability() {
  console.log('Testing safety scoring with walkability filtering...\n');

  try {
    // Load street centerlines
    console.log('Loading street centerlines...');
    const streets = await loadStreetCenterlines();
    console.log(`Loaded ${streets.features.length} street segments`);

    // Take only first 10 segments for testing
    const testSegments = streets.features.slice(0, 10);
    console.log(`Testing with ${testSegments.length} segments...`);

    // Filter for walkability
    console.log('Filtering for walkability...');
    const segmentsToCheck = testSegments.map(segment => {
      const center = getSegmentCenter(segment);
      return {
        lat: center.lat,
        lon: center.lon,
        segment: segment
      };
    });

    const walkabilityResults = await checkBatchWalkability(
      segmentsToCheck.map(s => ({ lat: s.lat, lon: s.lon }))
    );

    // Filter to only walkable segments
    const walkableSegments = [];
    segmentsToCheck.forEach((segmentData, index) => {
      const isWalkable = walkabilityResults.get(index.toString());
      if (isWalkable) {
        walkableSegments.push(segmentData.segment);
        console.log(`✅ Segment ${index}: Walkable - ${segmentData.segment.properties.ST_NAME || 'Unknown'}`);
      } else {
        console.log(`❌ Segment ${index}: Non-walkable - ${segmentData.segment.properties.ST_NAME || 'Unknown'}`);
      }
    });

    console.log(`\nResults: ${walkableSegments.length}/${testSegments.length} segments are walkable`);
    console.log('Walkability filtering test completed successfully!');

  } catch (error) {
    console.error('Error testing safety with walkability:', error);
  }
}

// Helper function to get segment center
function getSegmentCenter(segment: any): { lat: number, lon: number } {
  const coords = segment.geometry.coordinates;
  const midIndex = Math.floor(coords.length / 2);
  return {
    lon: coords[midIndex][0],
    lat: coords[midIndex][1]
  };
}

// Run the test
testSafetyWithWalkability().catch(console.error); 