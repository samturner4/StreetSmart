import csv
import ijson
import json
from tqdm import tqdm
from decimal import Decimal

# Input files
lamp_csv = 'data/streetlights/Street_Lights.csv'
geojson_in = 'data/streets/processed/Street_Centerlines_with_length.geojson'
geojson_out = 'data/streets/processed/Street_Centerlines_with_lamp_score.geojson'

# Custom encoder for Decimal
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

# 1. Count lamps per segment
lamp_counts = {}
with open(lamp_csv, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in tqdm(reader, desc='Counting lamps'):
        segid = row.get('STREETSEGMID')
        if segid:
            lamp_counts[segid] = lamp_counts.get(segid, 0) + 1

# 2. Count features for progress bar
with open(geojson_in, 'r', encoding='utf-8') as infile:
    feature_count = sum(1 for _ in ijson.items(infile, 'features.item'))

# 3. Process GeoJSON and add density
with open(geojson_in, 'r', encoding='utf-8') as infile, open(geojson_out, 'w', encoding='utf-8') as outfile:
    outfile.write('{"type": "FeatureCollection", "features": [\n')
    first = True
    for feature in tqdm(ijson.items(infile, 'features.item'), total=feature_count, desc='Processing segments'):
        props = feature['properties']
        segid = str(props.get('STREETSEGID'))
        length = props.get('segment_length_m')
        lamp_count = lamp_counts.get(segid, 0)
        density = lamp_count / length if length and length > 0 else 0
        props['streetlamp_score'] = density
        if not first:
            outfile.write(',\n')
        outfile.write(json.dumps(feature, cls=DecimalEncoder))
        first = False
    outfile.write('\n]}')

print(f'Done! Output written to {geojson_out}') 