import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, SafeAreaView } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { useTheme } from '../context/ThemeContext';
import * as Location from 'expo-location';
import MultiRouteDisplay, { RouteSegment } from '../components/MultiRouteDisplay';
import RouteToggle, { RouteOption } from '../components/RouteToggle';
import { RouteDebugLayer } from '../components/RouteDebugLayer';
import { MobileRoutingAPI } from '../routing/services/MobileRoutingAPI';
import { SearchBar } from '../components/SearchBar';
import { SearchResults } from '../components/SearchResults';
import { GeocodingService, GeocodingResult } from '../services/GeocodingService';
import { LocationService, LocationState } from '../services/LocationService';
import { Fontisto } from '@expo/vector-icons';
// No need for top-level FoundationTest declaration

// Initialize MapLibre with debug logging
// Initialize MapLibre
MapLibreGL.setAccessToken(null); // No token needed for MapLibre

// Enable verbose logging
console.log('MapScreen: Initializing...');
console.error = (...args) => {
  console.log('ERROR:', ...args);
};

// import { RouteType } from '../types/routing';

// Temporary inline type definition
type RouteType = 
  | 'quickest'
  | 'safest'
  | 'detour5'
  | 'detour10'
  | 'detour15'
  | 'detour20'
  | 'detour25'
  | 'detour30';

type StreetSegment = RouteSegment;

export default function MapScreen() {
  const { isDarkMode } = useTheme();
  const [destinationQuery, setDestinationQuery] = useState('');
  const [startQuery, setStartQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [activeSearchBar, setActiveSearchBar] = useState<'start' | 'destination'>('destination');
  
  // Location state
  const [locationState, setLocationState] = useState<LocationState>({
    coordinates: null,
    isWithinBounds: false,
    permissionGranted: false,
    error: null
  });

  // Coordinate states (lat, lon)
  const [startCoords, setStartCoords] = useState<[number, number] | null>(null);
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);
  const [currentRoute, setCurrentRoute] = useState<RouteSegment[]>([]);
  const [selectedRouteOptions, setSelectedRouteOptions] = useState<RouteOption[]>([
    { id: 'quickest', label: 'Quickest Route', type: 'quickest', value: 0 }
  ]);
  const [routeDebugData, setRouteDebugData] = useState<{
    original_points?: { latitude: number; longitude: number; }[];
    snapped_points?: { latitude: number; longitude: number; }[];
    centerline_geometry?: { type: 'LineString'; coordinates: [number, number][]; };
  }>();
  const [destination, setDestination] = useState<[number, number] | undefined>(undefined);
  const [camera, setCamera] = useState({
    centerCoordinate: [-77.0369, 38.9072], // DC center
    zoomLevel: 12,
    animationDuration: 500,
  });

  const centerOnDC = () => {
    setCamera(prev => ({
      ...prev,
      centerCoordinate: [-77.0369, 38.9072], // DC center
      zoomLevel: 12,
    }));
  };

  // Initialize location on component mount
  useEffect(() => {
    const initializeLocation = async () => {
      console.log('📍 [MapScreen] Initializing location...');
      const state = await LocationService.requestLocation();
      console.log('📍 [MapScreen] Location state received:', state);
      setLocationState(state);
      
      // If we have location and it's within bounds, center map on user location
      if (state.coordinates && state.isWithinBounds) {
        console.log('📍 [MapScreen] Centering map on user location:', state.coordinates);
        setCamera(prev => ({
          ...prev,
          centerCoordinate: [state.coordinates!.longitude, state.coordinates!.latitude],
          zoomLevel: 14,
        }));
      } else {
        console.log('📍 [MapScreen] Not centering on user location. Within bounds:', state.isWithinBounds, 'Has coordinates:', !!state.coordinates);
      }

      // Start watching for location changes
      if (state.permissionGranted) {
        await LocationService.startWatching();
      }
    };

    initializeLocation();

    // Subscribe to location changes
    const unsubscribe = LocationService.subscribe((newState) => {
      console.log('📍 [MapScreen] Location state updated:', newState);
      setLocationState(newState);
    });

    return () => {
      unsubscribe();
      LocationService.stopWatching();
    };
  }, []);

  const planRoute = async (startCoords: [number, number], endCoords: [number, number]) => {
    try {
      console.log('🛣️ [MapScreen] Planning route:', { startCoords, endCoords });
      const [startLat, startLon] = startCoords;
      const [endLat, endLon] = endCoords;

      // Use selected routes or default to quickest if none selected
      const routesToPlan = selectedRouteOptions.length > 0 ? selectedRouteOptions : [{ type: 'quickest' as RouteType, id: 'quickest', label: 'Quickest Route', value: 0 }];
      
      const allRoutes: RouteSegment[] = [];

      // Plan each selected route
      for (const routeOption of routesToPlan) {
        try {
          const data = await MobileRoutingAPI.getSafeRoute({
            startLat,
            startLon,
            endLat,
            endLon,
            routeType: routeOption.type
          });

          // Update debug data if available (use first route's debug data)
          if (data.debug && allRoutes.length === 0) {
            setRouteDebugData(data.debug);
          }

          // Create route segment
          const route: RouteSegment = {
            coordinates: data.waypoints.map(p => [p.latitude, p.longitude]),
            routeType: routeOption.type,
            street_name: `${(data.total_distance / 1000).toFixed(1)}km • ${data.estimated_duration}min`
          };
          
          allRoutes.push(route);
        } catch (error) {
          console.error(`Failed to plan ${routeOption.type} route:`, error);
          // Continue with other routes even if one fails
        }
      }
      
      setCurrentRoute(allRoutes);
      setDestination(endCoords);

    } catch (error) {
      console.error('Route planning error:', error);
      
      // Handle specific error cases
      if (error instanceof Error) {
        if (error.message.includes('must be within Washington DC')) {
          Alert.alert(
            'Outside Service Area',
            'This location is outside Washington DC. Please select a destination within DC.'
          );
          return;
        }
        if (error.message.includes('No walkable point found')) {
          Alert.alert(
            'Not Walkable',
            'Could not find a walkable street near this location. Please try a different spot.'
          );
          return;
        }
      }
      
      // Generic error
      Alert.alert(
        'Route Error',
        'Could not plan route. Please try again or select a different destination.'
      );
    }
  };

  const handleMapPress = (event: any) => {
    const { coordinates } = event.geometry;
    if (startCoords) {
      planRoute(startCoords, [coordinates[1], coordinates[0]]);
    }
  };

  const [mapError, setMapError] = useState<string | null>(null);

  const onMapError = (error: any) => {
    console.log('MapScreen: Map error:', error);
    setMapError(error.message || 'An error occurred with the map');
  };


  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.searchBarContainer}>
        <View style={styles.searchBarsWrapper}>
          <SearchBar
            value={destinationQuery}
            placeholder="Enter destination"
            onFocus={() => setActiveSearchBar('destination')}
            onChangeText={async (text) => {
              setDestinationQuery(text);
              if (text.trim()) {
                const results = await GeocodingService.searchAddress(text);
                setSearchResults(results);
              } else {
                setSearchResults([]);
              }
            }}
            onSubmit={() => {
              // Keep keyboard open for better UX
            }}
            showMyLocation={locationState.isWithinBounds}
            onMyLocationPress={() => {
              if (locationState.coordinates) {
                const coords: [number, number] = [locationState.coordinates.latitude, locationState.coordinates.longitude];
                setStartCoords(coords);
                setStartQuery('My Location');
                if (destCoords) {
                  planRoute(coords, destCoords);
                }
              }
            }}
          />
          {destCoords && (
            <View style={styles.secondSearchBar}>
              <SearchBar
                value={startQuery}
                placeholder="Enter starting point"
                onFocus={() => setActiveSearchBar('start')}
                onChangeText={async (text) => {
                  setStartQuery(text);
                  if (text.trim()) {
                    const results = await GeocodingService.searchAddress(text);
                    setSearchResults(results);
                  } else {
                    setSearchResults([]);
                  }
                }}
                onSubmit={() => {
                  // Keep keyboard open for better UX
                }}
              />
            </View>
          )}
        </View>
        <SearchResults
          results={searchResults}
          onSelectResult={(result) => {
            if (activeSearchBar === 'destination') {
              setDestinationQuery(result.text);
              const end: [number, number] = [result.center[1], result.center[0]];
              setDestCoords(end);
              
              // If inside DC bounds, auto-use current location as start
              if (locationState.isWithinBounds && locationState.coordinates) {
                const start: [number, number] = [locationState.coordinates.latitude, locationState.coordinates.longitude];
                setStartCoords(start);
                setStartQuery('My Location');
                planRoute(start, end);
              } else if (startCoords) {
                planRoute(startCoords, end);
              }
            } else {
              setStartQuery(result.text);
              const start: [number, number] = [result.center[1], result.center[0]];
              setStartCoords(start);
              if (destCoords) {
                planRoute(start, destCoords);
              }
            }
            setSearchResults([]);
          }}
        />
      </View>
      {mapError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{mapError}</Text>
        </View>
      ) : (
        <MapLibreGL.MapView
          onPress={handleMapPress}
          surfaceView={true}
          style={styles.map}
          // @ts-ignore - mapStyle property exists but missing from types
          mapStyle={isDarkMode ?
            "https://api.maptiler.com/maps/019972ed-1f21-7bba-a29e-a08bd21d373d/style.json?key=RzC1OZEVAOHwuYsEqOjx" :
            "https://api.maptiler.com/maps/streets/style.json?key=RzC1OZEVAOHwuYsEqOjx"
          }
        >
          <MapLibreGL.Camera
            defaultSettings={camera}
            centerCoordinate={camera.centerCoordinate}
            zoomLevel={camera.zoomLevel}
            animationDuration={camera.animationDuration}
          />

        {/* Vector tile source for safety data */}
        <MapLibreGL.VectorSource
          id="safety-tiles"
                     tileUrlTemplates={["https://d3groh2thon6ux.cloudfront.net/dc/tiles/{z}/{x}/{y}.pbf"]}
          minZoomLevel={10}
          maxZoomLevel={15}
        >
          {/* Street safety layer */}
          <MapLibreGL.LineLayer
            id="street-safety"
            sourceLayerID="safety"
            style={{
              lineColor: [
                'interpolate',
                ['linear'],
                ['to-number', ['get', 'normalized_safety_score']],
                1, '#f10202',   // red
                15, '#f10202',  // red
                38, '#ffff00',  // yellow
                50, '#b5ea47',  // yellow-greenish
                100, '#0e9737'  // dark green
              ],
              lineWidth: [
                'interpolate',
                ['linear'],
                ['zoom'],
                10, 1.5,
                15, 6
              ],
              lineOpacity: 1.0
            }}
          />
        </MapLibreGL.VectorSource>

        {/* User location source and marker */}
        {locationState.coordinates && (
          <MapLibreGL.ShapeSource
            id="user-location"
            shape={{
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [locationState.coordinates.longitude, locationState.coordinates.latitude]
              },
              properties: {
                isWithinBounds: locationState.isWithinBounds
              }
            }}
          >
            <MapLibreGL.CircleLayer
              id="user-location-circle"
              style={{
                circleRadius: 8,
                circleColor: locationState.isWithinBounds ? '#007AFF' : '#FF3B30',
                circleStrokeWidth: 3,
                circleStrokeColor: '#FFFFFF',
                circleOpacity: 0.9
              }}
            />
            <MapLibreGL.SymbolLayer
              id="user-location-icon"
              style={{
                iconImage: locationState.isWithinBounds ? 'location' : 'location-outline',
                iconSize: 0.8,
                iconColor: '#FFFFFF',
                iconAllowOverlap: true,
                iconIgnorePlacement: true
              }}
            />
          </MapLibreGL.ShapeSource>
        )}

        {/* Start location marker */}
        {startCoords && (
          <MapLibreGL.PointAnnotation
            id="start"
            coordinate={[startCoords[1], startCoords[0]]}
          >
            <Fontisto name="map-marker-alt" size={32} color="#007AFF" />
          </MapLibreGL.PointAnnotation>
        )}

        {/* Destination marker */}
        {destination && (
          <MapLibreGL.PointAnnotation
            id="destination"
            coordinate={[destination[1], destination[0]]}
          >
            <Fontisto name="map-marker-alt" size={32} color="#8B5CF6" />
          </MapLibreGL.PointAnnotation>
        )}

        {/* Route display */}
        {currentRoute.length > 0 && (
          <>
            <MultiRouteDisplay routes={currentRoute} />
            {__DEV__ && (
              <RouteDebugLayer
                originalPoints={routeDebugData?.original_points}
                snappedPoints={routeDebugData?.snapped_points}
                routeGeometry={routeDebugData?.centerline_geometry}
              />
            )}
          </>
        )}
      </MapLibreGL.MapView>
      )}

      {/* Route Toggle Button */}
      <View style={[styles.controls, { top: 180 }]}>
        <RouteToggle onRoutesChange={setSelectedRouteOptions} initialRoutes={selectedRouteOptions} />
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  searchBarContainer: {
    position: 'absolute',
    top: 60, // Lower it below the status bar
    left: 16,
    right: 16,
    zIndex: 1,
  },
  searchBarsWrapper: {
    gap: 8,
  },
  secondSearchBar: {
    marginTop: 8,
  },
  map: {
    flex: 1,
  },
  controls: {
    position: 'absolute',
    top: 50,
    right: 20,
  },
  testButton: {
    marginTop: 10,
  },
  button: {
    backgroundColor: 'white',
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonText: {
    fontSize: 20,
  },
  userLocationMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    borderWidth: 4,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  destinationMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    borderWidth: 4,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 16,
    textAlign: 'center',
  },
});