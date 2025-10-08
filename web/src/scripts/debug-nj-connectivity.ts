import fs from 'fs';
import path from 'path';

const TARGET_IDS = new Set<string>(['8194', '9365', '29369']);

(async () => {
  const graphPath = path.join(process.cwd(), 'data/streets/processed/routing-graph.json');
  if (!fs.existsSync(graphPath)) {
    console.error('Graph file not found. Please build the routing graph first.');
    return;
  }
  console.log('Loading routing graph from disk...');
  const graphData = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));

  // Create lookup maps
  const nodeMap = new Map<string, { lat: number; lon: number }>(graphData.nodes);
  const edgeMap: Array<[string, any]> = graphData.edges;

  // Find edges corresponding to target OBJECTID (stored inside properties?)
  const matches = edgeMap.filter(([edgeId, edge]) => {
    return TARGET_IDS.has(String(edge?.properties?.OBJECTID));
  });

  if (matches.length === 0) {
    console.log('No edges with OBJECTID in properties. Searching in properties of original index...');
  }

  // Instead, we will load street segments directly and compute their node ids to look up in adjacency.
  const streetGeo = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/streets/Street_Centerlines.geojson'), 'utf-8'));
  const targetFeatures = streetGeo.features.filter((f: any) => TARGET_IDS.has(String(f.properties?.OBJECTID)));
  console.log(`Found ${targetFeatures.length} target street centerline features`);

  const endpointsIds = [] as string[];
  for (const feat of targetFeatures) {
    const coords = feat.geometry.coordinates;
    const startId = `node_${coords[0][1]}_${coords[0][0]}`;
    const endId = `node_${coords[coords.length - 1][1]}_${coords[coords.length - 1][0]}`;
    endpointsIds.push(startId, endId);
    console.log('Segment', feat.properties.OBJECTID, 'node ids', startId, endId);
  }

  // Check if these nodes exist in graph
  let missing = 0;
  for (const nid of endpointsIds) {
    if (!nodeMap.has(nid)) {
      console.log('Node missing in graph:', nid);
      missing++;
    }
  }
  console.log('Missing nodes:', missing, 'out of', endpointsIds.length);
})(); 