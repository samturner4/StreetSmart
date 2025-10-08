const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Simple logger to debug.log
const log = msg => fs.appendFileSync('debug.log', `${new Date().toISOString()} | ${msg}\n`);

log('Script start');
const dataDir = path.join(__dirname, 'nationaldata', 'MSAdata', 'NationalCityData');
if (!fs.existsSync(dataDir)) {
  log('Data directory missing: ' + dataDir);
  process.exit(1);
}

const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.csv') && f !== 'AllCities.csv' && !f.includes('cs-en-us'));
log(`Found ${files.length} CSV files`);

const cities = [];
files.forEach((file, idx) => {
  const stateName = file.replace('.csv','').replace(/_/g,' ').toUpperCase();
  const fp = path.join(dataDir, file);
  const content = fs.readFileSync(fp, 'utf8');
  const records = parse(content,{columns:true,skip_empty_lines:true,trim:true});
  records.forEach(rec=>{
    if(!rec.City || rec.City.includes('Table') || rec.City.includes('Offenses') || rec.City.includes('by City')) return;
    const pop = parseInt((rec.Population||'0').replace(/[,"']/g,''));
    if(!pop) return;
    const num=(v)=>parseInt((v||'0').replace(/[,"']/g,''))||0;
    cities.push({
      city: rec.City.trim(),
      state: stateName,
      population: pop,
      violent_crime:num(rec['Violent\ncrime']||rec['Violent crime']),
      murder:num(rec['Murder and\nnonnegligent\nmanslaughter']||rec['Murder and nonnegligent manslaughter']),
      rape:num(rec['Rape1']),
      robbery:num(rec['Robbery']),
      aggravated_assault:num(rec['Aggravated\nassault']||rec['Aggravated assault']),
      property_crime:num(rec['Property\ncrime']||rec['Property crime']),
      burglary:num(rec['Burglary']),
      larceny_theft:num(rec['Larceny-\ntheft']||rec['Larceny-theft']),
      motor_vehicle_theft:num(rec['Motor\nvehicle\ntheft']||rec['Motor vehicle theft']),
      arson:num(rec['Arson'])
    });
  });
  if((idx+1)%10===0) log(`Processed ${idx+1}/${files.length} files`);
});

cities.sort((a,b)=>b.population-a.population);
const top=cities.slice(0,200);
log(`Total cities processed ${cities.length}, writing top 200`);
const header='City,State,Population,"Violent crime","Murder and nonnegligent manslaughter",Rape1,Robbery,"Aggravated assault","Property crime",Burglary,"Larceny-theft","Motor vehicle theft",Arson\n';
const rows=top.map(c=>`"${c.city}","${c.state}","${c.population}",${c.violent_crime},${c.murder},${c.rape},${c.robbery},${c.aggravated_assault},${c.property_crime},${c.burglary},${c.larceny_theft},${c.motor_vehicle_theft},${c.arson}`).join('\n');
fs.writeFileSync(path.join(__dirname,'nationaldata','AllCitiesData.csv'),header+rows);
log('CSV written');
