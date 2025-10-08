import { GraphNode, GraphEdge, EdgeProperties } from '../types';
import { enhanceEdgeGeometry, enhanceGraphGeometry, extractPathGeometry } from '../services/EdgeGeometryService';
import { calculateDistance } from '../utils/distance';

export class GeometryTest {
  static async runAllTests(): Promise<boolean> {
    console.log('🧪 Running Geometry Tests...');
    let allPassed = true;

    try {
      // Test 1: Basic Edge Enhancement
      console.log('\n📐 Test 1: Basic Edge Enhancement');
      const sourceNode: GraphNode = { id: 'node1', lat: 38.9072, lon: -77.0369 };
      const targetNode: GraphNode = { id: 'node2', lat: 38.9082, lon: -77.0359 };
      const edge: GraphEdge = {
        id: 'edge1',
        sourceId: 'node1',
        targetId: 'node2',
        properties: {
          safety_score: 4,
          length_meters: calculateDistance(sourceNode.lat, sourceNode.lon, targetNode.lat, targetNode.lon),
          weight: 1
        }
      };

      const enhancedEdge = enhanceEdgeGeometry(edge, sourceNode, targetNode);
      console.log('Enhanced Edge:', {
        id: enhancedEdge.id,
        pointCount: enhancedEdge.properties.geometry?.coordinates.length
      });

      if (!enhancedEdge.properties.geometry) {
        throw new Error('Edge geometry not created');
      }

      // Test 2: Graph Enhancement
      console.log('\n📊 Test 2: Graph Enhancement');
      const nodes = new Map<string, GraphNode>([
        ['node1', sourceNode],
        ['node2', targetNode]
      ]);
      const edges = new Map<string, GraphEdge>([['edge1', edge]]);
      
      const enhancedGraph = enhanceGraphGeometry(edges, nodes);
      console.log('Enhanced Graph:', {
        edgeCount: enhancedGraph.size,
        sampleEdgePoints: enhancedGraph.get('edge1')?.properties.geometry?.coordinates.length
      });

      // Test 3: Path Geometry Extraction
      console.log('\n🛣️ Test 3: Path Geometry Extraction');
      const edgeLookup = new Map<string, string>([
        ['node1->node2', 'edge1']
      ]);
      
      const path = [sourceNode, targetNode];
      const pathGeometry = extractPathGeometry(path, enhancedGraph, edgeLookup);
      
      console.log('Path Geometry:', {
        type: pathGeometry.type,
        pointCount: pathGeometry.coordinates.length
      });

      // Validation
      if (pathGeometry.coordinates.length < 2) {
        throw new Error('Path geometry has too few points');
      }

      console.log('\n✅ All geometry tests passed!');
      return true;

    } catch (error) {
      console.error('\n❌ Geometry test failed:', error);
      return false;
    }
  }
}