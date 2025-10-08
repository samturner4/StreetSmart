/**
 * Geometry Types for Route Generation
 */

export interface Point {
  latitude: number;
  longitude: number;
}

export interface LineString {
  type: 'LineString';
  coordinates: [number, number][]; // [longitude, latitude] pairs (GeoJSON format)
}

export interface RouteGeometry {
  type: 'Feature';
  geometry: LineString;
  properties: {
    length_meters: number;
    safety_score: number;
    street_name?: string;
  };
}

export interface DetailedRouteSegment {
  geometry: LineString;
  safety_score: number;
  length_meters: number;
  street_name?: string;
  start_intersection?: string;
  end_intersection?: string;
}

export interface DetailedRoute {
  segments: DetailedRouteSegment[];
  total_distance: number;
  total_safety_score: number;
  normalized_safety_score: number;
  estimated_duration: number; // minutes
}


