import React from 'react';
import MapLibreGL from '@maplibre/maplibre-react-native';

interface RouteDebugLayerProps {
  originalPoints?: {
    latitude: number;
    longitude: number;
  }[];
  snappedPoints?: {
    latitude: number;
    longitude: number;
  }[];
  routeGeometry?: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

export const RouteDebugLayer: React.FC<RouteDebugLayerProps> = ({
  originalPoints,
  snappedPoints,
  routeGeometry
}) => {
  return (
    <>
      {/* Original (unsnapped) points - DISABLED to remove waypoint icons */}
      {/* {originalPoints && originalPoints.length > 0 && (
        <MapLibreGL.ShapeSource
          id="debug-original-points"
          shape={{
            type: 'FeatureCollection',
            features: originalPoints.map((point, index) => ({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [point.longitude, point.latitude]
              },
              properties: {
                id: `original-${index}`
              }
            }))
          }}
        >
          <MapLibreGL.CircleLayer
            id="debug-original-points-layer"
            style={{
              circleRadius: 6,
              circleColor: '#FF3B30',
              circleStrokeWidth: 2,
              circleStrokeColor: '#FFFFFF'
            }}
          />
        </MapLibreGL.ShapeSource>
      )} */}

      {/* Snapped points - DISABLED to remove waypoint icons */}
      {/* {snappedPoints && snappedPoints.length > 0 && (
        <MapLibreGL.ShapeSource
          id="debug-snapped-points"
          shape={{
            type: 'FeatureCollection',
            features: snappedPoints.map((point, index) => ({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [point.longitude, point.latitude]
              },
              properties: {
                id: `snapped-${index}`
              }
            }))
          }}
        >
          <MapLibreGL.CircleLayer
            id="debug-snapped-points-layer"
            style={{
              circleRadius: 6,
              circleColor: '#34C759',
              circleStrokeWidth: 2,
              circleStrokeColor: '#FFFFFF'
            }}
          />
        </MapLibreGL.ShapeSource>
      )} */}

      {/* Snapping lines (connecting original to snapped) */}
      {originalPoints && snappedPoints && 
       originalPoints.length === snappedPoints.length && (
        <MapLibreGL.ShapeSource
          id="debug-snap-lines"
          shape={{
            type: 'FeatureCollection',
            features: originalPoints.map((orig, index) => ({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [orig.longitude, orig.latitude],
                  [snappedPoints[index].longitude, snappedPoints[index].latitude]
                ]
              },
              properties: {
                id: `snap-line-${index}`
              }
            }))
          }}
        >
          <MapLibreGL.LineLayer
            id="debug-snap-lines-layer"
            style={{
              lineWidth: 1,
              lineColor: '#8E8E93',
              lineDasharray: [2, 2]
            }}
          />
        </MapLibreGL.ShapeSource>
      )}

      {/* Route geometry */}
      {routeGeometry && (
        <MapLibreGL.ShapeSource
          id="debug-route-geometry"
          shape={{
            type: 'Feature',
            geometry: routeGeometry,
            properties: {}
          }}
        >
          <MapLibreGL.LineLayer
            id="debug-route-geometry-layer"
            style={{
              lineWidth: 4,
              lineColor: '#007AFF',
              lineOpacity: 0.7
            }}
          />
        </MapLibreGL.ShapeSource>
      )}
    </>
  );
};

