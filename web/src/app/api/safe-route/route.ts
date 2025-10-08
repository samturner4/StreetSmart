import { NextResponse } from 'next/server';
import { findRoute, loadRoutingGraph } from '@/scripts/routing';
import fs from 'fs';
import path from 'path';

let routingGraph: any = null;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city') || 'DC';
  const startLat = parseFloat(searchParams.get('startLat') || '');
  const startLon = parseFloat(searchParams.get('startLon') || '');
  const endLat = parseFloat(searchParams.get('endLat') || '');
  const endLon = parseFloat(searchParams.get('endLon') || '');
  const forceReload = searchParams.get('forceReload') === 'true';

  console.log('Safe route API received coordinates:', { startLat, startLon, endLat, endLon });

  if (!startLat || !startLon || !endLat || !endLon) {
    console.error('Missing or invalid coordinates:', { startLat, startLon, endLat, endLon });
    return NextResponse.json({ error: 'Missing required coordinates' }, { status: 400 });
  }

  // Validate coordinate ranges
  if (isNaN(startLat) || isNaN(startLon) || isNaN(endLat) || isNaN(endLon)) {
    console.error('Coordinates are NaN:', { startLat, startLon, endLat, endLon });
    return NextResponse.json({ error: 'Invalid coordinate format' }, { status: 400 });
  }

  // Check if coordinates are in walkable areas
  const { isPointWalkable } = await import('@/scripts/process-osm-walkability');
  const baseDir = fs.existsSync(path.join(process.cwd(), 'data', city))
    ? path.join(process.cwd(), 'data', city)
    : path.join(process.cwd(), 'src', 'data', city);

  const walkableAreasPath = path.join(baseDir, 'osm-walkability', 'walkable-areas.json');
  const walkableAreasArray = JSON.parse(fs.readFileSync(walkableAreasPath, 'utf-8'));
  const walkableAreas = new Map<string, boolean>();
  walkableAreasArray.forEach((key: string) => walkableAreas.set(key, true));

  const startWalkable = isPointWalkable(startLat, startLon, walkableAreas);
  const endWalkable = isPointWalkable(endLat, endLon, walkableAreas);

  if (!startWalkable || !endWalkable) {
    console.log('Coordinates in non-walkable areas:', { startWalkable, endWalkable, startLat, startLon, endLat, endLon });
    return NextResponse.json(
      { error: 'One or both addresses are in non-walkable areas (parks, cemeteries, etc.). Please try addresses on actual streets.' },
      { status: 400 }
    );
  }

  try {
    // First get the standard walking route from Mapbox, following street centerlines
    const standardRouteResponse = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/walking/${startLon},${startLat};${endLon},${endLat}?` +
      `geometries=geojson&` +
      `overview=full&` + // Request full, detailed geometry
      `walkway_bias=0&` + // Bias towards street centerlines instead of walkways
      `exclude=ferry&` + // Exclude ferry routes
      `access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
    );

    if (!standardRouteResponse.ok) {
      throw new Error(`Mapbox API request failed with status ${standardRouteResponse.status}`);
    }

    const standardRoute = await standardRouteResponse.json();

    // Now calculate our safe route waypoints
    // Force reload routing graph in development or when requested
    if (!routingGraph || forceReload || process.env.NODE_ENV === 'development') {
      routingGraph = loadRoutingGraph();
    }

    let safeRoute;
    try {
      // Use internal routing logic that loads the graph internally
      safeRoute = await findRoute(startLat, startLon, endLat, endLon, { routeType: 'safest' });
    } catch (error: any) {
      console.error('Error in findSafestRoute:', error.message);
      
      // Provide more helpful error messages
      if (error.message.includes('No safe route found')) {
        return NextResponse.json(
          { error: 'Unable to find a walkable route. One or both addresses may be in a park, cemetery, or other non-walkable area. Please try different addresses or locations on actual streets.' },
          { status: 400 }
        );
      } else if (error.message.includes('No street found within')) {
        return NextResponse.json(
          { error: 'One or both addresses are too far from walkable streets. Please try addresses that are on actual streets, not in parks or other areas.' },
          { status: 400 }
        );
      } else {
        return NextResponse.json(
          { error: `Routing error: ${error.message}` },
          { status: 400 }
        );
      }
    }

    // Use key waypoints from the safest path (simplified approach)
    let waypoints = safeRoute.waypoints.map((wp: { longitude: number; latitude: number }) => `${wp.longitude},${wp.latitude}`);

    // Always include the exact start and end coordinates
    if (waypoints[0] !== `${startLon},${startLat}`) {
      waypoints = [`${startLon},${startLat}`, ...waypoints];
    }
    if (waypoints[waypoints.length - 1] !== `${endLon},${endLat}`) {
      waypoints = [...waypoints, `${endLon},${endLat}`];
    }

    // Mapbox Directions API limit: 25 waypoints for walking
    const MAX_WAYPOINTS = 25;
    let finalWaypoints = waypoints;
    if (finalWaypoints.length > MAX_WAYPOINTS) {
      const step = (finalWaypoints.length - 1) / (MAX_WAYPOINTS - 1);
      finalWaypoints = Array.from({ length: MAX_WAYPOINTS }, (_, i) =>
        finalWaypoints[Math.round(i * step)]
      );
    }
    const waypointCoords = finalWaypoints.join(';');

    // Get optimized walking route through our snapped waypoints from Mapbox, following street centerlines
    const safeRouteResponse = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/walking/${waypointCoords}?` +
      `geometries=geojson&` +
      `overview=full&` + // Request full, detailed geometry
      `walkway_bias=0&` + // Bias towards street centerlines instead of walkways
      `exclude=ferry&` + // Exclude ferry routes
      `access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
    );

    if (!safeRouteResponse.ok) {
      throw new Error(`Mapbox API request failed with status ${safeRouteResponse.status}`);
    }

    const safeRouteData = await safeRouteResponse.json();

    // Calculate improvement metrics
    const standardDistance = standardRoute.routes[0].distance;
    const safeDistance = safeRouteData.routes[0].distance;
    const distanceIncrease = ((safeDistance - standardDistance) / standardDistance) * 100;

    return NextResponse.json({
      mapboxRoute: standardRoute.routes[0],
      safeRoute: safeRouteData.routes[0],
      metrics: {
        safety_score: safeRoute.metrics?.safety_score ?? null,
        normalized_safety_score: safeRoute.metrics ? Math.round(safeRoute.metrics.safety_score) : null,
        distance_increase_percent: Math.round(distanceIncrease * 10) / 10
      }
    });

  } catch (error: any) {
    console.error('Error calculating route:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to calculate route' },
      { status: 500 }
    );
  }
} 