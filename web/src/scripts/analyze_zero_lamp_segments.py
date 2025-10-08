import csv
import ijson
from collections import Counter
from tqdm import tqdm

lamp_csv = 'data/streetlights/Street_Lights.csv'
geojson_in = 'data/streets/processed/Street_Centerlines_with_lamp_score.geojson'

# 1. Analyze streetlamp data
print("Analyzing streetlamp data...")
lamp_segments = set()
lamp_counts = Counter()
with open(lamp_csv, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in tqdm(reader, desc="Reading streetlamps"):
        segid = row.get('STREETSEGMID')
        if segid:
            lamp_segments.add(segid)
            lamp_counts[segid] += 1

# 2. Analyze street segments
print("\nAnalyzing street segments...")
street_segments = set()
zero_lamp_segments = []
with open(geojson_in, 'r', encoding='utf-8') as f:
    for feature in tqdm(ijson.items(f, 'features.item'), desc="Reading segments"):
        props = feature['properties']
        segid = str(props.get('STREETSEGID'))
        street_segments.add(segid)
        if props.get('streetlamp_score', 0) == 0:
            street_name = props.get('FULLNAME', 'Unknown')
            length = props.get('segment_length_m', 0)
            zero_lamp_segments.append((segid, street_name, length))

# 3. Print analysis
print("\nAnalysis Results:")
print(f"Total unique segments with lamps: {len(lamp_segments)}")
print(f"Total street segments in GeoJSON: {len(street_segments)}")
print(f"Segments with zero lamps: {len(zero_lamp_segments)}")
print(f"Segments in GeoJSON but not in lamp data: {len(street_segments - lamp_segments)}")
print(f"Segments in lamp data but not in GeoJSON: {len(lamp_segments - street_segments)}")

# 4. Sample of zero-lamp segments
print("\nSample of segments with zero lamps (showing 10):")
print("SegID, Street Name, Length (m)")
for segid, name, length in sorted(zero_lamp_segments[:10], key=lambda x: x[2], reverse=True):
    print(f"{segid}, {name}, {length:.1f}m")

# 5. Distribution of lamp counts
print("\nDistribution of lamps per segment:")
counts = Counter(lamp_counts.values())
for count in sorted(counts.keys())[:5]:
    print(f"{count} lamp(s): {counts[count]} segments")
print("...")
for count in sorted(counts.keys())[-5:]:
    print(f"{count} lamp(s): {counts[count]} segments") 