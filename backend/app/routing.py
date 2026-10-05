"""Bus-Routing auf dem OSM-Straßennetz, inkl. Baustellen (F3, F7)."""
from __future__ import annotations

import networkx as nx
import numpy as np

from .data import RULES, store, to_xy

EXPRESS_FAKTOR = RULES["bus"]["express_faktor_kfz"]


def _baustellen_effekte(datum: str | None):
    """Liefert {(u,v): faktor oder None=gesperrt} für aktive Baustellen am Datum."""
    eff, aktiv = {}, store().active_baustellen(datum)
    for f in aktiv:
        p = f["properties"]
        for u, v in p["kanten"]:
            for a, b in ((u, v), (v, u)):
                eff[(a, b)] = None if p["wirkung"] == "sperrung" else 1 + p["verzoegerung_pct"] / 100
    return eff, aktiv


def _weight(eff):
    def w(u, v, d):
        if (u, v) in eff:
            f = eff[(u, v)]
            return None if f is None else d["tt"] * f
        return d["tt"]
    return w


def _path_metrics(path, eff):
    G = store().G
    coords, length, tt, betroffen = [], 0.0, 0.0, set()
    for u, v in zip(path[:-1], path[1:]):
        d = G[u][v]
        seg = d["coords"] or [store().node_coord[u], store().node_coord[v]]
        coords.extend(seg if not coords else seg[1:])
        length += d["length"]
        f = eff.get((u, v), 1.0) or 1.0
        tt += d["tt"] * f
        if (u, v) in eff:
            betroffen.add((u, v))
    return coords, length, tt, betroffen


def route(points: list[list[float]], datum: str | None = None) -> dict:
    """Route über alle Punkte (Start, Zwischenhalte, Ziel)."""
    s = store()
    nodes = [s.nearest_node(lon, lat) for lon, lat in points]
    eff, aktiv = _baustellen_effekte(datum)

    def solve(effects):
        full = []
        for a, b in zip(nodes[:-1], nodes[1:]):
            if a == b:
                continue
            p = nx.shortest_path(s.G, a, b, weight=_weight(effects))
            full.extend(p if not full else p[1:])
        return full or nodes[:1]

    try:
        path = solve(eff)
    except nx.NetworkXNoPath:
        path = solve({})
    coords, length, tt, betroffen = _path_metrics(path, eff)

    umgeplant = None
    if aktiv:
        ref = solve({})
        if ref != path:
            _, l0, t0, _ = _path_metrics(ref, {})
            ref_edges = set(zip(ref[:-1], ref[1:]))
            wegen = [f["properties"]["id"] for f in aktiv
                     if any(tuple(k) in ref_edges or tuple(k[::-1]) in ref_edges for k in f["properties"]["kanten"])]
            umgeplant = {"zusatz_min": round((tt - t0) / 60 / EXPRESS_FAKTOR, 1), "zusatz_m": round(length - l0),
                         "wegen": wegen}

    # Baustellen nahe der Route melden (auch umfahrene)
    route_xy = to_xy([c[0] for c in coords], [c[1] for c in coords]) if coords else np.zeros((0, 2))
    nahe = []
    for f in aktiv:
        bc = [c for line in f["geometry"]["coordinates"] for c in line]
        bxy = to_xy([c[0] for c in bc], [c[1] for c in bc])
        if len(route_xy) and np.min(np.linalg.norm(route_xy[::3, None, :] - bxy[None, ::2, :], axis=2)) < 300:
            nahe.append(f["properties"]["id"])

    if umgeplant:
        nahe = list(dict.fromkeys(umgeplant["wegen"] + nahe))
    return {
        "coords": coords,
        "laenge_m": round(length),
        "fahrzeit_min": round(tt / 60 / EXPRESS_FAKTOR, 1),
        "baustellen_nahe": nahe,
        "umgeplant": umgeplant,
    }
