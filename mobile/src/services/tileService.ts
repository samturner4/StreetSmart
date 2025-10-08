

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export class TileService {
  private baseUrl = 'https://d3groh2thon6ux.cloudfront.net/dc/tiles';

  // Supported zoom levels for our vector tiles
  private static readonly MIN_ZOOM = 10;
  private static readonly MAX_ZOOM = 13;

  private tileCache = new Map<string, ArrayBuffer>();
  private maxCacheSize = 100; // Maximum tiles to keep in memory

  // Convert longitude to tile X coordinate
  private lngToTileX(lng: number, zoom: number): number {
    return ((lng + 180) / 360) * Math.pow(2, zoom);
  }

  // Convert latitude to tile Y coordinate
  private latToTileY(lat: number, zoom: number): number {
    const latRad = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom);
  }

  // Convert bounds to tile coordinates
  private boundsToTileCoords(bounds: MapBounds, zoom: number): TileCoord[] {
    const tiles: TileCoord[] = [];
    
    // Convert bounds to tile coordinates
    const minTileX = Math.floor(this.lngToTileX(bounds.west, zoom));
    const maxTileX = Math.ceil(this.lngToTileX(bounds.east, zoom));
    const minTileY = Math.floor(this.latToTileY(bounds.north, zoom));
    const maxTileY = Math.ceil(this.latToTileY(bounds.south, zoom));
    
    // Generate all tile coordinates in the viewport
    for (let x = minTileX; x <= maxTileX; x++) {
      for (let y = minTileY; y <= maxTileY; y++) {
        tiles.push({ z: zoom, x, y });
      }
    }
    
    return tiles;
  }

  // Load a single tile
  async loadTile(z: number, x: number, y: number): Promise<ArrayBuffer> {
    const key = `${z}/${x}/${y}`;
    
    // Check cache first
    if (this.tileCache.has(key)) {
      return this.tileCache.get(key)!;
    }

    try {
      // Load from CloudFront
      const response = await fetch(`${this.baseUrl}/${z}/${x}/${y}.pbf`);
      
      if (!response.ok) {
        if (response.status === 403) {
          // 403 is expected for tiles outside DC - return null instead of throwing
          return new ArrayBuffer(0);
        }
        throw new Error(`Failed to load tile ${key}: ${response.status}`);
      }
      
      const tileData = await response.arrayBuffer();
      
      // Cache the tile
      this.tileCache.set(key, tileData);
      
      // Manage cache size
      if (this.tileCache.size > this.maxCacheSize) {
        const firstKey = this.tileCache.keys().next().value;
        if (firstKey !== undefined) {
          this.tileCache.delete(firstKey);
        }
      }
      
      return tileData;
    } catch (error) {
      console.error(`Error loading tile ${key}:`, error);
      throw error;
    }
  }

  // Get tiles needed for current viewport
  getTilesForViewport(bounds: MapBounds, zoom: number): TileCoord[] {
    // Clamp zoom to our supported range
    const clampedZoom = Math.max(TileService.MIN_ZOOM, Math.min(TileService.MAX_ZOOM, Math.floor(zoom)));
    
    return this.boundsToTileCoords(bounds, clampedZoom);
  }

  // Load all tiles for a viewport
  async loadTilesForViewport(bounds: MapBounds, zoom: number): Promise<ArrayBuffer[]> {
    const neededTiles = this.getTilesForViewport(bounds, zoom);
    
    // Load all needed tiles in parallel
    const tilePromises = neededTiles.map(tile => 
      this.loadTile(tile.z, tile.x, tile.y)
    );
    
    return Promise.all(tilePromises);
  }

  // Clear cache
  clearCache(): void {
    this.tileCache.clear();
  }
}