import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

export async function GET() {
  try {
    const dataPoints: Array<{ lat: number; lon: number; weight: number }> = [];
    
    // Determine base data directory (handles monorepo layout)
    const baseDataDir =
      fs.existsSync(path.join(process.cwd(), 'data', 'crime-incidents'))
        ? path.join(process.cwd(), 'data')
        : fs.existsSync(path.join(process.cwd(), 'data', 'DC', 'crime-incidents'))
          ? path.join(process.cwd(), 'data', 'DC')
          : path.join(process.cwd(), 'src', 'data');

    // Read 2024 data
    const filePath = path.join(baseDataDir, 'crime-incidents', '2024', 'Crime_Incidents_in_2024.csv');
    console.log('Crime data path:', filePath);
    
    if (!fs.existsSync(filePath)) {
      console.error('Crime data file not found:', filePath);
      return NextResponse.json({ error: `Crime data file not found: ${filePath}` }, { status: 404 });
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });

    console.log(`Processing ${records.length} crime records`);

    for (const record of records) {
      const lat = parseFloat(record.LATITUDE);
      const lon = parseFloat(record.LONGITUDE);
      
      if (!isNaN(lat) && !isNaN(lon)) {
        dataPoints.push({
          lat,
          lon,
          weight: 1
        });
      }
    }

    console.log(`Generated ${dataPoints.length} data points`);
    return NextResponse.json(dataPoints);
  } catch (error) {
    console.error('Error processing crime data:', error);
    return NextResponse.json({ error: 'Failed to process crime data' }, { status: 500 });
  }
} 