/**
 * Simple test runner for foundation tests
 * This can be imported and run from anywhere to test the routing foundation
 */

import { FoundationTest } from './FoundationTest';

export async function runFoundationTest(): Promise<void> {
  console.log('🚀 Starting Foundation Test...');
  
  try {
    const success = await FoundationTest.runAllTests();
    
    if (success) {
      console.log('🎉 Foundation test PASSED! All systems working.');
    } else {
      console.error('❌ Foundation test FAILED! Check the logs above.');
    }
  } catch (error) {
    console.error('💥 Foundation test crashed:', error);
  }
}

// Auto-run if this file is executed directly
if (require.main === module) {
  runFoundationTest();
}
