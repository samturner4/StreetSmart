import React from 'react';
import { View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { RouteType } from '../types/routing';

export interface RouteSegment {
  coordinates: [number, number][];
  routeType: RouteType;
  street_name?: string;
}

interface MultiRouteDisplayProps {
  routes: RouteSegment[];
}

// Blue color palette from lightest to darkest
const ROUTE_COLORS: Record<RouteType, string> = {
  quickest: '#E3F2FD',    // Lightest blue
  detour5: '#BBDEFB',
  detour10: '#90CAF9',
  detour15: '#64B5F6',
  detour20: '#42A5F5',
  detour25: '#2196F3',
  detour30: '#1E88E5',
  balanced: '#1976D2',
  safest: '#1565C0'       // Darkest blue
};

export default function MultiRouteDisplay({ routes }: MultiRouteDisplayProps) {
  if (!routes || routes.length === 0) return null;

  return (
    <>
      {routes.map((route, index) => (
        <MapLibreGL.ShapeSource
          key={`route-${index}`}
          id={`route-source-${index}`}
          shape={{
            type: 'Feature',
            properties: {
              routeType: route.routeType
            },
            geometry: {
              type: 'LineString',
              coordinates: route.coordinates.map(coord => [coord[1], coord[0]]) // Convert to [lng, lat]
            }
          }}
        >
          <MapLibreGL.LineLayer
            id={`route-layer-${index}`}
            style={{
              lineColor: ROUTE_COLORS[route.routeType] || '#1976D2', // Default to medium blue if type not found
              lineWidth: 4,
              lineOpacity: 0.8
            }}
          />
        </MapLibreGL.ShapeSource>
      ))}
    </>
  );
}
