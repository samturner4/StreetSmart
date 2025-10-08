# Walk Safe App - Developer Documentation

## Overview

Walk Safe is a cross-platform safety-focused routing application that helps users find the safest walking routes through Washington DC. The app combines crime data, street network analysis, and real-time routing algorithms to provide personalized safety recommendations.

## Architecture

### Technology Stack

**Frontend:**
- **Web**: Next.js 14.1.0 with React 18.2.0, TypeScript 5.8.3
- **Mobile**: React Native 0.79.5 with Expo SDK 53, TypeScript 5.8.3
- **Maps**: Mapbox GL JS (web), MapLibre GL (mobile)
- **Styling**: Tailwind CSS (web), React Native StyleSheet (mobile)

**Backend:**
- **API Server**: Next.js API Routes (Node.js)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT tokens with bcryptjs
- **File Processing**: Node.js with csv-parse, Turf.js for geospatial operations

**Data Processing:**
- **Vector Tiles**: Tippecanoe for tile generation
- **Routing**: Custom A* algorithm implementation
- **Spatial Indexing**: Custom grid-based spatial indexing for performance

### Project Structure

```
Walk Safe App/
├── mobile/                 # React Native mobile app
│   ├── src/
│   │   ├── screens/        # App screens (Map, Settings, etc.)
│   │   ├── components/     # Reusable UI components
│   │   ├── services/       # API services and utilities
│   │   └── navigation/     # Navigation configuration
│   ├── assets/            # Images and icons
│   └── app.json           # Expo configuration
├── web/                   # Next.js web application
│   ├── src/
│   │   ├── app/           # Next.js app router
│   │   │   └── api/       # API endpoints
│   │   ├── scripts/       # Data processing scripts
│   │   └── components/    # React components
│   └── next.config.js     # Next.js configuration
├── shared/                # Shared TypeScript types and utilities
├── data/                  # Data storage and processing
│   ├── DC/               # Washington DC specific data
│   │   ├── crime-incidents/  # Crime data (CSV, GeoJSON)
│   │   ├── streets/          # Street network data
│   │   ├── vector-tiles/     # Generated vector tiles
│   │   └── processed/        # Processed data files
│   └── NYC/              # New York City data (future expansion)
└── tippecanoe/           # Vector tile generation tool
```

## Data Sources & Processing

### Crime Data
- **Source**: DC Open Data Portal (opendata.dc.gov)
- **Format**: CSV files with crime incidents from 2024
- **Processing**: Aggregated by street segments with spatial indexing
- **Safety Scoring**: Weighted by crime type severity (1-10 scale)

### Street Network
- **Source**: DC Street Centerlines (GeoJSON)
- **Processing**: Filtered for walkability using OpenStreetMap data
- **Routing Graph**: Converted to dense node graph for A* routing

### Vector Tiles
- **Generation**: Tippecanoe tool creates MBTiles format
- **Zoom Levels**: 9-15 (optimized for mobile performance)
- **Properties**: Safety scores, street names, quadrants
- **Hosting**: Static file serving through Next.js

## API Endpoints

### Core Routing API
- **`/api/mobile-safe-route`** - Mobile app routing endpoint
  - Parameters: startLat, startLon, endLat, endLon, routeType
  - Returns: Waypoints, safety score, distance, duration
- **`/api/safe-route`** - Web app routing endpoint
- **`/api/street-safety`** - Street-level safety data
- **`/api/crime-data`** - Raw crime incident data
- **`/api/geocode`** - Address geocoding service

### Response Format
```typescript
interface RouteResponse {
  waypoints: [number, number][];
  safety_score: number;
  normalized_safety_score: number;
  total_distance: number;
  estimated_duration: number;
  debug?: {
    centerline_geometry: any;
    original_points: any;
    snapped_points: any;
  };
}
```

## Routing Algorithm

### Graph Construction
1. **Street Network Loading**: Loads DC street centerlines from GeoJSON
2. **Walkability Filtering**: Uses OSM data to filter walkable streets
3. **Safety Score Integration**: Maps crime data to street segments
4. **Dense Node Graph**: Creates nodes at every street intersection
5. **Edge Weighting**: Calculates weights based on safety and distance

### Route Types
- **`safest`**: Prioritizes safety over distance (default)
- **`quickest`**: Shortest distance route
- **`balanced`**: Weighted combination of safety and distance

### Algorithm Details
- **Pathfinding**: Custom A* implementation with priority queue
- **Spatial Indexing**: Grid-based spatial index for performance
- **Edge Weights**: Dynamic calculation based on safety scores and distance
- **Detour Limits**: Maximum 30% longer than shortest path for safety routes

## Vector Tiles Implementation

### Tile Generation Process
1. **Data Preparation**: Process street safety scores to GeoJSON
2. **Tippecanoe Processing**: Generate vector tiles with specific parameters
3. **Tile Optimization**: Simplify geometries and drop dense features
4. **Metadata Generation**: Create tile metadata for client consumption

### Tile Configuration
```bash
tippecanoe -o safety-tiles.mbtiles \
  -Z9 -z15 \
  --drop-rate=1 \
  --minimum-zoom=9 \
  --maximum-zoom=15 \
  --generate-ids \
  --simplification=10 \
  --include=safety_score \
  --include=normalized_safety_score \
  --layer=safety
```

### Client-Side Usage
- **Web**: Mapbox GL JS with custom style layers
- **Mobile**: MapLibre GL with vector tile sources
- **Styling**: Dynamic styling based on safety scores (1-100 scale)

## Development Environment

### Prerequisites
- Node.js 18+ and npm
- Python 3.8+ (for Tippecanoe)
- Expo CLI for mobile development
- Git for version control

### Setup Instructions

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd walk-safe-app
   ```

2. **Install Dependencies**
   ```bash
   # Root dependencies
   npm install
   
   # Web app dependencies
   cd web && npm install
   
   # Mobile app dependencies
   cd ../mobile && npm install
   
   # Shared package
   cd ../shared && npm install
   ```

3. **Environment Configuration**
   ```bash
   # Web app (.env.local)
   NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_token
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_key
   
   # Mobile app (app.json)
   # Update API endpoints for development/production
   ```

4. **Data Processing**
   ```bash
   # Calculate safety scores
   cd web && npm run calculate-safety
   
   # Build routing graph
   npm run build-routing-graph
   
   # Generate vector tiles
   npm run generate-vector-tiles
   ```

### Development Scripts

**Web App:**
- `npm run dev` - Start development server (port 3001)
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run calculate-safety` - Process crime data
- `npm run build-routing-graph` - Generate routing graph

**Mobile App:**
- `npm start` - Start Expo development server
- `npm run android` - Run on Android device/emulator
- `npm run ios` - Run on iOS device/simulator
- `npm run web` - Run in web browser

## Deployment

### Web Application
- **Platform**: Vercel (recommended) or any Node.js hosting
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Environment Variables**: Mapbox token, Supabase credentials

### Mobile Application
- **Platform**: Expo Application Services (EAS)
- **Build Profiles**: Development, Preview, Production
- **Distribution**: Internal (development/preview), App Store/Play Store (production)
- **Configuration**: `eas.json` defines build settings

### Vector Tiles Hosting
- **Static Files**: Served through Next.js static file serving
- **CDN**: Can be deployed to CDN for better performance
- **Caching**: Configured with appropriate cache headers

## Performance Optimizations

### Spatial Indexing
- **Grid-Based Index**: 0.002-degree grid cells for fast proximity queries
- **Memory Efficiency**: Optimized data structures for large datasets
- **Query Performance**: O(1) edge lookups using hash maps

### Vector Tiles
- **Zoom Optimization**: Different detail levels per zoom level
- **Feature Dropping**: Automatic simplification at lower zoom levels
- **Compression**: PBF format for efficient transmission

### Mobile Optimizations
- **Lazy Loading**: Load tiles only when needed
- **Memory Management**: Efficient tile caching and cleanup
- **Network Efficiency**: Compressed API responses

## Data Flow

1. **Crime Data Ingestion**: CSV files → Processing scripts → GeoJSON
2. **Safety Score Calculation**: Crime incidents → Spatial analysis → Street segment scores
3. **Routing Graph Construction**: Street network → Walkability filtering → Dense node graph
4. **Vector Tile Generation**: Processed data → Tippecanoe → MBTiles
5. **Client Requests**: Mobile/Web → API → Routing algorithm → Response
6. **Map Rendering**: Vector tiles → Map engine → Styled visualization

## Security Considerations

### API Security
- **Input Validation**: Coordinate bounds checking, parameter validation
- **Rate Limiting**: Implement rate limiting for API endpoints
- **CORS Configuration**: Proper CORS headers for cross-origin requests

### Data Privacy
- **Location Data**: No persistent storage of user locations
- **Crime Data**: Public data only, no personal information
- **API Keys**: Secure storage of third-party service keys

## Monitoring & Debugging

### Logging
- **API Logs**: Request/response logging for debugging
- **Error Handling**: Comprehensive error messages and status codes
- **Performance Metrics**: Route calculation timing and success rates

### Debug Features
- **Development Mode**: Additional debug information in API responses
- **Graph Statistics**: Node/edge counts and connectivity metrics
- **Route Visualization**: Debug geometry for route validation

## Future Enhancements

### Planned Features
- **Multi-City Support**: Expand beyond DC to other cities
- **Real-Time Updates**: Live crime data integration
- **User Preferences**: Customizable safety vs. speed preferences
- **Offline Support**: Cached routing for offline usage

### Technical Improvements
- **Graph Optimization**: More efficient routing algorithms
- **Tile Performance**: Better vector tile optimization
- **Mobile Performance**: Native module optimizations
- **API Scalability**: Microservices architecture

## Troubleshooting

### Common Issues
1. **Routing Graph Not Found**: Check data file paths and permissions
2. **Vector Tiles Not Loading**: Verify tile generation and hosting
3. **Mobile API Connection**: Check network configuration and endpoints
4. **Performance Issues**: Monitor memory usage and optimize queries

### Debug Commands
```bash
# Verify data files
ls -la data/DC/streets/processed/
ls -la data/DC/vector-tiles/

# Check API endpoints
curl "http://localhost:3001/api/street-safety"

# Test mobile API
curl "http://localhost:3001/api/mobile-safe-route?startLat=38.9&startLon=-77.0&endLat=38.91&endLon=-77.01"
```

## Contributing

### Code Standards
- **TypeScript**: Strict type checking enabled
- **ESLint**: Configured for code quality
- **Prettier**: Code formatting (if configured)
- **Git**: Conventional commit messages

### Development Workflow
1. Create feature branch from main
2. Implement changes with tests
3. Update documentation as needed
4. Submit pull request for review
5. Merge after approval

This documentation provides a comprehensive overview of the Walk Safe App architecture and development process. For specific implementation details, refer to the source code and inline comments.
