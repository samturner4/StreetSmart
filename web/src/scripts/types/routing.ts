export type RouteType = 
  | 'quickest'    // Fastest route
  | 'balanced'    // 50-50 safety-distance
  | 'safest'      // 70-30 safety-distance
  | 'detour5'     // 5% max detour
  | 'detour10'    // 10% max detour
  | 'detour15'    // 15% max detour
  | 'detour20'    // 20% max detour
  | 'detour25'    // 25% max detour
  | 'detour30';   // 30% max detour

export interface RouteOptions {
  routeType?: RouteType;
  includeDebug?: boolean;
}

export interface RouteMetrics {
  distance: number;          // Total distance in meters
  duration: number;          // Estimated duration in seconds
  safety_score: number;      // Average safety score (1-100)
  distance_increase: number; // Percentage increase from quickest route
}

export interface RouteResult {
  waypoints: Array<{
    latitude: number;
    longitude: number;
  }>;
  metrics: RouteMetrics;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}
