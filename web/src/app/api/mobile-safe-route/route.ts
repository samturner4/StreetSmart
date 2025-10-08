import { NextRequest } from 'next/server';
import { findRoute, calculateDistance, loadRoutingGraph } from '@/scripts/routing';
import { DC_BOUNDS } from '@/scripts/routing';

/**
 * Validate coordinates and check if within DC
 */
function validateAndCheckCoordinates(lat: number, lon: number): { isValid: boolean; error?: string } {
  // Check if coordinates are numbers
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    return { isValid: false, error: 'Invalid coordinates' };
  }

  // Check latitude range
  if (lat < -90 || lat > 90) {
    return { isValid: false, error: 'Latitude must be between -90 and 90' };
  }

  // Check longitude range
  if (lon < -180 || lon > 180) {
    return { isValid: false, error: 'Longitude must be between -180 and 180' };
  }



  return { isValid: true };
}

export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const startLat = parseFloat(searchParams.get('startLat') || '');
    const startLon = parseFloat(searchParams.get('startLon') || '');
    const endLat = parseFloat(searchParams.get('endLat') || '');
    const endLon = parseFloat(searchParams.get('endLon') || '');
    const includeDebug = searchParams.get('includeDebug') === 'true';
    const routeType = (searchParams.get('routeType') || 'safest') as any;

    // Validate coordinates
    const points = [
      { lat: startLat, lon: startLon, name: 'start' },
      { lat: endLat, lon: endLon, name: 'end' }
    ];

    for (const point of points) {
      const validation = validateAndCheckCoordinates(point.lat, point.lon);
      if (!validation.isValid) {
        return new Response(
          JSON.stringify({ error: `${point.name}: ${validation.error}` }),
          { status: 400 }
        );
      }
    }

    // Store original points for debug info
    const originalPoints = [
      { latitude: startLat, longitude: startLon },
      { latitude: endLat, longitude: endLon }
    ];

    // Debug: Graph Loading
    console.log('🔍 DEBUG: Loading routing graph...');
    const graph = loadRoutingGraph();
    
    // Debug: Graph Statistics
    console.log('📊 Graph Statistics:');
    console.log(`  • Nodes: ${graph.nodes.size}`);
    console.log(`  • Edges: ${graph.edges.size}`);
    console.log(`  • Adjacency Lists: ${graph.adjacencyList.size}`);
    console.log(`  • Edge Lookups: ${graph.edgeLookup.size}`);

    // Sample node check (first node in graph)
    const firstNode = Array.from(graph.nodes.values())[0];
    if (firstNode) {
      console.log('📍 Sample Node:');
      console.log(`  • ID: ${firstNode.id}`);
      console.log(`  • Location: (${firstNode.lat}, ${firstNode.lon})`);
      
      // Check connectivity for this node
      const neighbors = graph.adjacencyList.get(firstNode.id);
      console.log(`  • Neighbors: ${neighbors ? neighbors.size : 0}`);
    }

    // Find safest route
    console.log('\n🛣️ Finding route:', { startLat, startLon, endLat, endLon });
    let route;
    try {
      route = await findRoute(
        startLat,
        startLon,
        endLat,
        endLon,
        { routeType }
      );
    } catch (error) {
      // Pass through specific error messages
      if (error instanceof Error) {
        if (error.message.includes('must be within Washington DC') ||
            error.message.includes('No walkable point found') ||
            error.message.includes('No street found within')) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400 }
          );
        }
      }
      throw error; // Re-throw other errors
    }

    if (!route || !route.waypoints || route.waypoints.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No route found' }),
        { status: 404 }
      );
    }
    const response = {
      waypoints: route.waypoints,
      safety_score: route.metrics.safety_score,
      normalized_safety_score: Math.round(route.metrics.safety_score),
      total_distance: route.metrics.distance,
      estimated_duration: Math.ceil(route.metrics.duration / 60),
      ...(includeDebug ? { debug: { centerline_geometry: route.geometry, original_points: route.waypoints, snapped_points: route.waypoints } } : {})
    };

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=0, s-maxage=60, stale-while-revalidate'
      }
    });

  } catch (error) {
    console.error('Mobile route API error:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('must be within Washington DC boundaries')) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400 }
        );
      }
      if (error.message.includes('No walkable point found')) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400 }
        );
      }
      if (error.message.includes('No street found within')) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400 }
        );
      }
      if (error.message.includes('graph connectivity')) {
        return new Response(
          JSON.stringify({ error: 'Route not possible - no connected streets found' }),
          { status: 404 }
        );
      }
    }

    // Generic error
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500 }
    );
  }
}