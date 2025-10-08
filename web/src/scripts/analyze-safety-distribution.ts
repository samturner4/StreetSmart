import fs from 'fs';
import path from 'path';

// Path to generated GeoJSON with safety scores
const geojsonPath = path.resolve(__dirname, '../../data/DC/crime-incidents/processed/street-safety-scores.geojson');

if (!fs.existsSync(geojsonPath)) {
  console.error('GeoJSON not found:', geojsonPath);
  process.exit(1);
}

interface Feature {
  properties: { safety_score?: number };
}

const data = JSON.parse(fs.readFileSync(geojsonPath, 'utf8')) as { features: Feature[] };
const scores = data.features.map(f => f.properties.safety_score ?? 0).filter(s => !isNaN(s));

if (scores.length === 0) {
  console.error('No safety_score values found');
  process.exit(1);
}

scores.sort((a, b) => a - b);
const n = scores.length;
const sum = scores.reduce((a, b) => a + b, 0);

function quantile(p: number) {
  const pos = (n - 1) * p;
  const base = Math.floor(pos);
  const rest = pos - base;
  return rest === 0 ? scores[base] : scores[base] + rest * (scores[base + 1] - scores[base]);
}

const stats = {
  count: n,
  min: scores[0],
  q1: quantile(0.25),
  median: quantile(0.5),
  q3: quantile(0.75),
  max: scores[n - 1],
  mean: sum / n,
  stddev: Math.sqrt(scores.reduce((acc, v) => acc + (v - sum / n) ** 2, 0) / n),
  zeroCrime: scores.filter(s => s === 100).length,
};

console.log('=== Safety Score Descriptive Statistics ===');
console.table(stats);

// Buckets of 10
const buckets = Array(10).fill(0);
for (const s of scores) {
  let idx = Math.floor((s - 1) / 10);
  if (idx < 0) idx = 0;
  if (idx > 9) idx = 9;
  buckets[idx]++;
}
console.log('\n=== Histogram (bucket size 10) ===');
for (let i = 0; i < 10; i++) {
  const start = i * 10 + 1;
  const end = (i + 1) * 10;
  const count = buckets[i];
  const pct = ((count / n) * 100).toFixed(1);
  console.log(`${start}-${end}: ${count} (${pct}%)`);
}

// Deciles
console.log('\n=== Deciles ===');
for (let i = 1; i <= 9; i++) {
  const p = i / 10;
  console.log(`${i * 10}%: ${quantile(p).toFixed(2)}`);
}

