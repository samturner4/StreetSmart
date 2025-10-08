/**
 * Street Data Manager
 * Handles loading and querying street centerline data
 */

import { StreetSegment, StreetNetwork, StreetIntersection, NearestSegmentResult } from '../types/streetData';
import { Point } from '../types/geometry';
import { calculateDistance } from '../utils/distance';
import { GeometryService } from './GeometryService';

export class StreetDataManager {
  private static instance: StreetDataManager;
  private network: StreetNetwork | null = null;
  private intersections: Map<string, StreetIntersection> = new Map();

  private constructor() {}

  static getInstance(): StreetDataManager {
    if (!StreetDataManager.instance) {
      StreetDataManager.instance = new StreetDataManager();
    }
    return StreetDataManager.instance;
  }

  /**
   * Load street network data
   */
  async loadNetwork(): Promise<void> {
    try {
      // Load street centerline data
      const streetData = require('../data/dc-centerlines.json');
      
      // Initialize network
      this.network = {
        segments: new Map(),
        spatialIndex: new Map()
      };

      // Process each segment
      for (const segment of streetData.features) {
        if (!segment.properties.is_walkable) continue;

        const streetSegment: StreetSegment = {
          id: segment.properties.id,
          geometry: segment.geometry,
          properties: {
            street_name: segment.properties.street_name,
            safety_score: segment.properties.safety_score,
            length_meters: segment.properties.length_meters,
            is_walkable: true,
            from_intersection: segment.properties.from_intersection,
            to_intersection: segment.properties.to_intersection
          }
        };

        // Add to segments map
        this.network.segments.set(streetSegment.id, streetSegment);

        // Add to spatial index
        this.indexSegment(streetSegment);
      }

      console.log(`✅ Loaded ${this.network.segments.size} walkable street segments`);
    } catch (error) {
      console.error('Failed to load street network:', error);
      throw new Error('Failed to load street network data');
    }
  }

  /**
   * Index a segment in the spatial grid
   */
  private indexSegment(segment: StreetSegment): void {
    if (!this.network) return;

    // Add each point of the segment to the spatial index
    for (const [lon, lat] of segment.geometry.coordinates) {
      const key = this.getGridKey(lat, lon);
      const cell = this.network.spatialIndex.get(key) || [];
      if (!cell.includes(segment.id)) {
        cell.push(segment.id);
        this.network.spatialIndex.set(key, cell);
      }
    }
  }

  /**
   * Get grid key for spatial index
   * Rounds coordinates to create ~11m grid cells
   */
  private getGridKey(lat: number, lon: number): string {
    return `${Math.round(lat * 10000)},${Math.round(lon * 10000)}`;
  }

  /**
   * Find the nearest street segment to a point
   */
  findNearestSegment(point: Point): NearestSegmentResult | null {
    if (!this.network) throw new Error('Street network not loaded');

    const key = this.getGridKey(point.latitude, point.longitude);
    const nearbySegments = this.network.spatialIndex.get(key) || [];

    let nearest: NearestSegmentResult | null = null;
    let minDistance = Infinity;

    // Check each nearby segment
    for (const segmentId of nearbySegments) {
      const segment = this.network.segments.get(segmentId);
      if (!segment) continue;

      // Check each line segment in the street
      for (let i = 0; i < segment.geometry.coordinates.length - 1; i++) {
        const start = {
          latitude: segment.geometry.coordinates[i][1],
          longitude: segment.geometry.coordinates[i][0]
        };
        const end = {
          latitude: segment.geometry.coordinates[i + 1][1],
          longitude: segment.geometry.coordinates[i + 1][0]
        };

        // Find nearest point on this line segment
        const nearestPoint = GeometryService.findNearestPointOnLine(point, start, end);
        const distance = calculateDistance(
          point.latitude,
          point.longitude,
          nearestPoint.latitude,
          nearestPoint.longitude
        );

        if (distance < minDistance) {
          minDistance = distance;
          nearest = {
            segmentId,
            distance,
            pointOnSegment: [nearestPoint.longitude, nearestPoint.latitude],
            segmentProgress: i / (segment.geometry.coordinates.length - 1)
          };
        }
      }
    }

    return nearest;
  }

  /**
   * Get connected segments at an intersection
   */
  getConnectedSegments(intersectionId: string): string[] {
    const intersection = this.intersections.get(intersectionId);
    return intersection?.connected_segments || [];
  }

  /**
   * Get a street segment by ID
   */
  getSegment(segmentId: string): StreetSegment | undefined {
    return this.network?.segments.get(segmentId);
  }

  /**
   * Check if the network is loaded
   */
  isLoaded(): boolean {
    return this.network !== null;
  }

  /**
   * Clear all loaded data
   */
  clear(): void {
    this.network = null;
    this.intersections.clear();
  }
}


