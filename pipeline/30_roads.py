"""30 · Straßennetz für Bus-Routing aus OSM (BBBike-Extrakt Nürnberg, ODbL).

Eingabe : data/raw/Nuernberg.osm.pbf  (https://download.bbbike.org/osm/bbbike/Nuernberg/)
Ausgabe : data/processed/roads.json  (Knoten + Kanten mit Länge, Geschwindigkeit, Geometrie)
"""
from __future__ import annotations

import osmium
import osmnx as ox

from common import BBOX, PROCESSED, RAW, write_json

DRIVE = {"motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary",
         "secondary_link", "tertiary", "tertiary_link", "unclassified", "residential", "living_street"}
PAD = 0.01
TMP_XML = RAW / "roads_drive.osm"


def inside(lon, lat):
    return BBOX[0] - PAD <= lon <= BBOX[2] + PAD and BBOX[1] - PAD <= lat <= BBOX[3] + PAD


class WayPass(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = {}
        self.node_ids = set()

    def way(self, w):
        hw = w.tags.get("highway")
        if hw not in DRIVE or w.tags.get("access") in ("no", "private"):
            return
        refs = [n.ref for n in w.nodes]
        self.ways[w.id] = (refs, dict(w.tags))
        self.node_ids.update(refs)


class NodePass(osmium.SimpleHandler):
    def __init__(self, wanted):
        super().__init__()
        self.wanted = wanted
        self.coords = {}

    def node(self, n):
        if n.id in self.wanted and n.location.valid():
            self.coords[n.id] = (n.location.lon, n.location.lat)


def write_xml(ways, coords):
    keep_nodes = {k: v for k, v in coords.items() if inside(*v)}
    with open(TMP_XML, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<osm version="0.6">\n')
        for nid, (lon, lat) in keep_nodes.items():
            f.write(f'<node id="{nid}" lat="{lat:.7f}" lon="{lon:.7f}"/>\n')
        for wid, (refs, tags) in ways.items():
            refs = [r for r in refs if r in keep_nodes]
            if len(refs) < 2:
                continue
            f.write(f'<way id="{wid}">')
            f.write("".join(f'<nd ref="{r}"/>' for r in refs))
            for k, v in tags.items():
                v = v.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")
                k = k.replace("&", "&amp;").replace('"', "&quot;")
                f.write(f'<tag k="{k}" v="{v}"/>')
            f.write("</way>\n")
        f.write("</osm>\n")


def main():
    print("30 · Straßennetz")
    wp = WayPass()
    wp.apply_file(str(RAW / "Nuernberg.osm.pbf"))
    npass = NodePass(wp.node_ids)
    npass.apply_file(str(RAW / "Nuernberg.osm.pbf"), locations=False)
    write_xml(wp.ways, npass.coords)

    G = ox.graph_from_xml(TMP_XML, simplify=True, retain_all=False)
    G = ox.truncate.largest_component(G, strongly=True)
    G = ox.add_edge_speeds(G)       # maxspeed bzw. Mittelwert je Straßentyp
    G = ox.add_edge_travel_times(G)
    print(f"  Graph: {len(G.nodes):,} Knoten, {len(G.edges):,} Kanten")

    nodes = {str(n): [round(d["x"], 6), round(d["y"], 6)] for n, d in G.nodes(data=True)}
    edges = []
    for u, v, d in G.edges(data=True):
        hw = d.get("highway")
        hw = hw[0] if isinstance(hw, list) else hw
        name = d.get("name")
        name = name[0] if isinstance(name, list) else name
        geom = d.get("geometry")
        coords = [[round(x, 6), round(y, 6)] for x, y in geom.coords] if geom is not None else None
        edges.append([str(u), str(v), round(d["length"], 1), round(d["speed_kph"], 1), hw, name or "", coords])
    write_json(PROCESSED / "roads.json", {
        "fields": ["u", "v", "length_m", "speed_kph", "highway", "name", "coords"],
        "nodes": nodes, "edges": edges,
    })
    TMP_XML.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
