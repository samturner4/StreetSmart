// Simple test script to verify tile loading
// Run this in your React Native app to test the tile service

const testTileService = async () => {
  console.log('🧪 Testing tile service...');
  
  try {
    // Test loading a specific tile
    const response = await fetch('https://d3groh2thon6ux.cloudfront.net/dc/tiles/10/292/391.pbf');
    
    if (response.ok) {
      const tileData = await response.arrayBuffer();
      console.log('✅ Tile loaded successfully!');
      console.log('📊 Tile size:', tileData.byteLength, 'bytes');
      console.log('🔗 Tile URL:', response.url);
    } else {
      console.error('❌ Failed to load tile:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('❌ Error testing tile service:', error);
  }
};

// Export for use in your app
export default testTileService;
