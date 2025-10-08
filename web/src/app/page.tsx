'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
// @ts-ignore - Mapbox Directions doesn't have complete TypeScript support
import MapboxDirections from '@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions';
import '@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import UserMenu from '@/components/auth/UserMenu';

// Initialize Mapbox token
if (typeof window !== 'undefined' && !mapboxgl.accessToken) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (token) {
    mapboxgl.accessToken = token;
  }
}

// DC bounding box for initial map bounds
const DC_INITIAL_BOUNDS = {
  north: 38.995,
  south: 38.791,
  east: -76.909,
  west: -77.119
};

type ViewType = 'heatmap' | 'street';
type TimeFilter = 'overall' | 'day' | 'night';

// Safety score colors
const SAFETY_COLORS = {
  1: '#ff0000', // red - least safe
  2: '#ff9900', // orange
  3: '#ffff00', // yellow
  4: '#00ff00', // green
  5: '#006400'  // dark green - most safe
};

interface RouteInfoType {
  standardRoute: {
    distance: number;
    duration: string;
  };
  safeRoute: {
    distance: number;
    duration: string;
    safety_score: number;
    distance_increase: number;
  };
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Active view state
  const [activeView, setActiveView] = useState<ViewType>('heatmap');
  const [activeTimeFilter, setActiveTimeFilter] = useState<TimeFilter>('overall');
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const directionsRef = useRef<any>(null);

  // Search functionality state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // Starting point search functionality state
  const [startingPointQuery, setStartingPointQuery] = useState('');
  const [startingPointResults, setStartingPointResults] = useState<any[]>([]);
  const [showStartingPointDropdown, setShowStartingPointDropdown] = useState(false);
  const [startingPointLoading, setStartingPointLoading] = useState(false);

  // Selected locations state
  const [selectedDestination, setSelectedDestination] = useState<any>(null);
  const [selectedStartingPoint, setSelectedStartingPoint] = useState<any>(null);
  
  // Error states
  const [searchError, setSearchError] = useState<string>('');
  const [startingPointError, setStartingPointError] = useState<string>('');
  
  // Map markers
  const destinationMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const startingPointMarkerRef = useRef<mapboxgl.Marker | null>(null);
  
  // Timeout refs for debouncing
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startingPointSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Route information
  const [routeInfo, setRouteInfo] = useState<RouteInfoType | null>(null);
  const [routeError, setRouteError] = useState<string>('');
  const [fastestRoutePopup, setFastestRoutePopup] = useState<{
    safetyScore: number;
    distance: number;
    duration: string;
    position: { x: number; y: number };
    routeEndCoordinate?: [number, number];
  } | null>(null);
  
  // Recent searches
  const [recentSearches, setRecentSearches] = useState<any[]>([]);
  const [showRecentForDestination, setShowRecentForDestination] = useState(false);
  const [showRecentForStarting, setShowRecentForStarting] = useState(false);

  const initializeDirections = () => {
    if (!map.current || directionsRef.current) return;

    // Initialize Mapbox Directions control
    const directions = new MapboxDirections({
      accessToken: mapboxgl.accessToken,
      unit: 'imperial',
      profile: 'mapbox/walking', // Start with walking routes for safety
      controls: {
        inputs: true,
        instructions: false, // Hide instructions
        profileSwitcher: false
      }
    });

    directionsRef.current = directions;
    map.current.addControl(directions, 'top-left');

    // Listen for route calculations
    directions.on('route', (e: any) => {
      console.log('Route calculated:', e.route);
      setRouteError('');
      
      if (e.route && e.route[0]) {
        const route = e.route[0];
        const duration = Math.round(route.duration / 60); // Convert to minutes
        const distance = (route.distance * 0.000621371).toFixed(1); // Convert meters to miles
        
        setRouteInfo({
          standardRoute: {
            distance: route.distance,
            duration: formatDuration(route.duration)
          },
          safeRoute: {
            distance: route.distance,
            duration: formatDuration(route.duration),
            safety_score: 3, // Default neutral score for standard route
            distance_increase: 0
          }
        });
      }
    });

    directions.on('clear', () => {
      console.log('Route cleared');
      setRouteInfo(null);
      setRouteError('');
      setFastestRoutePopup(null);
    });

    // Listen for routing errors
    directions.on('error', (e: any) => {
      console.error('Routing error:', e);
      setRouteInfo(null);
      
      // Handle different types of routing errors
      if (e.error && e.error.message) {
        const message = e.error.message.toLowerCase();
        if (message.includes('no route found') || message.includes('no segment')) {
          setRouteError('No walking route found between these locations. Try selecting locations closer together or within the Washington DC area.');
        } else if (message.includes('coordinate') || message.includes('outside')) {
          setRouteError('One or both locations are outside the supported area. Please select locations within Washington DC.');
        } else {
          setRouteError('Unable to calculate route. Please try different locations or check your internet connection.');
        }
      } else {
        setRouteError('Route calculation failed. Please try again with different locations.');
      }
    });
  };

  const initializeStreetLayers = async () => {
    if (!map.current) return;

    try {
      // Load all data at once
      const filters: TimeFilter[] = ['overall', 'day', 'night'];
      
      // Remove streetlamp data loading and layer initialization

      for (const timeFilter of filters) {
        const response = await fetch(`/api/street-safety?time=${timeFilter}`);
        if (!response.ok) {
          throw new Error(`Failed to load ${timeFilter} data`);
        }
        const streetData = await response.json();

        const sourceId = `street-safety-${timeFilter}`;
        const layerId = `street-safety-${timeFilter}`;

        // Add source
        map.current.addSource(sourceId, {
          type: 'geojson',
          data: streetData,
          generateId: true
        });

        // Add layer (hidden by default)
        map.current.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: {
            visibility: 'none',
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': [
              'interpolate',
              ['linear'],
              ['get', `${timeFilter === 'overall' ? 'normalized_safety_score' : 'normalized_' + timeFilter + '_safety_score'}`],
              // Lower quartile:
              1, '#f10202',   //  red
              15, '#f10202',   //  red
              38,  '#ffff00',   // yellow

              //just about average
              50, '#b5ea47',   // yellow-greenish

              //upper quartile:
              100, '#0e9737'    // dark green
            ],
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 2,
              15, 8
            ],
            'line-opacity': 0.8
          },
          minzoom: 10
        });

        // Add hover effect and popup
        map.current.on('mouseenter', layerId, (e) => {
          if (map.current) {
            map.current.getCanvas().style.cursor = 'pointer';
            
            if (e.features && e.features[0]) {
              const feature = e.features[0];
              const props = feature.properties;
              
              // Create popup content
              const content = `
                <div style="font-family: system-ui; padding: 8px;">
                  <div>Safety Score: ${props?.normalized_safety_score || 'N/A'}/100</div>
                  <div>Direct Crimes: ${props?.crime_count || 0}</div>
                  <div>Influenced by: ${props?.proximity_influences || 0} crimes</div>
                </div>
              `;
              
              // Remove existing popup if any
              if (popupRef.current) {
                popupRef.current.remove();
                popupRef.current = null;
              }
              
              // Create and set new popup
              const newPopup = new mapboxgl.Popup({
                closeButton: false,
                closeOnClick: false,
                closeOnMove: false // Changed to false to prevent auto-close on mouse move
              })
                .setLngLat(e.lngLat)
                .setHTML(content)
                .addTo(map.current);
              
              popupRef.current = newPopup;
            }
          }
        });

        map.current.on('mouseleave', layerId, () => {
          if (map.current) {
            map.current.getCanvas().style.cursor = '';
            // Always remove popup on mouseleave
            if (popupRef.current) {
              popupRef.current.remove();
              popupRef.current = null;
            }
          }
        });

        // Move below labels
        const labelLayers = map.current.getStyle().layers.filter(layer => 
          layer.type === 'symbol' && 
          (layer.id.includes('label') || layer.id.includes('text'))
        );
        if (labelLayers.length > 0) {
          map.current.moveLayer(layerId, labelLayers[0].id);
        }
      }
    } catch (err: any) {
      console.error('Error initializing street layers:', err);
      setError(`Failed to initialize street layers: ${err.message}`);
    }
  };

  const loadStreetSafetyData = async (timeFilter: TimeFilter) => {
    if (!map.current) return;

    try {
      // Hide all layers first
      ['overall', 'day', 'night'].forEach(filter => {
        const layerId = `street-safety-${filter}`;
        if (map.current!.getLayer(layerId)) {
          map.current!.setLayoutProperty(layerId, 'visibility', 'none');
        }
      });

      // Show the selected layer
      const layerId = `street-safety-${timeFilter}`;
      if (map.current.getLayer(layerId)) {
        map.current.setLayoutProperty(layerId, 'visibility', 'visible');
      }
    } catch (err: any) {
      console.error(`Error switching to ${timeFilter} view:`, err);
      setError(`Failed to switch to ${timeFilter} view: ${err.message}`);
    }
  };

  const handleTimeFilterChange = async (timeFilter: TimeFilter) => {
    if (timeFilter === activeTimeFilter) return;
    
    console.log(`Changing time filter from ${activeTimeFilter} to ${timeFilter}`);
    setActiveTimeFilter(timeFilter);
    
    if (activeView === 'street') {
      await loadStreetSafetyData(timeFilter);
    }
  };

  const toggleHeatmapLayer = (visible: boolean) => {
    if (map.current && map.current.getLayer('crime-heatmap')) {
      map.current.setLayoutProperty(
        'crime-heatmap',
        'visibility',
        visible ? 'visible' : 'none'
      );
    }
  };

  const toggleStreetLayer = (visible: boolean) => {
    console.log('Toggling street layer visibility:', visible);
    if (map.current) {
      // Check for any street safety layer
      const layerIds = [`street-safety-${activeTimeFilter}`, 'street-safety'];
      let found = false;
      
      for (const layerId of layerIds) {
        if (map.current.getLayer(layerId)) {
          console.log(`Found street layer ${layerId}, setting visibility to:`, visible ? 'visible' : 'none');
          map.current.setLayoutProperty(
            layerId,
            'visibility',
            visible ? 'visible' : 'none'
          );
          found = true;
          break;
        }
      }
      
      if (!found) {
        console.log('No street layer found');
      }
    } else {
      console.log('Map not initialized');
    }
  };

  const handleViewChange = async (view: ViewType) => {
    if (view === activeView) return;
    
    console.log(`Changing view from ${activeView} to ${view}`);
    
    // Hide all layers first
    toggleHeatmapLayer(false);
    toggleStreetLayer(false);
    
    // Show the selected layer
    switch (view) {
      case 'heatmap':
        toggleHeatmapLayer(true);
        break;
      case 'street':
        toggleStreetLayer(true);
        break;
    }
    
    setActiveView(view);
};

  // Add useEffect for token initialization
  useEffect(() => {
    // Ensure we're in the browser and token is available
    if (typeof window !== 'undefined') {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      console.log("Attempting to initialize Mapbox with token:", token ? token.substring(0, 10) + '...' : 'Token not found');
    if (!token) {
        setError('Missing Mapbox access token. Please add NEXT_PUBLIC_MAPBOX_TOKEN to your .env.local file.');
      return;
    }
      mapboxgl.accessToken = token;
    }
  }, []); // Empty dependency array - only run once

  useEffect(() => {
    if (!mapContainer.current || map.current || !mapboxgl.accessToken) return;

    console.log('Initializing map with token:', mapboxgl.accessToken.slice(0, 5) + '...');

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [-77.0369, 38.9072], // DC center
        zoom: 12
      });

      map.current.on('load', async () => {
        console.log('Map loaded');
        setMapLoaded(true);
        setError(null);

        try {
          await initializeStreetLayers();
          initializeDirections();
          
          // Fetch crime data
          const response = await fetch('/api/crime-data');
          const crimeData = await response.json();

          if (!map.current) return;

          // Add heatmap data source
          map.current.addSource('crime-data', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: crimeData.map((point: any) => ({
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [point.lon, point.lat]
                },
                properties: {
                  weight: point.weight
                }
              }))
            }
          });

          // Add heatmap layer
          map.current.addLayer({
            id: 'crime-heatmap',
            type: 'heatmap',
            source: 'crime-data',
            paint: {
              'heatmap-weight': ['get', 'weight'],
              'heatmap-intensity': 0.6,
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0, 'rgba(0, 0, 255, 0)',
                0.2, 'royalblue',
                0.4, 'cyan',
                0.6, 'lime',
                0.8, 'yellow',
                1, 'red'
              ],
              'heatmap-radius': 30,
              'heatmap-opacity': 0.8
            }
          });
        } catch (err) {
          console.error('Error initializing map layers:', err);
          setError('Failed to initialize map layers');
        }
      });

      map.current.on('error', (e) => {
        console.error('Mapbox error:', e);
        setError('Map error: ' + e.error.message);
      });

      // Update popup position when map moves
      map.current.on('move', () => {
        if (fastestRoutePopup?.routeEndCoordinate && map.current) {
          const point = map.current.project(fastestRoutePopup.routeEndCoordinate);
          setFastestRoutePopup(prev => prev ? {
            ...prev,
            position: { x: point.x + 10, y: point.y - 10 }
          } : null);
        }
      });

    } catch (err) {
      console.error('Error creating map:', err);
      setError('Failed to create map');
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [mapboxgl.accessToken]); // Add accessToken as dependency

  // Helper function to format location display name
  const formatLocationName = (feature: any) => {
    if (!feature.place_name) return '';

    // For intersections and streets, keep the full place name
    if (feature.place_type?.includes('intersection') || 
        feature.place_type?.includes('address')) {
      return feature.place_name;
    }

    // For other types, format as before
    const placeName = feature.text || feature.place_name?.split(',')[0] || '';
    const context = feature.context || [];
    
    const neighborhood = context.find((c: any) => c.id.includes('neighborhood'))?.text;
    const city = context.find((c: any) => c.id.includes('place'))?.text;
    
    if (neighborhood && city) {
      return `${placeName}, ${neighborhood}, ${city}`;
    } else if (city) {
      return `${placeName}, ${city}`;
    } else {
      return placeName;
    }
  };

  // Update searchAddresses function
  const searchAddresses = async (query: string) => {
    if (query.length < 3) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      setSearchError('');
      return;
    }

    setSearchLoading(true);
    setSearchError('');
    try {
      // Use relative URL to proxy through Next.js API
      const response = await fetch(
        `/api/geocode?` +
        `query=${encodeURIComponent(query)}&` +
        `limit=5`
      );

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        setSearchResults(data.features);
        setShowSearchDropdown(true);
        setSearchError('');
      } else {
        setSearchResults([]);
        setShowSearchDropdown(true);
        setSearchError('No results found');
      }
    } catch (error) {
      console.error('Destination geocoding error:', error);
      setSearchResults([]);
      setShowSearchDropdown(true); // Show dropdown to display the error
      setSearchError('Search failed. Please try again.');
    }
    setSearchLoading(false);
  };

  const handleSearchSelect = (feature: any) => {
    const [lng, lat] = feature.center;
    
    // Clear search
    setSearchQuery(formatLocationName(feature));
    setShowSearchDropdown(false);
    setSearchResults([]);
    setSearchError('');
    
    // Store selected destination and save to recent searches
    setSelectedDestination(feature);
    saveToRecentSearches(feature);

    // Remove existing destination marker
    if (destinationMarkerRef.current) {
      destinationMarkerRef.current.remove();
      destinationMarkerRef.current = null;
    }

    // Add new destination marker
    if (map.current) {
      const marker = new mapboxgl.Marker({ color: '#ef4444' }) // red marker for destination
        .setLngLat([lng, lat])
        .addTo(map.current);
      destinationMarkerRef.current = marker;
    }

    // Always center the map on the location
    map.current?.flyTo({
      center: [lng, lat],
      zoom: 16,
      duration: 1000
    });
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Debounce search
    if (value.length >= 3) {
      setShowRecentForDestination(false);
      searchTimeoutRef.current = setTimeout(() => {
        searchAddresses(value);
      }, 300);
    } else {
      setSearchResults([]);
      setShowSearchDropdown(false);
      setSearchError('');
      // Show recent searches when input is empty and field is focused
      if (value.length === 0 && recentSearches.length > 0) {
        setShowRecentForDestination(true);
      } else {
        setShowRecentForDestination(false);
      }
    }
  };

  // Update searchStartingPointAddresses to use the same approach
  const searchStartingPointAddresses = async (query: string) => {
    if (query.length < 3) {
      setStartingPointResults([]);
      setShowStartingPointDropdown(false);
      setStartingPointError('');
      return;
    }

    setStartingPointLoading(true);
    setStartingPointError('');
    try {
      // Use relative URL to proxy through Next.js API
      const response = await fetch(
        `/api/geocode?` +
        `query=${encodeURIComponent(query)}&` +
        `limit=5`
      );

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        setStartingPointResults(data.features);
        setShowStartingPointDropdown(true);
        setStartingPointError('');
      } else {
        setStartingPointResults([]);
        setShowStartingPointDropdown(true);
        setStartingPointError('No results found');
      }
    } catch (error) {
      console.error('Starting point geocoding error:', error);
      setStartingPointResults([]);
      setShowStartingPointDropdown(true); // Show dropdown to display the error
      setStartingPointError('Search failed. Please try again.');
    }
    setStartingPointLoading(false);
  };

  const handleStartingPointSelect = (feature: any) => {
    const [lng, lat] = feature.center;
    
    // Clear search
    setStartingPointQuery(formatLocationName(feature));
    setShowStartingPointDropdown(false);
    setStartingPointResults([]);
    setStartingPointError('');
    
    // Store selected starting point and save to recent searches
    setSelectedStartingPoint(feature);
    saveToRecentSearches(feature);

    // Remove existing starting point marker
    if (startingPointMarkerRef.current) {
      startingPointMarkerRef.current.remove();
      startingPointMarkerRef.current = null;
    }

    // Add new starting point marker
    if (map.current) {
      const marker = new mapboxgl.Marker({ color: '#22c55e' }) // green marker for starting point
        .setLngLat([lng, lat])
        .addTo(map.current);
      startingPointMarkerRef.current = marker;
    }

    // Always center the map on the location
    map.current?.flyTo({
      center: [lng, lat],
      zoom: 16,
      duration: 1000
    });
  };

  const handleStartingPointInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setStartingPointQuery(value);
    
    // Clear any existing timeout
    if (startingPointSearchTimeoutRef.current) {
      clearTimeout(startingPointSearchTimeoutRef.current);
    }
    
    // Debounce search
    if (value.length >= 3) {
      setShowRecentForStarting(false);
      startingPointSearchTimeoutRef.current = setTimeout(() => {
        searchStartingPointAddresses(value);
      }, 300);
    } else {
      setStartingPointResults([]);
      setShowStartingPointDropdown(false);
      setStartingPointError('');
      // Show recent searches when input is empty and field is focused
      if (value.length === 0 && recentSearches.length > 0) {
        setShowRecentForStarting(true);
      } else {
        setShowRecentForStarting(false);
      }
    }
  };

  // Function to handle finding route between selected points
  const handleFindRoute = async () => {
    if (!selectedStartingPoint || !selectedDestination || !map.current) return;

    setRouteError('');
    setRouteInfo(null);

    try {
      const [startLon, startLat] = selectedStartingPoint.center;
      const [endLon, endLat] = selectedDestination.center;

      // Validate coordinates are numbers
      if (typeof startLat !== 'number' || typeof startLon !== 'number' || 
          typeof endLat !== 'number' || typeof endLon !== 'number') {
        console.error('Invalid coordinates:', { startLat, startLon, endLat, endLon });
        setRouteError('Invalid coordinates received from geocoding');
        return;
      }

      // Ensure coordinates are within reasonable bounds
      if (startLat < 38.7 || startLat > 39.0 || startLon < -77.2 || startLon > -76.8 ||
          endLat < 38.7 || endLat > 39.0 || endLon < -77.2 || endLon > -76.8) {
        console.error('Coordinates out of DC bounds:', { startLat, startLon, endLat, endLon });
        setRouteError('Coordinates are outside Washington DC area');
        return;
      }

      console.log('Routing coordinates:', { startLat, startLon, endLat, endLon });

      const response = await fetch(
        `/api/safe-route?` +
        `startLat=${startLat}&` +
        `startLon=${startLon}&` +
        `endLat=${endLat}&` +
        `endLon=${endLon}`
      );

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        setRouteError(data.error);
        return;
      }

      // Show standard route in blue
      if (data.mapboxRoute) {
        const coordinates = data.mapboxRoute.geometry.coordinates;
        
        if (map.current.getSource('standard-route')) {
          (map.current.getSource('standard-route') as mapboxgl.GeoJSONSource).setData({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates
            }
          });
        } else {
          map.current.addSource('standard-route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates
              }
            }
          });

          map.current.addLayer({
            id: 'standard-route',
            type: 'line',
            source: 'standard-route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': '#3b82f6',
              'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10, 2,
                15, 8
              ],
              'line-opacity': 1
            }
          });
        }
      }

      // Show safe route in green
      if (data.safeRoute) {
        const coordinates = data.safeRoute.geometry.coordinates;
        
        if (map.current.getSource('safe-route')) {
          (map.current.getSource('safe-route') as mapboxgl.GeoJSONSource).setData({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates
            }
          });
        } else {
          map.current.addSource('safe-route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates
              }
            }
          });

          map.current.addLayer({
            id: 'safe-route',
            type: 'line',
            source: 'safe-route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': '#22c55e',
              'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10, 2,
                15, 8
              ],
              'line-opacity': 1
            }
          });
        }
      }

      // Update route info
      setRouteInfo({
        standardRoute: {
          distance: data.mapboxRoute.distance,
          duration: formatDuration(data.mapboxRoute.duration)
        },
        safeRoute: {
          distance: data.safeRoute.distance,
          duration: formatDuration(data.safeRoute.duration),
          safety_score: data.metrics.safety_score,
          distance_increase: data.metrics.distance_increase_percent
        }
      });

      // Show fastest route popup
      const lastCoordinate = data.mapboxRoute.geometry.coordinates[data.mapboxRoute.geometry.coordinates.length - 1];
      const point = map.current?.project([lastCoordinate[0], lastCoordinate[1]]);
      
      setFastestRoutePopup({
        safetyScore: data.metrics.normalized_safety_score || 50,
        distance: data.mapboxRoute.distance,
        duration: formatDuration(data.mapboxRoute.duration),
        position: point ? { x: point.x + 10, y: point.y - 10 } : { x: 20, y: 100 },
        routeEndCoordinate: lastCoordinate
      });

      // Fit map to show both routes
      const bounds = new mapboxgl.LngLatBounds();
      data.mapboxRoute.geometry.coordinates.forEach((coord: [number, number]) => {
        bounds.extend(coord);
      });
      data.safeRoute.geometry.coordinates.forEach((coord: [number, number]) => {
        bounds.extend(coord);
      });
      
      map.current.fitBounds(bounds, {
        padding: 50,
        duration: 1000
      });

    } catch (error) {
      console.error('Error finding route:', error);
      setRouteError(error instanceof Error ? error.message : 'Failed to find route');
      setFastestRoutePopup(null);
    }
  };

  // Helper function to show a route on the map
  const showRoute = (route: any, type: 'standard' | 'safe' | 'fallback') => {
    if (!map.current) return;

    // Remove existing route layers
    const existingLayer = `route-${type}`;
    if (map.current.getLayer(existingLayer)) {
      map.current.removeLayer(existingLayer);
      map.current.removeSource(existingLayer);
    }

    // Add the new route
    map.current.addSource(existingLayer, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: route.geometry
      }
    });

    map.current.addLayer({
      id: existingLayer,
      type: 'line',
      source: existingLayer,
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': type === 'safe' ? '#10B981' : // Green for safe route
                      type === 'standard' ? '#3B82F6' : // Blue for standard route
                      '#9CA3AF', // Gray for fallback
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 2,
          15, 8
        ],
        'line-opacity': 1
      }
    });

    // Fit the map to show the route
    const bounds = new mapboxgl.LngLatBounds();
    route.geometry.coordinates.forEach((coord: [number, number]) => {
      bounds.extend(coord);
    });
    map.current.fitBounds(bounds, {
      padding: 50,
      duration: 1000
    });
  };



  // Functions to manage recent searches
  const loadRecentSearches = () => {
    try {
      const stored = localStorage.getItem('walksafe-recent-searches');
      if (stored) {
        const parsed = JSON.parse(stored);
        setRecentSearches(parsed.slice(0, 5)); // Keep only 5 most recent
      }
    } catch (error) {
      console.error('Error loading recent searches:', error);
    }
  };

  const saveToRecentSearches = (feature: any) => {
    try {
      const current = [...recentSearches];
      
      // Remove if already exists (to avoid duplicates)
      const filtered = current.filter(item => 
        item.id !== feature.id && 
        formatLocationName(item) !== formatLocationName(feature)
      );
      
      // Add to beginning
      const updated = [feature, ...filtered].slice(0, 5); // Keep only 5 most recent
      
      setRecentSearches(updated);
      localStorage.setItem('walksafe-recent-searches', JSON.stringify(updated));
    } catch (error) {
      console.error('Error saving recent search:', error);
    }
  };

  // Load recent searches on component mount
  useEffect(() => {
    loadRecentSearches();
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const searchContainer = document.querySelector('.search-container');
      if (searchContainer && !searchContainer.contains(event.target as Node)) {
        setShowSearchDropdown(false);
        setShowStartingPointDropdown(false);
        setShowRecentForDestination(false);
        setShowRecentForStarting(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      // Clear any pending timeouts
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (startingPointSearchTimeoutRef.current) {
        clearTimeout(startingPointSearchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="h-screen flex flex-col">
      {/* Map Controls - Top Left */}
      <div className="absolute top-4 left-4 z-10">
        <div className="bg-white bg-opacity-90 p-4 rounded-lg shadow-lg mb-4">
          <h1 className="text-2xl font-bold mb-4">DC Safety Map</h1>
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
              <p>{error}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              onClick={() => handleViewChange('heatmap')}
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                activeView === 'heatmap'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              title="Heatmap View"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>
            <button
              onClick={() => handleViewChange('street')}
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                activeView === 'street'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              title="Street View"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </button>
            {/* Remove Streetlamp Score View button */}
          </div>
          
          {/* Time of Day Filter - Only show for street view */}
          {activeView === 'street' && (
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-medium text-gray-700">Time of Day</h3>
              <div className="flex flex-col gap-1">
                {[
                  { key: 'overall' as const, label: 'Overall' },
                  { key: 'day' as const, label: 'Day (6AM-6PM)' },
                  { key: 'night' as const, label: 'Night (6PM-6AM)' }
                ].map(({ key, label }) => (
                <button
                    key={key}
                    onClick={() => handleTimeFilterChange(key)}
                    className={`w-full text-left px-3 py-2 rounded text-sm ${
                      activeTimeFilter === key
                      ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                    {label}
                </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Search Controls */}
        <div className="search-container">
        <div className="bg-white rounded-2xl shadow-lg w-80">
          {/* Starting Point Input */}
          <div className="relative">
            <div className="flex items-center px-4 py-4 border-b border-gray-100">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-3 flex-shrink-0"></div>
              <input
                type="text"
                value={startingPointQuery}
                onChange={handleStartingPointInputChange}
                onFocus={() => {
                  setShowRecentForDestination(false);
                  
                  if (startingPointResults.length > 0) {
                    setShowStartingPointDropdown(true);
                  } else if (startingPointQuery.length === 0 && recentSearches.length > 0) {
                    setShowRecentForStarting(true);
                  } else if (startingPointQuery.length >= 3) {
                    // If we have a query but no results yet, trigger search
                    searchStartingPointAddresses(startingPointQuery);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => setShowRecentForStarting(false), 150);
                }}
                placeholder="Choose starting point, or click on the map"
                className="flex-1 text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none text-sm"
              />
              {startingPointLoading && (
                <div className="ml-2 animate-spin rounded-full h-4 w-4 border-b-2 border-green-500"></div>
              )}
              {startingPointQuery && (
                <button
                  onClick={() => {
                    setStartingPointQuery('');
                    setStartingPointResults([]);
                    setShowStartingPointDropdown(false);
                    setStartingPointError('');
                    setSelectedStartingPoint(null);
                    if (startingPointMarkerRef.current) {
                      startingPointMarkerRef.current.remove();
                      startingPointMarkerRef.current = null;
                    }
                  }}
                  className="ml-2 text-gray-400 hover:text-gray-600 text-sm"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Starting Point Results Dropdown */}
            {showStartingPointDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                {startingPointResults.length > 0 ? (
                  startingPointResults.map((feature, index) => (
                    <div
                      key={index}
                      onClick={() => {
                        handleStartingPointSelect(feature);
                        setShowRecentForStarting(false);
                      }}
                      className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium text-sm text-gray-900">
                        {formatLocationName(feature)}
                      </div>
                    </div>
                  ))
                ) : startingPointError ? (
                  <div className="px-4 py-3 text-sm text-red-600">
                    {startingPointError}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-sm text-gray-600">
                    No results found
                  </div>
                )}
              </div>
            )}

            {/* Recent Searches for Starting Point */}
            {showRecentForStarting && recentSearches.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b">
                  Recent Searches
                </div>
                {recentSearches.slice(0, 3).map((feature, index) => (
                  <div
                    key={index}
                    onClick={() => {
                      setStartingPointQuery(formatLocationName(feature));
                      handleStartingPointSelect(feature);
                      setShowRecentForStarting(false);
                    }}
                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="font-medium text-sm text-gray-900">
                      {formatLocationName(feature)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Swap Button - between address bars */}
          <div className="flex justify-end px-4 py-2">
                <button
              onClick={() => {
                // Swap the values
                const tempQuery = searchQuery;
                const tempStarting = startingPointQuery;
                const tempDestination = selectedDestination;
                const tempOrigin = selectedStartingPoint;
                const tempDestMarker = destinationMarkerRef.current;
                const tempOriginMarker = startingPointMarkerRef.current;
                
                setSearchQuery(tempStarting);
                setStartingPointQuery(tempQuery);
                setSelectedDestination(tempOrigin);
                setSelectedStartingPoint(tempDestination);
                destinationMarkerRef.current = tempOriginMarker;
                startingPointMarkerRef.current = tempDestMarker;
              }}
              className="w-8 h-8 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-50 shadow-sm"
            >
              ⇅
                </button>
              </div>

          {/* Destination Input */}
          <div className="relative">
            <div className="flex items-center px-4 py-4">
              <div className="w-3 h-3 border-2 border-red-500 rounded-full mr-3 flex-shrink-0 bg-white relative">
                <div className="absolute inset-1 bg-red-500 rounded-full"></div>
            </div>
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchInputChange}
                onFocus={() => {
                  setShowRecentForStarting(false);
                  
                  if (searchResults.length > 0) {
                    setShowSearchDropdown(true);
                  } else if (searchQuery.length === 0 && recentSearches.length > 0) {
                    setShowRecentForDestination(true);
                  } else if (searchQuery.length >= 3) {
                    // If we have a query but no results yet, trigger search
                    searchAddresses(searchQuery);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => setShowRecentForDestination(false), 150);
                }}
                placeholder="Choose destination..."
                className="flex-1 text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none text-sm"
              />
              {searchLoading && (
                <div className="ml-2 animate-spin rounded-full h-4 w-4 border-b-2 border-red-500"></div>
              )}
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setShowSearchDropdown(false);
                    setSearchError('');
                    setSelectedDestination(null);
                    if (destinationMarkerRef.current) {
                      destinationMarkerRef.current.remove();
                      destinationMarkerRef.current = null;
                    }
                  }}
                  className="ml-2 text-gray-400 hover:text-gray-600 text-sm"
                >
                  ✕
                </button>
          )}
        </div>

            {/* Search Results Dropdown */}
            {showSearchDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                {searchResults.length > 0 ? (
                  searchResults.map((feature, index) => (
                    <div
                      key={index}
                      onClick={() => {
                        handleSearchSelect(feature);
                        setShowRecentForDestination(false);
                      }}
                      className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium text-sm text-gray-900">
                        {formatLocationName(feature)}
      </div>
                    </div>
                  ))
                ) : searchError ? (
                  <div className="px-4 py-3 text-sm text-red-600">
                    {searchError}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-sm text-gray-600">
                    No results found
                  </div>
                )}
              </div>
            )}

            {/* Recent Searches for Destination */}
            {showRecentForDestination && recentSearches.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b">
                  Recent Searches
                </div>
                {recentSearches.slice(0, 3).map((feature, index) => (
                  <div
                    key={index}
                    onClick={() => {
                      setSearchQuery(formatLocationName(feature));
                      handleSearchSelect(feature);
                      setShowRecentForDestination(false);
                    }}
                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="font-medium text-sm text-gray-900">
                      {formatLocationName(feature)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Find Route Button */}
        {selectedDestination && selectedStartingPoint && (
          <div className="mt-4">
            <button
              onClick={handleFindRoute}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors shadow-lg"
            >
              Find Safest Route
            </button>
          </div>
        )}
      </div>



      {/* Route Error Display */}
      {routeError && (
        <div className="absolute top-4 right-4 z-20">
          <div className="bg-red-50 border border-red-200 rounded-lg shadow-lg p-4 max-w-sm">
            <h3 className="font-semibold text-red-800 mb-2">Route Error</h3>
            <p className="text-sm text-red-700">{routeError}</p>
          </div>
        </div>
      )}

      {/* Map Container */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Fastest Route Popup */}
      {fastestRoutePopup && (
        <div 
          className="absolute z-20 rounded-lg shadow-lg p-4 max-w-sm"
          style={{
            left: fastestRoutePopup.position.x,
            top: fastestRoutePopup.position.y,
            fontFamily: 'var(--font-rubik), sans-serif',
            backgroundColor: '#3B82F6'
          }}
        >
          <h3 className="text-xl font-bold text-white mb-3">Fastest Route</h3>
          
          <div className="space-y-2 mb-4">
            <div className="flex justify-between items-center">
              <span className="text-white">Safety Score</span>
              <span className="text-green-300 font-semibold">{Math.round(fastestRoutePopup.safetyScore)}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white">Light Score</span>
              <span className="text-blue-200 font-semibold">--</span>
            </div>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-white font-medium">{(fastestRoutePopup.distance * 0.000621371).toFixed(1)} mi</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              <span className="text-white font-medium">{fastestRoutePopup.duration}</span>
            </div>
          </div>
        </div>
      )}

      {/* User Menu - Top Right */}
      <UserMenu />

      {/* Legend - positioned in bottom right */}
      <div className="absolute bottom-4 right-4 z-10 bg-white bg-opacity-90 p-4 rounded-lg shadow-lg">
        <h2 className="text-xl font-semibold mb-2">
          Safety Level
        </h2>
        <div className="flex flex-col gap-2">
          {activeView === 'street' ? (
            <>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6" style={{ background: 'linear-gradient(to right, #ff0000, #ffff00, #0e9737)' }} />
                <span>Safety Score (1-100)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6" style={{ backgroundColor: '#0e9737' }} />
                <span>81-100 - Safest (10.7%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6" style={{ backgroundColor: '#ffff00' }} />
                <span>41-60 - Average (44.4%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6" style={{ backgroundColor: '#ff0000' }} />
                <span>1-20 - Most Dangerous (1.3%)</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-red-600" />
                <span>High Crime Density</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-yellow-400" />
                <span>Medium Crime Density</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-600" />
                <span>Low Crime Density</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
