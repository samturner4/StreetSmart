import { AStarService } from '../services/AStarService';
import { GeometryBuilder } from '../services/GeometryBuilder';
import { RouteFormatter } from '../services/RouteFormatter';
import { GraphBuilder } from '../services/GraphBuilder';
import { GraphNode, GraphEdge, RoutingGraph, RouteSegmentResult } from '../types';
import { calculateDistance } from '../utils/distance';

export class FullRoutingTest {
  static async runAllTests(): Promise<boolean> {
    console.log('🧪 Running Full Routing System Test...');
    
    try {
      // Test Data: Small graph in DC
      // Test nodes
      const nodes = [
        { id: 'start', lat: 38.9072, lon: -77.0369 }, // DC Center
        { id: 'mid1', lat: 38.9082, lon: -77.0359 },  // North-East
        { id: 'mid2', lat: 38.9062, lon: -77.0379 },  // South-West
        { id: 'end', lat: 38.9092, lon: -77.0349 }    // Further North-East
      ];

      // Test edges with curved geometry
      const edges = [
        {
          id: 'e1',
          sourceId: 'start',
          targetId: 'mid1',
          properties: {
            safety_score: 4,
            length_meters: calculateDistance(38.9072, -77.0369, 38.9082, -77.0359),
            weight: 1,
            street_name: 'Test Street 1',
            geometry: {
              type: 'LineString',
              coordinates: [
                [-77.0369, 38.9072], // start
                [-77.0365, 38.9075], // curve point 1
                [-77.0362, 38.9078], // curve point 2
                [-77.0359, 38.9082]  // mid1
              ]
            }
          }
        },
        {
          id: 'e2',
          sourceId: 'start',
          targetId: 'mid2',
          properties: {
            safety_score: 2,
            length_meters: calculateDistance(38.9072, -77.0369, 38.9062, -77.0379),
            weight: 1,
            street_name: 'Test Street 2',
            geometry: {
              type: 'LineString',
              coordinates: [
                [-77.0369, 38.9072], // start
                [-77.0374, 38.9067], // curve point
                [-77.0379, 38.9062]  // mid2
              ]
            }
          }
        },
        {
          id: 'e3',
          sourceId: 'mid1',
          targetId: 'end',
          properties: {
            safety_score: 5,
            length_meters: calculateDistance(38.9082, -77.0359, 38.9092, -77.0349),
            weight: 1,
            street_name: 'Test Street 3',
            geometry: {
              type: 'LineString',
              coordinates: [
                [-77.0359, 38.9082], // mid1
                [-77.0354, 38.9087], // curve point
                [-77.0349, 38.9092]  // end
              ]
            }
          }
        }
      ];

      // Build graph with efficient lookups
      const graph = GraphBuilder.buildGraph(nodes, edges);
      
      // Validate graph structure
      GraphBuilder.validateGraph(graph);

      // Test 1: A* Path Finding
      console.log('\n📍 Test 1: A* Path Finding');
      const startNode = graph.nodes.get('start')!;
      const endNode = graph.nodes.get('end')!;
      
      const shortestDistance = AStarService.findShortestDistance(graph, startNode, endNode);
      console.log(`Shortest possible distance: ${shortestDistance}m`);
      
      const maxAllowedDistance = shortestDistance * 1.3; // 30% longer allowed
      const path = AStarService.findPath(graph, startNode, endNode, maxAllowedDistance, shortestDistance);
      
      if (!path) {
        throw new Error('No path found');
      }
      
      console.log('Path found:', path.map(p => p.node.id).join(' → '));
      console.log(`Path length: ${path.length} nodes`);

      // Test 2: Geometry Building
      console.log('\n📐 Test 2: Geometry Building');
      const geometry = GeometryBuilder.buildRouteGeometry(
        path.map(p => p.node),
        graph.edges,
        graph.edgeLookup
      );
      
      // Analyze geometry details
      const geometryStats = {
        type: geometry.type,
        totalPoints: geometry.coordinates.length,
        curvePoints: geometry.coordinates.length - path.length, // Additional points beyond node-to-node
        segments: path.length - 1,
        averagePointsPerSegment: (geometry.coordinates.length / (path.length - 1)).toFixed(1)
      };
      
      console.log('Generated geometry:', geometryStats);
      
      // Validate geometry
      if (geometry.coordinates.length < path.length) {
        throw new Error('Geometry has fewer points than path nodes');
      }
      
      // Check if start/end points match
      const startPoint = geometry.coordinates[0];
      const endPoint = geometry.coordinates[geometry.coordinates.length - 1];
      const startMatches = Math.abs(startPoint[0] - path[0].node.lon) < 0.0001 && 
                          Math.abs(startPoint[1] - path[0].node.lat) < 0.0001;
      const endMatches = Math.abs(endPoint[0] - path[path.length - 1].node.lon) < 0.0001 && 
                        Math.abs(endPoint[1] - path[path.length - 1].node.lat) < 0.0001;
      
      if (!startMatches || !endMatches) {
        throw new Error('Geometry start/end points do not match path nodes');
      }

      // Test 3: Route Formatting
      console.log('\n📋 Test 3: Route Formatting');
      const formattedRoute = RouteFormatter.formatRoute(path, geometry, true);
      
      console.log('Formatted route:', {
        waypoints: formattedRoute.waypoints.length,
        safety: formattedRoute.normalized_safety_score,
        distance: RouteFormatter.formatDistance(formattedRoute.total_distance),
        duration: RouteFormatter.formatDuration(formattedRoute.estimated_duration),
        segments: formattedRoute.segments.length
      });

      // Validation
      if (formattedRoute.waypoints.length < 2) {
        throw new Error('Route has too few waypoints');
      }
      if (formattedRoute.total_distance <= 0) {
        throw new Error('Invalid route distance');
      }
      if (formattedRoute.normalized_safety_score < 0 || formattedRoute.normalized_safety_score > 100) {
        throw new Error('Invalid safety score');
      }

      // Validate route segments
      formattedRoute.segments.forEach((segment: RouteSegmentResult, index: number) => {
        // Each segment should have geometry
        if (!segment.geometry || !segment.geometry.coordinates || segment.geometry.coordinates.length < 2) {
          throw new Error(`Segment ${index} has invalid geometry`);
        }

        // Segments should connect (end point of one matches start point of next)
        if (index < formattedRoute.segments.length - 1) {
          const nextSegment = formattedRoute.segments[index + 1];
          const currentEnd = segment.geometry.coordinates[segment.geometry.coordinates.length - 1];
          const nextStart = nextSegment.geometry.coordinates[0];
          
          if (Math.abs(currentEnd[0] - nextStart[0]) > 0.0001 || 
              Math.abs(currentEnd[1] - nextStart[1]) > 0.0001) {
            throw new Error(`Gap between segments ${index} and ${index + 1}`);
          }
        }

        // Validate segment metadata
        if (!segment.street_name || segment.safety_score === undefined || !segment.length_meters) {
          throw new Error(`Segment ${index} is missing required metadata`);
        }
      });

      console.log('\n✅ All routing tests passed!');
      return true;

    } catch (error) {
      console.error('\n❌ Routing test failed:', error);
      return false;
    }
  }
}
