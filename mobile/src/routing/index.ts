/**
 * Main routing module export file
 * This provides a clean interface to the routing system
 */

// Export core types
export * from './types';

// Export main routing service
export { findSafestRoute } from './services/RoutingService';

// Note: DataManager intentionally NOT re-exported here to avoid loading large JSON at app startup.

// Export utilities
export * from './utils/distance';
export { PriorityQueue } from './utils/PriorityQueue';

// Export algorithms (for testing)
export { aStarSearch } from './services/AStar';
export { 
  findNearestNode, 
  isWithinEllipticalCorridor, 
  findNearestWalkablePoint 
} from './services/GraphSearch';

// Export test for foundation testing
export { FoundationTest } from './test/FoundationTest';
