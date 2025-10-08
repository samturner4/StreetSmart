import geojson
from geopy.distance import geodesic
import json

# Load street centerlines
with open('data/streets/Street_Centerlines.geojson', 'r') as f:
    streets = geojson.load(f)

def linestring_length(coords):
    return sum(
        geodesic((lat1, lon1), (lat2, lon2)).meters
        for (lon1, lat1), (lon2, lat2) in zip(coords[:-1], coords[1:])
    )

for feature in streets['features']:
    geom = feature['geometry']
    length_m = 0
    if geom['type'] == 'LineString':
        length_m = linestring_length(geom['coordinates'])
    elif geom['type'] == 'MultiLineString':
        for part in geom['coordinates']:
            length_m += linestring_length(part)
    feature['properties']['segment_length_m'] = length_m

with open('data/streets/processed/Street_Centerlines_with_length.geojson', 'w') as f:
    json.dump(streets, f)

print('Done! Output written to data/streets/processed/Street_Centerlines_with_length.geojson') 