"""Gemeinsame Pfade, Regeln und Hilfsfunktionen für die Pipeline."""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import yaml
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
SYNTHETIC = ROOT / "data" / "synthetic"
PROCESSED.mkdir(parents=True, exist_ok=True)
SYNTHETIC.mkdir(parents=True, exist_ok=True)

RULES = yaml.safe_load((Path(__file__).parent / "rules.yaml").read_text(encoding="utf-8"))
BBOX = RULES["gebiet"]["bbox"]  # lon_min, lat_min, lon_max, lat_max

# EPSG:4326 <-> EPSG:3035 (Zensus-Gitter)
TO_3035 = Transformer.from_crs("EPSG:4326", "EPSG:3035", always_xy=True)
TO_4326 = Transformer.from_crs("EPSG:3035", "EPSG:4326", always_xy=True)


def in_bbox(lon, lat, pad: float = 0.0):
    lon = np.asarray(lon)
    lat = np.asarray(lat)
    return (lon >= BBOX[0] - pad) & (lon <= BBOX[2] + pad) & (lat >= BBOX[1] - pad) & (lat <= BBOX[3] + pad)


def haversine_m(lon1, lat1, lon2, lat2):
    lon1, lat1, lon2, lat2 = map(np.radians, (lon1, lat1, lon2, lat2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * np.arcsin(np.sqrt(a))


def gtfs_time_to_min(t: str) -> float:
    h, m, s = (int(x) for x in t.split(":"))
    return h * 60 + m + s / 60


def zeitfenster_von(minute: float) -> str | None:
    h = minute / 60
    for name, (a, b) in RULES["zeitfenster"].items():
        if a <= h < b:
            return name
    return None


def write_json(path: Path, obj, compact: bool = True):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        if compact:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(obj, f, ensure_ascii=False, indent=2)
    print(f"  → {path.relative_to(ROOT)} ({path.stat().st_size / 1e6:.2f} MB)")


def r(x, n=5):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), n)
