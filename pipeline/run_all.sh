#!/usr/bin/env bash
# Komplette Datenpipeline: Downloads (falls fehlend) + Aufbereitung
set -euo pipefail
cd "$(dirname "$0")"
RAW=../data/raw; mkdir -p "$RAW"
[ -f "$RAW/GTFS.zip" ] || curl -L -o "$RAW/GTFS.zip" https://www.vgn.de/opendata/GTFS.zip
[ -d "$RAW/gtfs" ] || unzip -oq "$RAW/GTFS.zip" -d "$RAW/gtfs"
if [ ! -f "$RAW/Zensus2022_Bevoelkerungszahl_100m-Gitter.csv" ]; then
  curl -L -o "$RAW/zensus.zip" https://www.destatis.de/static/DE/zensus/gitterdaten/Zensus2022_Bevoelkerungszahl.zip
  unzip -oq "$RAW/zensus.zip" Zensus2022_Bevoelkerungszahl_100m-Gitter.csv -d "$RAW"
fi
[ -f "$RAW/Nuernberg.osm.pbf" ] || curl -L -o "$RAW/Nuernberg.osm.pbf" https://download.bbbike.org/osm/bbbike/Nuernberg/Nuernberg.osm.pbf
python 10_gtfs.py
python 20_grid.py
python 30_roads.py
python 40_synthetic.py --seed "${SEED:-42}"
echo "Pipeline fertig."
