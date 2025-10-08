// Simple JavaScript test for foundation
// This can be run directly with Node.js to test basic functionality

console.log('🧪 Running simple foundation test...');

// Test basic distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Test DC bounds
const DC_BOUNDS = {
  north: 38.995,
  south: 38.791,
  east: -76.909,
  west: -77.119
};

function isWithinDC(lat, lon) {
  return lat >= DC_BOUNDS.south && 
         lat <= DC_BOUNDS.north && 
         lon >= DC_BOUNDS.west && 
         lon <= DC_BOUNDS.east;
}

// Test coordinates
const whiteHouseLat = 38.8977;
const whiteHouseLon = -77.0365;
const lincolnLat = 38.8893;
const lincolnLon = -77.0502;

console.log('📍 Testing distance calculation...');
const distance = calculateDistance(whiteHouseLat, whiteHouseLon, lincolnLat, lincolnLon);
console.log(`Distance: ${distance.toFixed(0)} meters (expected ~1700m)`);

console.log('📍 Testing DC bounds...');
const inDC = isWithinDC(whiteHouseLat, whiteHouseLon);
console.log(`White House in DC: ${inDC}`);

console.log('✅ Simple foundation test completed!');
console.log('📱 To test the full foundation, run the mobile app and tap the 🧪 button');
