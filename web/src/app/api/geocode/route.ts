import { NextResponse } from 'next/server';

// DC bounding box
const DC_BOUNDS = {
  north: 38.995,
  south: 38.791,
  east: -76.909,
  west: -77.119
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const limit = searchParams.get('limit') || '5';

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
      return NextResponse.json(
        { error: 'Mapbox token not configured' },
        { status: 500 }
      );
    }

    // Add DC bounding box to bias results and proximity to hint location
    const bbox = `${DC_BOUNDS.west},${DC_BOUNDS.south},${DC_BOUNDS.east},${DC_BOUNDS.north}`;
    const proximity = `${(DC_BOUNDS.west + DC_BOUNDS.east) / 2},${(DC_BOUNDS.south + DC_BOUNDS.north) / 2}`;

    // Call Mapbox API
    const baseUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`;
    const baseParams = `access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}&country=US&types=address&limit=${limit}`;

    // 1. Try with bbox and proximity
    let url = `${baseUrl}?bbox=${bbox}&proximity=${proximity}&${baseParams}`;
    console.log('[Geocode] Attempt 1: bbox+proximity');
    console.log('Raw query:', query, '| Length:', query.length);
    console.log('Outgoing URL:', url);
    let response = await fetch(url);
    let data = null;
    if (response.ok) {
      data = await response.json();
    } else if (response.status === 422 || response.status === 400) {
      // 2. Retry with only proximity
      url = `${baseUrl}?proximity=${proximity}&${baseParams}`;
      console.log('[Geocode] Attempt 2: proximity only');
      console.log('Raw query:', query, '| Length:', query.length);
      console.log('Outgoing URL:', url);
      response = await fetch(url);
      if (response.ok) {
        data = await response.json();
      } else if (response.status === 422 || response.status === 400) {
        // 3. Retry with neither bbox nor proximity
        url = `${baseUrl}?${baseParams}`;
        console.log('[Geocode] Attempt 3: no bbox, no proximity');
        console.log('Raw query:', query, '| Length:', query.length);
        console.log('Outgoing URL:', url);
        response = await fetch(url);
        if (response.ok) {
          data = await response.json();
        } else {
          // All attempts failed
          console.error('Mapbox API error (all attempts):', await response.text());
          return NextResponse.json(
            { error: 'Geocoding service error (all attempts failed)' },
            { status: response.status }
          );
        }
      } else {
        // Only proximity failed with other error
        console.error('Mapbox API error (proximity only):', await response.text());
        return NextResponse.json(
          { error: 'Geocoding service error (proximity only)' },
          { status: response.status }
        );
      }
    } else {
      // bbox+proximity failed with other error
      console.error('Mapbox API error (bbox+proximity):', await response.text());
      return NextResponse.json(
        { error: 'Geocoding service error (bbox+proximity)' },
        { status: response.status }
      );
    }

    // Filter results to ensure they're within DC
    if (data.features) {
      data.features = data.features.filter((f: any) => {
        const [lon, lat] = f.center;
        return lat >= DC_BOUNDS.south && 
               lat <= DC_BOUNDS.north && 
               lon >= DC_BOUNDS.west && 
               lon <= DC_BOUNDS.east;
      });
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error('Geocoding error:', error);
    return NextResponse.json(
      { error: 'Failed to process geocoding request' },
      { status: 500 }
    );
  }
} 