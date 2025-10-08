import React from 'react';
import { View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';

export interface RouteSegment {
  coordinates: [number, number][];
  safety_score: number;
  street_name?: string;
}

interface RouteDisplayProps {
  route: RouteSegment[];
}

export default function RouteDisplay({ route }: RouteDisplayProps) {
  if (!route || route.length === 0) return null;

  return (
    <>
      {route.map((segment, index) => (
        <MapLibreGL.ShapeSource
          key={`route-${index}`}
          id={`route-source-${index}`}
          shape={{
            type: 'Feature',
            properties: {
              safety_score: segment.safety_score
            },
            geometry: {
              type: 'LineString',
              coordinates: segment.coordinates.map(coord => [coord[1], coord[0]]) // Convert to [lng, lat]
            }
          }}
        >
          <MapLibreGL.LineLayer
            id={`route-layer-${index}`}
            style={{
              lineColor: '#4285F4',
              lineWidth: 4,
              lineOpacity: 0.8
            }}
          />
        </MapLibreGL.ShapeSource>
      ))}
    </>
  );
}