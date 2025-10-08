/**
 * Geocoding service using Mapbox API
 */

// Use Maptiler API key instead of Mapbox
const MAPTILER_API_KEY = 'RzC1OZEVAOHwuYsEqOjx';

export interface GeocodingResult {
  place_name: string;
  center: [number, number]; // [longitude, latitude]
  text: string;
}

export class GeocodingService {
  static async searchAddress(query: string): Promise<GeocodingResult[]> {
    if (!query.trim()) return [];

    try {
             const url = new URL('https://api.maptiler.com/geocoding/' + encodeURIComponent(query.trim()) + '.json');
       url.searchParams.append('key', MAPTILER_API_KEY);
       url.searchParams.append('country', 'US');
      url.searchParams.append('types', 'address,poi'); // Only return addresses and points of interest
      url.searchParams.append('limit', '5'); // Limit to 5 results

      const response = await fetch(url.toString());
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Geocoding request failed');
      }

      // MapTiler returns results in a slightly different format
      return data.features.map((feature: any) => ({
        place_name: feature.place_name || feature.formatted,
        center: feature.center || [feature.geometry.coordinates[0], feature.geometry.coordinates[1]],
        text: feature.text || feature.properties.name || feature.formatted.split(',')[0]
      }));
    } catch (error) {
      console.error('Geocoding error:', error);
      return [];
    }
  }
}
