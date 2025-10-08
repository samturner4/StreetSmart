interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface StreetSegment {
  coordinates: [number, number][];
  safety_score: number;
  street_name?: string;
}

interface GridCell {
  segments: StreetSegment[];
}

export class SpatialIndex {
  private grid: Map<string, GridCell>;
  private GRID_SIZE = 0.002; // degrees (~200m at DC latitude)
  private segments: StreetSegment[];

  constructor(segments: StreetSegment[]) {
    this.segments = segments;
    this.grid = new Map();
    this.buildGrid();
  }

  private buildGrid(): void {
    console.log('🏗️ [DEBUG] Building grid-based spatial index...');
    
    this.segments.forEach(segment => {
      const center = this.getSegmentCenter(segment);
      const gridX = Math.floor(center.lon / this.GRID_SIZE);
      const gridY = Math.floor(center.lat / this.GRID_SIZE);
      const gridKey = `${gridX},${gridY}`;
      
      if (!this.grid.has(gridKey)) {
        this.grid.set(gridKey, { segments: [] });
      }
      this.grid.get(gridKey)!.segments.push(segment);
    });
    
    console.log(`✅ [DEBUG] Built spatial index with ${this.grid.size} grid cells for ${this.segments.length} segments`);
  }

  private getSegmentCenter(segment: StreetSegment): { lat: number, lon: number } {
    if (segment.coordinates.length === 0) {
      return { lat: 0, lon: 0 };
    }
    
    let totalLat = 0;
    let totalLon = 0;
    let pointCount = 0;
    
    segment.coordinates.forEach(([lon, lat]) => {
      totalLon += lon;
      totalLat += lat;
      pointCount++;
    });
    
    return {
      lat: totalLat / pointCount,
      lon: totalLon / pointCount
    };
  }

  // Query segments within given bounds using grid-based lookup
  public query(bounds: Bounds): StreetSegment[] {
    const startTime = performance.now();
    
    // Calculate grid bounds
    const minGridX = Math.floor(bounds.west / this.GRID_SIZE);
    const maxGridX = Math.floor(bounds.east / this.GRID_SIZE);
    const minGridY = Math.floor(bounds.south / this.GRID_SIZE);
    const maxGridY = Math.floor(bounds.north / this.GRID_SIZE);
    
    const result: StreetSegment[] = [];
    const seenSegments = new Set<StreetSegment>(); // Prevent duplicates
    
    // Check all grid cells that overlap with the query bounds
    for (let gridX = minGridX; gridX <= maxGridX; gridX++) {
      for (let gridY = minGridY; gridY <= maxGridY; gridY++) {
        const gridKey = `${gridX},${gridY}`;
        const cell = this.grid.get(gridKey);
        
        if (cell) {
          // Add segments from this cell (avoiding duplicates)
          cell.segments.forEach(segment => {
            if (!seenSegments.has(segment)) {
              seenSegments.add(segment);
              result.push(segment);
            }
          });
        }
      }
    }
    
    const endTime = performance.now();
    const queryTime = endTime - startTime;
    
    console.log(`🚀 [DEBUG] Grid query: ${result.length} segments in ${queryTime.toFixed(2)}ms`);
    console.log(`🗺️ [DEBUG] Grid bounds: X(${minGridX}-${maxGridX}), Y(${minGridY}-${maxGridY})`);
    
    return result;
  }

  // Get performance stats
  public getStats(): { totalCells: number; totalSegments: number; avgSegmentsPerCell: number } {
    let totalSegments = 0;
    this.grid.forEach(cell => {
      totalSegments += cell.segments.length;
    });
    
    return {
      totalCells: this.grid.size,
      totalSegments: this.segments.length,
      avgSegmentsPerCell: totalSegments / this.grid.size
    };
  }
}
