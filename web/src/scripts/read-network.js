const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'data/streets/processed/street-network.json');
const content = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(content);

console.log('File structure:', Object.keys(data));
console.log('Type of segments:', typeof data.segments);
console.log('Is array?', Array.isArray(data.segments));
console.log('First few keys in segments:', Object.keys(data.segments).slice(0, 5));

// Get first segment
const firstSegmentId = Object.keys(data.segments)[0];
console.log('\nFirst segment structure:', JSON.stringify(data.segments[firstSegmentId], null, 2)); 