"""Lädt alle aufbereiteten Daten einmal beim Start (data/processed + data/synthetic)."""
from __future__ import annotations

import datetime as dt
import json
from functools import cached_property
from pathlib import Path

import networkx as nx
import numpy as np
import pandas as pd
import yaml
from pyproj import Transformer
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
PROCESSED = ROOT / "data" / "processed"
SYNTHETIC = ROOT / "data" / "synthetic"
RULES = yaml.safe_load((ROOT / "pipeline" / "rules.yaml").read_text(encoding="utf-8"))

_TO_3035 = Transformer.from_crs("EPSG:4326", "EPSG:3035", always_xy=True)


def to_xy(lon, lat):
    x, y = _TO_3035.transform(np.asarray(lon, dtype=float), np.asarray(lat, dtype=float))
    return np.c_[np.atleast_1d(x), np.atleast_1d(y)]


def load_json(p: Path):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def wochentag_typ(datum: str | None) -> str:
    if not datum:
        return "werktag"
    wd = dt.date.fromisoformat(datum).weekday()
    return "samstag" if wd == 5 else "sonntag" if wd == 6 else "werktag"


class DataStore:
    def __init__(self):
        self.stations = load_json(PROCESSED / "stations.json")
        self.rail_lines = load_json(PROCESSED / "rail_lines.json")
        self.bus_lines = load_json(PROCESSED / "bus_lines.json")
        self.grid_raw = load_json(PROCESSED / "grid.json")
        self.grid_kpi = load_json(PROCESSED / "grid_kpi.json")
        self.hotspots = load_json(PROCESSED / "hotspots.json")
        self.baseline = load_json(SYNTHETIC / "baseline.json")
        self.linien = {l["linie"]: l for l in load_json(SYNTHETIC / "linien.json")}
        self.events = yaml.safe_load((SYNTHETIC / "events.yaml").read_text(encoding="utf-8"))
        self.baustellen = load_json(SYNTHETIC / "baustellen_fiktiv.geojson")["features"]

        # Raster als numpy: lon, lat, einwohner, fussweg_schiene_m, fussweg_bus_m, zeit_bis_schiene_min, score, gemeinde
        self.grid = np.array(self.grid_raw["cells"], dtype=float)
        self.grid_xy = to_xy(self.grid[:, 0], self.grid[:, 1])
        self.grid_tree = cKDTree(self.grid_xy)

        self.st_df = pd.DataFrame(self.stations)
        self.rail_df = self.st_df[self.st_df.is_rail].reset_index(drop=True)
        self.rail_xy = to_xy(self.rail_df.lon, self.rail_df.lat)
        self.rail_tree = cKDTree(self.rail_xy)
        self.station_by_id = {s["id"]: s for s in self.stations}

        trips = pd.read_csv(PROCESSED / "bus_trips.csv", dtype={"linie": str})
        aus = pd.read_csv(SYNTHETIC / "auslastung.csv", dtype={"linie": str})
        self.trips = trips.merge(aus.drop(columns=["linie", "stunde"]), on="trip_id")
        self._build_graph()

    # ---------- Straßengraph ----------
    def _build_graph(self):
        roads = load_json(PROCESSED / "roads.json")
        self.node_coord = {k: tuple(v) for k, v in roads["nodes"].items()}
        G = nx.DiGraph()
        for u, v, length, speed, hw, name, coords in roads["edges"]:
            tt = length / (max(speed, 10) / 3.6)
            if G.has_edge(u, v) and G[u][v]["tt"] <= tt:
                continue
            G.add_edge(u, v, length=length, tt=tt, hw=hw, name=name, coords=coords)
        self.G = G
        ids = list(self.node_coord)
        self.node_ids = np.array(ids)
        arr = np.array([self.node_coord[i] for i in ids])
        self.node_tree = cKDTree(to_xy(arr[:, 0], arr[:, 1]))

    def nearest_node(self, lon: float, lat: float) -> str:
        _, i = self.node_tree.query(to_xy(lon, lat)[0])
        return str(self.node_ids[i])

    def active_baustellen(self, datum: str | None):
        if not datum:
            return []
        return [f for f in self.baustellen if f["properties"]["von"] <= datum <= f["properties"]["bis"]]

    @cached_property
    def hubs(self):
        return self.rail_df.sort_values("hub_score", ascending=False)


STORE: DataStore | None = None


def store() -> DataStore:
    global STORE
    if STORE is None:
        STORE = DataStore()
    return STORE
