/**
 * Foundation Test - Simple test to verify our routing foundation works
 * This tests data loading and basic distance calculations
 */

import { calculateDistance, isWithinDC, validateCoordinates, formatDistance } from '../utils/distance';
import { findSafestRoute } from '../services/RoutingService';

export class FoundationTest {
  /**
   * Test distance calculations
   */
  static testDistanceCalculations(): boolean {
    console.log('🧪 [FoundationTest] Testing distance calculations...');
    
    try {
      // Test known distance between DC landmarks
      // White House: 38.8977, -77.0365
      // Lincoln Memorial: 38.8893, -77.0502
      const whiteHouseLat = 38.8977;
      const whiteHouseLon = -77.0365;
      const lincolnLat = 38.8893;
      const lincolnLon = -77.0502;
      
      const distance = calculateDistance(whiteHouseLat, whiteHouseLon, lincolnLat, lincolnLon);
      
      // Expected distance is roughly 1.7 km (1700 meters)
      if (distance > 1500 && distance < 2000) {
        console.log(`✅ Distance calculation works: ${formatDistance(distance)}`);
      } else {
        console.error(`❌ Distance calculation failed: got ${distance}m, expected ~1700m`);
        return false;
      }
      
      // Test DC bounds checking
      if (isWithinDC(whiteHouseLat, whiteHouseLon)) {
        console.log('✅ DC bounds checking works');
      } else {
        console.error('❌ DC bounds checking failed - White House should be in DC');
        return false;
      }
      
      // Test coordinate validation
      const validation = validateCoordinates(whiteHouseLat, whiteHouseLon);
      if (validation.isValid) {
        console.log('✅ Coordinate validation works');
      } else {
        console.error(`❌ Coordinate validation failed: ${validation.error}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('❌ Distance calculations test failed:', error);
      return false;
    }
  }

  /**
   * Test server API connection
   */
  static async testServerConnection(): Promise<boolean> {
    console.log('🧪 [FoundationTest] Testing server API connection...');
    
    try {
      // Simple route request to test server connectivity
      const startTime = Date.now();
      console.log('🔄 Testing route: White House → Lincoln Memorial');
      const result = await findSafestRoute(38.8977, -77.0365, 38.8893, -77.0502);
      const loadTime = Date.now() - startTime;
      
      console.log('📊 Route details:', {
        waypoints: result.waypoints.length,
        safety: result.safety_score,
        normalized: result.normalized_safety_score,
        distance: result.total_distance,
        duration: result.estimated_duration
      });
      
      console.log(`✅ Server responded in ${loadTime}ms`);
      
      if (!result || !result.waypoints || result.waypoints.length === 0) {
        console.error('❌ Server returned invalid route data');
        return false;
      }
      
      console.log(`📊 Route details: ${result.waypoints.length} waypoints`);
      console.log(`🎯 Safety score: ${result.safety_score}/5 (${result.normalized_safety_score}/100)`);
      console.log(`📏 Distance: ${result.total_distance ? formatDistance(result.total_distance) : 'Unknown'}`);
      console.log(`⏱️ Duration: ${result.estimated_duration} minutes`);
      
      return true;
    } catch (error) {
      console.error('❌ Server connection test failed:', error);
      return false;
    }
  }

  // Priority Queue test removed - no longer needed for server-side routing

  // Core routing test removed - covered by server connection test

  /**
   * Run all foundation tests
   */
  static async runAllTests(): Promise<boolean> {
    console.log('🚀 [FoundationTest] Starting foundation tests...');
    console.log('=====================================');
    
    try {
      // Test 1: Distance calculations
      const distanceTest = this.testDistanceCalculations();
      if (!distanceTest) {
        return false;
      }
      
      console.log('');
      
      // Test 2: Server API connection
      const serverTest = await this.testServerConnection();
      if (!serverTest) {
        return false;
      }
      
      console.log('');
      console.log('🎉 [FoundationTest] All tests passed!');
      console.log('=====================================');
      return true;
      
    } catch (error) {
      console.error('❌ [FoundationTest] Test suite failed:', error);
      return false;
    }
  }
}