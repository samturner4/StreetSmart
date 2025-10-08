const API_BASE_URL = 'http://192.168.1.168:3001';

export interface GeocodeResult {
  features: Array<{
    place_name: string;
    center: [number, number];
    properties: any;
  }>;
}

export interface RouteResult {
  route: Array<[number, number]>;
  safety_score: number;
  distance: number;
  duration: number;
}

export class ApiService {
  static async geocode(query: string): Promise<GeocodeResult> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/geocode?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Geocoding error:', error);
      throw error;
    }
  }

  static async getSafeRoute(start: [number, number], end: [number, number]): Promise<RouteResult> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/safe-route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ start, end }),
      });
      
      if (!response.ok) {
        throw new Error(`Route planning failed: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Route planning error:', error);
      throw error;
    }
  }

  static async getStreetSafety(lat: number, lng: number): Promise<any> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/street-safety?lat=${lat}&lng=${lng}`);
      if (!response.ok) {
        throw new Error(`Safety data failed: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Safety data error:', error);
      throw error;
    }
  }

  static async getAllStreetSafety(): Promise<any> {
    try {
      console.log('🔍 [DEBUG] Starting getAllStreetSafety fetch...');
      console.log('🔍 [DEBUG] Target URL:', `${API_BASE_URL}/api/street-safety`);
      console.log('🔍 [DEBUG] API_BASE_URL:', API_BASE_URL);
      
      const startTime = Date.now();
      console.log('🔍 [DEBUG] Fetch start time:', startTime);
      
      const response = await fetch(`${API_BASE_URL}/api/street-safety`);
      const endTime = Date.now();
      console.log('🔍 [DEBUG] Fetch completed in:', endTime - startTime, 'ms');
      console.log('🔍 [DEBUG] Response status:', response.status);
      console.log('🔍 [DEBUG] Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        console.error('❌ [DEBUG] Response not OK:', response.status, response.statusText);
        throw new Error(`Street safety fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ [DEBUG] Successfully parsed response data');
      console.log('✅ [DEBUG] Data type:', typeof data);
      console.log('✅ [DEBUG] Data keys:', Object.keys(data));
      console.log('✅ [DEBUG] Features count:', data.features?.length || 'No features array');
      
      return data;
    } catch (error) {
      console.error('❌ [DEBUG] Detailed error in getAllStreetSafety:');
      console.error('❌ [DEBUG] Error type:', typeof error);
      console.error('❌ [DEBUG] Error message:', error instanceof Error ? error.message : String(error));
      console.error('❌ [DEBUG] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('❌ [DEBUG] Full error object:', error);
      throw error;
    }
  }
}
