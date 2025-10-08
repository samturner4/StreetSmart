import fs from 'fs';
import path from 'path';
import { Feature, LineString } from 'geojson';
import cliProgress from 'cli-progress';
import { isPointWalkable } from './process-osm-walkability';
import { calculateDistance } from './utils';

interface GeoJSONFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: number[][];
  };
  properties: {
    OBJECTID: number;
    [key: string]: any;
  };
}

interface StreetSegment {
  length: number;
  startPoint: [number, number]; // [lat, lon]
  endPoint: [number, number]; // [lat, lon]
  connectedSegments: string[];
  gridCells: string[];
  properties: {
    OBJECTID: number;
    [key: string]: any;
  };
}

interface GraphNode {
  id: string;
  lat: number;
  lon: number;
}

interface EdgeWeights {
  quickest: number;
  balanced: number;
  safetyOnly: number; // 100% safety weighting
  detour5: number;
  detour10: number;
  detour15: number;
  detour20: number;
  detour25: number;
  detour30: number;
}

interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  properties: {
    safety_score: number;
    length_meters: number;
    weights: EdgeWeights;
    geometry: [number, number][]; // Added geometry property
    segmentId?: string;
  };
}

interface RoutingGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  adjacencyList: Map<string, Set<string>>; // nodeId -> Set of connected nodeIds
  edgeLookup: Map<string, string>; // "node1->node2" -> edgeId for O(1) lookups
}

// Configuration for weight calculation
const WEIGHT_FACTORS = {
  safety: 0.6,    // 60% weight for safety score
  distance: 0.4   // 40% weight for distance - increased to make distance more meaningful
};

// Filter segments to only include walkable ones using OSM data
async function filterWalkableSegments(segments: any[]): Promise<any[]> {
  console.log('Loading OSM walkability data for routing...');
  
  // Load the walkable areas from OSM data
  const city = process.env.CITY || 'DC';
  const walkableAreasPath = path.join(process.cwd(), 'data', city, 'osm-walkability', 'walkable-areas.json');
  const walkableAreasArray = JSON.parse(fs.readFileSync(walkableAreasPath, 'utf-8'));
  const walkableAreas = new Map<string, boolean>();
  
  // Convert array to Map for fast lookup
  walkableAreasArray.forEach((key: string) => {
    walkableAreas.set(key, true);
  });
  
  console.log(`Loaded ${walkableAreas.size} walkable areas from OSM data`);
  console.log('Filtering routing segments for walkability...');

  // Set up a progress bar for filtering (helps user understand long step)
  const filterBar = new cliProgress.SingleBar({
    format: 'Filter Walkable [{bar}] {percentage}% | {value}/{total} segments | ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });
  filterBar.start(segments.length, 0);

  // Filter segments using OSM data
  const walkableSegments: any[] = [];
  let filteredCount = 0;
  
  for (const segment of segments) {
    // Check both endpoints of the segment, not just the midpoint
    // Handle different coordinate formats
    let startLat, startLon, endLat, endLon;
    
    // Check if coordinates are nested arrays or simple numbers
    if (Array.isArray(segment.startPoint[0])) {
      // Nested array format: [[lon, lat], [lon, lat]]
      startLat = segment.startPoint[0][1];
      startLon = segment.startPoint[0][0];
      endLat = segment.endPoint[0][1];
      endLon = segment.endPoint[0][0];
    } else {
      // Simple array format: [lat, lon]
      startLat = segment.startPoint[0];
      startLon = segment.startPoint[1];
      endLat = segment.endPoint[0];
      endLon = segment.endPoint[1];
    }
    
    // A segment is walkable if AT LEAST ONE endpoint is walkable.
    // Using OR instead of AND prevents legitimate through-streets from being dropped
    // when OSM coverage is slightly offset.
    const startWalkable = isPointWalkable(startLat, startLon, walkableAreas);
    const endWalkable = isPointWalkable(endLat, endLon, walkableAreas);

    if (startWalkable || endWalkable) {
      walkableSegments.push(segment);
    } else {
      filteredCount++;
    }

    // Update progress bar
    filterBar.increment();
  }

  filterBar.stop();
  
  console.log(`\nFiltered out ${filteredCount.toLocaleString()} non-walkable routing segments`);
  console.log(`Kept ${walkableSegments.length.toLocaleString()} walkable routing segments`);
  
  return walkableSegments;
}

// ---------------------------
// Helper: consistent node IDs
// ---------------------------
const NODE_PRECISION = 6; // 1e-6 deg ≈ 0.11 m
function makeNodeId(latRaw: number | number[], lonRaw: number | number[]): string {
  const lat = Array.isArray(latRaw) ? latRaw[0] : latRaw;
  const lon = Array.isArray(lonRaw) ? lonRaw[0] : lonRaw;
  return `node_${lat.toFixed(NODE_PRECISION)}_${lon.toFixed(NODE_PRECISION)}`;
}

async function buildRoutingGraph(): Promise<RoutingGraph> {
  // Initialize graph structure
  const graph: RoutingGraph = {
    nodes: new Map(),
    edges: new Map(),
    adjacencyList: new Map(),
    edgeLookup: new Map()
  };

  try {
    console.log('Loading data files...');
    
    // Load and validate street network
    const city = process.env.CITY || 'DC';
    const streetNetworkPath = path.join(process.cwd(), 'data', city, 'streets', 'Street_Centerlines.geojson');
    console.log('Reading street network from:', streetNetworkPath);
    const streetNetworkContent = fs.readFileSync(streetNetworkPath, 'utf-8');
    console.log('Street network file size:', streetNetworkContent.length, 'bytes');
    const streetNetwork = JSON.parse(streetNetworkContent);
    console.log('Street network structure:', Object.keys(streetNetwork));
    
    if (!streetNetwork.features || !Array.isArray(streetNetwork.features)) {
      throw new Error('Invalid street network format: missing features array');
    }

      // Convert GeoJSON features to segments
      const segments = streetNetwork.features
        .filter((feature: GeoJSONFeature) => feature.geometry?.coordinates?.length > 0)
        .map((feature: GeoJSONFeature, index: number) => {
          const coords = (feature.geometry?.type === 'MultiLineString'
            ? (feature.geometry.coordinates as unknown as number[][][]).flat()  // Flatten MultiLineString parts
            : feature.geometry?.coordinates || []) as number[][];
          
          // Debug problematic segments
          if (feature.properties?.STREETSEGID === 44 || 
              feature.properties?.STREETSEGID === 203 ||
              feature.properties?.STREETSEGID === 9004 ||
              feature.properties?.STREETSEGID === 1967) {
            console.log(`\n🔍 Converting feature:`, {
              STREETSEGID: feature.properties.STREETSEGID,
              type: feature.geometry.type,
              rawCoords: feature.geometry.coordinates,
              flattenedCoords: coords
            });
          }

          return {
            id: index.toString(),
            startPoint: [coords[0][1], coords[0][0]], // Convert [lon, lat] to [lat, lon]
            endPoint: [coords[coords.length - 1][1], coords[coords.length - 1][0]], // Convert [lon, lat] to [lat, lon]
            coordinates: coords,
            length: calculateDistance(
              coords[0][1], coords[0][0], // Convert [lon, lat] to [lat, lon]
              coords[coords.length - 1][1], coords[coords.length - 1][0]
            ),
            properties: feature.properties,
            connectedSegments: [],
            gridCells: []
          };
        });
    console.log('Number of street segments:', segments.length);
    
    // Load and validate safety scores
    const safetyScoresPath = path.join(process.cwd(), 'data', city, 'crime-incidents', 'processed', 'street-safety-scores.geojson');
    console.log('Reading safety scores from:', safetyScoresPath);
    const safetyScoresContent = fs.readFileSync(safetyScoresPath, 'utf-8');
    console.log('Safety scores file size:', safetyScoresContent.length, 'bytes');
    const safetyScores = JSON.parse(safetyScoresContent);
    console.log('Safety scores structure:', Object.keys(safetyScores));
    
    if (!safetyScores.features || !Array.isArray(safetyScores.features)) {
      throw new Error('Invalid safety scores format: missing features array');
    }
    console.log('Number of safety score features:', safetyScores.features.length);

    // Create safety score lookup
    console.log('Creating safety score lookup...');
    console.log('First 5 safety score features:', JSON.stringify(safetyScores.features.slice(0, 5), null, 2));
    const safetyLookup = new Map(
      safetyScores.features.map((f: { properties: { OBJECTID: string; safety_score?: number; normalized_safety_score?: number } }) => {
        const raw = Number(f.properties.safety_score);
        const normalized = Number(f.properties.normalized_safety_score);
        const chosen = !isNaN(normalized) && normalized >= 1 && normalized <= 100 ? normalized : raw;
        return [f.properties.OBJECTID.toString(), chosen];
      })
    );
    console.log('Created safety lookup with', safetyLookup.size, 'entries');

    // Sample some safety scores to verify
    console.log('\nSampling some safety scores:');
    Array.from(safetyLookup.entries()).slice(0, 5).forEach(([id, score]) => {
      console.log(`OBJECTID ${id}: ${score}`);
    });

    // Filter segments for walkability
    console.log('Filtering segments for walkability...');
    const walkableSegments = await filterWalkableSegments(segments);
    console.log(`Filtered to ${walkableSegments.length} walkable segments (removed ${segments.length - walkableSegments.length} non-walkable segments)`);

    // Filter out alleys
    console.log('Filtering out alleys...');
    const nonAlleySegments = walkableSegments.filter((segment: any) => {
      const streetType = segment.properties?.ST_TYPE?.toLowerCase() || '';
      const streetName = segment.properties?.ST_NAME?.toLowerCase() || '';
      const roadType = segment.properties?.ROADTYPE?.toLowerCase() || '';
      
      // Filter out alleys and similar non-street types
      const isAlley = streetType.includes('alley') ||
                     streetName.includes('alley') ||
                     streetType.includes('driveway') ||
                     streetType.includes('private') ||
                     roadType.includes('alley') ||
                     roadType.includes('driveway') ||
                     roadType.includes('private');
      
      return !isAlley;
    });
    console.log(`Filtered out ${walkableSegments.length - nonAlleySegments.length} alley segments`);
    console.log(`Kept ${nonAlleySegments.length} non-alley segments`);

    // Initialize progress bar
    const progressBar = new cliProgress.SingleBar({
      format: 'Building Graph [{bar}] {percentage}% | {value}/{total} segments | ETA: {eta}s',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    console.log('Processing street segments...');
    progressBar.start(nonAlleySegments.length, 0);

    // Process each walkable street segment
    for (const segment of nonAlleySegments) {
      // -----------------------------
      // Dense-node construction: every vertex becomes a node
      // -----------------------------

      // Debug logging for problematic segments
      if (segment.properties?.STREETSEGID === 44 || 
          segment.properties?.STREETSEGID === 203 ||
          segment.properties?.STREETSEGID === 9004 ||
          segment.properties?.STREETSEGID === 1967) {
        console.log(`\n🔍 Processing target segment:`, {
          STREETSEGID: segment.properties.STREETSEGID,
          OBJECTID: segment.properties.OBJECTID,
          coordinates: segment.coordinates,
          type: segment.geometry?.type
        });
      }

      // Support both LineString and MultiLineString geometries
      const parts = Array.isArray(segment.coordinates[0][0])
        ? (segment.coordinates as number[][][])
        : [segment.coordinates as number[][]];

      if (parts.length > 1) {
        console.log(`Found MultiLineString with ${parts.length} parts`);
      }

      const objectId = segment.properties?.OBJECTID?.toString();
      const lookupVal = objectId ? safetyLookup.get(objectId) : undefined;
      const safetyScore: number = typeof lookupVal === 'number' ? lookupVal : 3;

      for (const rawCoords of parts) {
        for (let i = 0; i < rawCoords.length - 1; i++) {
          const [lon1, lat1] = rawCoords[i];
          const [lon2, lat2] = rawCoords[i + 1];
 
          // Create/reuse nodes for both vertices
          const nodeAId = makeNodeId(lat1, lon1);
          const nodeBId = makeNodeId(lat2, lon2);
 
          if (!graph.nodes.has(nodeAId)) {
            graph.nodes.set(nodeAId, { id: nodeAId, lat: lat1, lon: lon1 });
            graph.adjacencyList.set(nodeAId, new Set());
          }
          if (!graph.nodes.has(nodeBId)) {
            graph.nodes.set(nodeBId, { id: nodeBId, lat: lat2, lon: lon2 });
            graph.adjacencyList.set(nodeBId, new Set());
          }
 
          // Bidirectional adjacency
          graph.adjacencyList.get(nodeAId)!.add(nodeBId);
          graph.adjacencyList.get(nodeBId)!.add(nodeAId);
 
          // Edge key in canonical order
          const [firstId, secondId] = [nodeAId, nodeBId].sort();
          const edgeId = `edge_${firstId}_${secondId}`;
 
          // Avoid duplicate short edges
          if (graph.edges.has(edgeId)) continue;
 
          const segLength = calculateDistance(lat1, lon1, lat2, lon2);

          const weights = calculateEdgeWeights(safetyScore, segLength);

          graph.edges.set(edgeId, {
            id: edgeId,
            sourceId: firstId,
            targetId: secondId,
          properties: {
            safety_score: safetyScore,
            length_meters: segLength,
            weights,
            geometry: [ [lat1, lon1], [lat2, lon2] ],
            segmentId: segment.properties.STREETSEGID?.toString()
          }
          });

          // Add to edgeLookup for bidirectional lookups
          const forwardKey = `${firstId}->${secondId}`;
          const reverseKey = `${secondId}->${firstId}`;
          graph.edgeLookup.set(forwardKey, edgeId);
          graph.edgeLookup.set(reverseKey, edgeId);
        }
      }
      // Update progress bar
      progressBar.increment();
    }

    progressBar.stop();

    /* ---------- INTERSECTION SPLIT POST-PROCESS ---------- */
    console.log('\n🔍 Post-processing: splitting at implicit crossings…');

    const CELL = 0.0005; // 55 m grid - finer resolution for better intersection detection
    const cellIndex = new Map<string,string[]>();
    for (const [eid, e] of graph.edges) {
      const g = e.properties.geometry;
      const [lat1, lon1] = g[0];
      const [lat2, lon2] = g[g.length - 1];
      const minLat = Math.min(lat1, lat2), maxLat = Math.max(lat1, lat2);
      const minLon = Math.min(lon1, lon2), maxLon = Math.max(lon1, lon2);
      const minX = Math.floor(minLon / CELL), maxX = Math.floor(maxLon / CELL);
      const minY = Math.floor(minLat / CELL), maxY = Math.floor(maxLat / CELL);
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const key = `${x},${y}`;
          if (!cellIndex.has(key)) cellIndex.set(key, []);
          cellIndex.get(key)!.push(eid);
        }
      }
    }

    function orientation(a:[number,number],b:[number,number],c:[number,number]){return (b[1]-a[1])*(c[0]-b[0])-(b[0]-a[0])*(c[1]-b[1]);}
    function segmentsIntersect(a1:[number,number],a2:[number,number],b1:[number,number],b2:[number,number]){
      // First check if segments are nearly parallel
      const v1x = a2[0]-a1[0], v1y = a2[1]-a1[1];
      const v2x = b2[0]-b1[0], v2y = b2[1]-b1[1];
      const dot = v1x*v2x + v1y*v2y;
      const mag1 = Math.sqrt(v1x*v1x + v1y*v1y);
      const mag2 = Math.sqrt(v2x*v2x + v2y*v2y);
      const angle = Math.acos(dot/(mag1*mag2));
      
      // If nearly parallel, check if they overlap
      if (Math.abs(angle) < 0.1 || Math.abs(angle-Math.PI) < 0.1) {
        const dist = Math.abs((b1[1]-a1[1])*(a2[0]-a1[0]) - (b1[0]-a1[0])*(a2[1]-a1[1])) / mag1;
        return dist < 0.00001; // ~1m tolerance
      }
      
      // Otherwise use standard crossing test
      const o1=orientation(a1,a2,b1), o2=orientation(a1,a2,b2), o3=orientation(b1,b2,a1), o4=orientation(b1,b2,a2);
      return o1*o2<0 && o3*o4<0;
    }

    let splitNodes=0;
    let processedPairs=0;
    const processed = new Set<string>();

    function addNode(lat:number,lon:number){
      const id = makeNodeId(lat, lon);
      if(!graph.nodes.has(id)){
        graph.nodes.set(id,{id,lat,lon});
        graph.adjacencyList.set(id,new Set());
        splitNodes++;
      }
      return id;
    }

    function addEdge(a:string,b:string,geom:[number,number][],score:number){
      const [f,s] = [a,b].sort();
      const id = `edge_${f}_${s}`;
      if(graph.edges.has(id)) return;
      const len = calculateDistance(geom[0][0],geom[0][1],geom[1][0],geom[1][1]);
      graph.edges.set(id,{id,sourceId:f,targetId:s,properties:{safety_score:score,length_meters:len,weights:calculateEdgeWeights(score,len),geometry:geom}});
      graph.adjacencyList.get(f)!.add(s);
      graph.adjacencyList.get(s)!.add(f);
      graph.edgeLookup.set(`${f}->${s}`,id);
      graph.edgeLookup.set(`${s}->${f}`,id);
    }

    for (const ids of cellIndex.values()) {
      for (let i = 0; i < ids.length; i++) {
        const e1 = graph.edges.get(ids[i]);
        if (!e1) continue;
        const g1 = e1.properties.geometry;
        const a1:[number,number]=[g1[0][0],g1[0][1]], a2:[number,number]=[g1[g1.length-1][0],g1[g1.length-1][1]];
        for (let j = i + 1; j < ids.length; j++) {
          const pairKey = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`;
          if (processed.has(pairKey)) continue;
          processed.add(pairKey);
          processedPairs++;
          const e2 = graph.edges.get(ids[j]);
          if (!e2) continue;
          if (e1.sourceId===e2.sourceId||e1.sourceId===e2.targetId||e1.targetId===e2.sourceId||e1.targetId===e2.targetId) continue;
          const g2 = e2.properties.geometry;
          const b1:[number,number]=[g2[0][0],g2[0][1]], b2:[number,number]=[g2[g2.length-1][0],g2[g2.length-1][1]];
          if (!segmentsIntersect(a1,a2,b1,b2)) continue;

          // intersection point
          const denom=(a1[0]-a2[0])*(b1[1]-b2[1])-(a1[1]-a2[1])*(b1[0]-b2[0]);
          if(Math.abs(denom)<1e-12) continue;
          const xi=((a1[0]*a2[1]-a1[1]*a2[0])*(b1[0]-b2[0])-(a1[0]-a2[0])*(b1[0]*b2[1]-b1[1]*b2[0]))/denom;
          const yi=((a1[0]*a2[1]-a1[1]*a2[0])*(b1[1]-b2[1])-(a1[1]-a2[1])*(b1[0]*b2[1]-b1[1]*b2[0]))/denom;

          const nid=addNode(yi,xi);

          // split e1
          addEdge(e1.sourceId,nid,[ [a1[0],a1[1]],[yi,xi] ],e1.properties.safety_score);
          addEdge(nid,e1.targetId,[ [yi,xi],[a2[0],a2[1]] ],e1.properties.safety_score);
          graph.edges.delete(e1.id);

          // split e2
          addEdge(e2.sourceId,nid,[ [b1[0],b1[1]],[yi,xi] ],e2.properties.safety_score);
          addEdge(nid,e2.targetId,[ [yi,xi],[b2[0],b2[1]] ],e2.properties.safety_score);
          graph.edges.delete(e2.id);
        }
      }
    }
    console.log(`✔️  Processed ${processedPairs.toLocaleString()} segment pairs`);
    console.log(`✔️  Found ${splitNodes.toLocaleString()} intersections`);
    
    // Debug problematic segments
    for (const [eid, edge] of graph.edges) {
      const segId = edge.properties?.segmentId;
      if (segId === '44' || segId === '203' || segId === '9004' || segId === '1967') {
        console.log(`\n🔍 Edge ${eid} from segment ${segId}:`, {
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          neighbors: Array.from(graph.adjacencyList.get(edge.sourceId) || [])
        });
      }
    }

    // Save the graph in chunks
    console.log('\nSaving routing graph...');
    const outputDir = path.join(process.cwd(), 'data', city, 'streets', 'processed');
    fs.mkdirSync(outputDir, { recursive: true });
    
    // Save nodes
    const nodesPath = path.join(outputDir, 'routing-graph-nodes.json');
    fs.writeFileSync(nodesPath, JSON.stringify(Array.from(graph.nodes.entries())));
    console.log(`Saved ${graph.nodes.size} nodes`);
    
    // Save edges
    const edgesPath = path.join(outputDir, 'routing-graph-edges.json');
    fs.writeFileSync(edgesPath, JSON.stringify(Array.from(graph.edges.entries())));
    console.log(`Saved ${graph.edges.size} edges`);
    
    // Save adjacency list in chunks
    const adjPath = path.join(outputDir, 'routing-graph-adjacency.json');
    const adjList = Array.from(graph.adjacencyList.entries()).map(([key, value]) => [key, Array.from(value)]);
    fs.writeFileSync(adjPath, JSON.stringify(adjList));
    console.log(`Saved ${adjList.length} adjacency entries`);
    
    // Save edge lookup
    const lookupPath = path.join(outputDir, 'routing-graph-lookup.json');
    fs.writeFileSync(lookupPath, JSON.stringify(Array.from(graph.edgeLookup.entries())));
    console.log(`Saved ${graph.edgeLookup.size} lookup entries`);

    console.log(`\nGraph built successfully with:`);
    console.log(`- ${graph.nodes.size.toLocaleString()} nodes`);
    console.log(`- ${graph.edges.size.toLocaleString()} edges`);
    return graph;

  } catch (error) {
    console.error('Error building routing graph:', error);
    throw error;
  }
}

function calculateEdgeWeights(safetyScore: number, lengthMeters: number): EdgeWeights {
  // Normalize safety score (1-100 → 0-1, inverted since higher safety should mean lower weight)
  const normalizedSafety = 1 - ((safetyScore - 1) / 99);
  
  // Normalize distance using typical block length (~100m) as reference
  const normalizedLength = lengthMeters / 100;

  // Calculate base weights for different priorities
  const quickestWeight = lengthMeters; // Raw distance in meters

  // Pure safety weight – distance does NOT influence this score
  // Lower weight = safer segment
  // Scale to match distance range (multiply by 100 to normalize with meters)
  const safetyOnlyWeight = normalizedSafety * 100;

  // Balanced (optional) – simple average of safety + distance if ever needed
  const balancedWeight = (normalizedSafety + normalizedLength) / 2;

  // Calculate detour variants
  // For detours, we use the safest weight but cap the total distance increase
  const detourWeights = {
    detour5:  safetyOnlyWeight,
    detour10: safetyOnlyWeight,
    detour15: safetyOnlyWeight,
    detour20: safetyOnlyWeight,
    detour25: safetyOnlyWeight,
    detour30: safetyOnlyWeight
  };

  return {
    quickest: quickestWeight,
    balanced: balancedWeight,
    safetyOnly: safetyOnlyWeight,
    ...detourWeights
  };
}

// Execute the graph building
buildRoutingGraph()
  .then(() => console.log('Graph building completed successfully'))
  .catch(error => console.error('Failed to build graph:', error));

export { buildRoutingGraph };
export type { RoutingGraph, GraphNode, GraphEdge }; 