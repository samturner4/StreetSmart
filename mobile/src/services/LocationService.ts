/**
 * Location Service
 * Handles location permissions, coordinate validation, and DC bounds checking
 */

import * as Location from 'expo-location';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

export interface LocationState {
  coordinates: LocationCoordinates | null;
  isWithinBounds: boolean;
  permissionGranted: boolean;
  error: string | null;
}

// DC area bounds (approximate rectangle around Washington DC)
const DC_BOUNDS = {
  north: 39.0,   // Northern boundary
  south: 38.8,   // Southern boundary  
  east: -76.9,   // Eastern boundary
  west: -77.2    // Western boundary
};

export class LocationService {
  private static currentState: LocationState = {
    coordinates: null,
    isWithinBounds: false,
    permissionGranted: false,
    error: null
  };

  private static listeners: ((state: LocationState) => void)[] = [];
  private static watchSubscription: Location.LocationSubscription | null = null;

  /**
   * Request location permission and get current location
   */
  static async requestLocation(): Promise<LocationState> {
    try {
      console.log('📍 [LocationService] Requesting location permission...');
      
      // Check current permission status first
      const { status: currentStatus } = await Location.getForegroundPermissionsAsync();
      console.log('📍 [LocationService] Current permission status:', currentStatus);
      
      let status = currentStatus;
      
      // Only request if not already granted
      if (currentStatus !== 'granted') {
        console.log('📍 [LocationService] Requesting new permission...');
        const permissionResult = await Location.requestForegroundPermissionsAsync();
        status = permissionResult.status;
        console.log('📍 [LocationService] Permission request result:', status);
      }
      
      if (status !== 'granted') {
        const error = 'Location permission denied';
        console.log('❌ [LocationService]', error);
        this.updateState({ permissionGranted: false, error });
        return this.currentState;
      }

      console.log('✅ [LocationService] Permission granted, getting current location...');
      
      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeout: 10000,
        maximumAge: 60000 // Use cached location if less than 1 minute old
      });

      const coordinates: LocationCoordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      };

      // Check if within DC bounds
      const isWithinBounds = this.isWithinDCBounds(coordinates);
      
      console.log(`📍 [LocationService] Location: ${coordinates.latitude}, ${coordinates.longitude}`);
      console.log(`🏙️ [LocationService] Within DC bounds: ${isWithinBounds}`);

      this.updateState({
        coordinates,
        isWithinBounds,
        permissionGranted: true,
        error: null
      });

      return this.currentState;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown location error';
      console.error('❌ [LocationService] Error:', errorMessage);
      this.updateState({ error: errorMessage });
      return this.currentState;
    }
  }

  /**
   * Check if coordinates are within DC bounds
   */
  static isWithinDCBounds(coordinates: LocationCoordinates): boolean {
    const { latitude, longitude } = coordinates;
    return (
      latitude >= DC_BOUNDS.south &&
      latitude <= DC_BOUNDS.north &&
      longitude >= DC_BOUNDS.west &&
      longitude <= DC_BOUNDS.east
    );
  }

  /**
   * Get current location state
   */
  static getCurrentState(): LocationState {
    return { ...this.currentState };
  }

  /**
   * Start watching location changes
   */
  static async startWatching(): Promise<void> {
    try {
      // Stop existing watch if any
      if (this.watchSubscription) {
        this.watchSubscription.remove();
      }

      console.log('📍 [LocationService] Starting location watch...');
      
      this.watchSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10000, // Update every 10 seconds
          distanceInterval: 50, // Update every 50 meters
        },
        (location) => {
          const coordinates: LocationCoordinates = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude
          };

          const isWithinBounds = this.isWithinDCBounds(coordinates);
          
          console.log(`📍 [LocationService] Location updated: ${coordinates.latitude}, ${coordinates.longitude}`);
          console.log(`🏙️ [LocationService] Within DC bounds: ${isWithinBounds}`);

          this.updateState({
            coordinates,
            isWithinBounds,
            permissionGranted: true,
            error: null
          });
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Location watch error';
      console.error('❌ [LocationService] Watch error:', errorMessage);
      this.updateState({ error: errorMessage });
    }
  }

  /**
   * Stop watching location changes
   */
  static stopWatching(): void {
    if (this.watchSubscription) {
      console.log('📍 [LocationService] Stopping location watch...');
      this.watchSubscription.remove();
      this.watchSubscription = null;
    }
  }

  /**
   * Subscribe to location state changes
   */
  static subscribe(listener: (state: LocationState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Update state and notify listeners
   */
  private static updateState(updates: Partial<LocationState>): void {
    this.currentState = { ...this.currentState, ...updates };
    this.listeners.forEach(listener => listener(this.currentState));
  }

  /**
   * Validate coordinates are valid lat/lon values
   */
  static validateCoordinates(latitude: number, longitude: number): boolean {
    return (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      !isNaN(latitude) &&
      !isNaN(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }
}
