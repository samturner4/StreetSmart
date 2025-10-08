import fs from 'fs';
import path from 'path';

const geoPath = path.resolve(__dirname, '../../data/DC/crime-incidents/processed/street-safety-scores.geojson');
const geo = JSON.parse(fs.readFileSync(geoPath, 'utf8')) as any;

interface Row {
  OBJECTID: number;
  ST_NAME: string;
  QUADRANT: string;
  weighted_crime_score: number;
  crime_count: number;
  safety_score: number;
}

const rows: Row[] = geo.features.map((f: any) => ({
  OBJECTID: f.properties.OBJECTID,
  ST_NAME: f.properties.ST_NAME,
  QUADRANT: f.properties.QUADRANT,
  weighted_crime_score: f.properties.weighted_crime_score,
  crime_count: f.properties.crime_count,
  safety_score: f.properties.safety_score,
}));

const scores = rows.map(r => r.weighted_crime_score).filter(n => !isNaN(n)).sort((a,b)=>a-b);
const n = scores.length;
const sum = scores.reduce((a,b)=>a+b,0);
function quantile(p:number){
  const pos=(n-1)*p; const base=Math.floor(pos); const rest=pos-base;
  return rest===0? scores[base]: scores[base]+rest*(scores[base+1]-scores[base]);
}
const stats = {
  count: n,
  min: scores[0],
  q1: quantile(0.25),
  median: quantile(0.5),
  q3: quantile(0.75),
  max: scores[n-1],
  mean: sum/n,
  stddev: Math.sqrt(scores.reduce((a,v)=>a+(v-sum/n)**2,0)/n),
  zeroCrimeSegments: rows.filter(r=>r.crime_count===0).length,
};
console.log('Weighted crime score descriptive stats');
console.table(stats);

// Show top and bottom 10 segments by weighted score
console.log('\nTop 10 most dangerous segments (by weighted score)');
rows.sort((a,b)=>b.weighted_crime_score-a.weighted_crime_score).slice(0,10).forEach(r=>{
  console.log(`#${r.OBJECTID} ${r.ST_NAME} ${r.QUADRANT} : ${r.weighted_crime_score.toFixed(1)} (safety_score ${r.safety_score})`);
});
console.log('\nTop 10 safest non-zero segments');
rows.filter(r=>r.weighted_crime_score>0).sort((a,b)=>a.weighted_crime_score-b.weighted_crime_score).slice(0,10).forEach(r=>{
  console.log(`#${r.OBJECTID} ${r.ST_NAME} ${r.QUADRANT} : ${r.weighted_crime_score.toFixed(1)} (safety_score ${r.safety_score})`);
});

