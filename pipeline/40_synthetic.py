"""40 · Synthetischer Datensatz (reproduzierbar per Seed): Auslastung, Umläufe, Busse, Fahrer, Events, Baustellen.

Es liegen keine internen VAG-Daten vor. Alles hier ist FIKTIV, orientiert sich aber am echten
Fahrplan (GTFS) und an echten Einwohnern (Zensus). In der UI als "synthetisch" kennzeichnen.

Aufruf: python 40_synthetic.py --seed 42 --fahrer-ausfall 0.06 --busse-reserve 0.08
"""
from __future__ import annotations

import argparse
import json
import math

import numpy as np
import pandas as pd
import yaml
from scipy.spatial import cKDTree

from common import PROCESSED, RULES, SYNTHETIC, TO_3035, write_json

# Tagesganglinie Anteil Wege je Stunde (angelehnt an MiD-Werktagsprofil, vereinfacht)
TAGESGANG = {5: .02, 6: .05, 7: .09, 8: .08, 9: .05, 10: .045, 11: .05, 12: .06, 13: .065, 14: .065,
             15: .07, 16: .08, 17: .08, 18: .06, 19: .04, 20: .03, 21: .02, 22: .015, 23: .01}

EVENTS = [
    {"id": "e1", "name": "Heimspiel Fußball (fiktiv)", "venue": "Max-Morlock-Stadion", "lon": 11.1255, "lat": 49.4263,
     "datum": "2026-10-17", "beginn": "15:30", "ende": "17:20", "besucher": 45000, "kategorie": "Sport"},
    {"id": "e2", "name": "Konzert Arena (fiktiv)", "venue": "Arena Nürnberg", "lon": 11.1182, "lat": 49.4236,
     "datum": "2026-10-15", "beginn": "20:00", "ende": "22:30", "besucher": 7500, "kategorie": "Konzert"},
    {"id": "e3", "name": "Messe-Publikumstag (fiktiv)", "venue": "Messe Nürnberg", "lon": 11.1168, "lat": 49.4141,
     "datum": "2026-10-14", "beginn": "09:00", "ende": "18:00", "besucher": 30000, "kategorie": "Messe"},
    {"id": "e4", "name": "Herbstvolksfest (fiktiv)", "venue": "Volksfestplatz", "lon": 11.1150, "lat": 49.4325,
     "datum": "2026-10-16", "beginn": "17:00", "ende": "23:00", "besucher": 25000, "kategorie": "Volksfest"},
    {"id": "e5", "name": "Open-Air Zeppelinfeld (fiktiv)", "venue": "Zeppelinfeld", "lon": 11.1228, "lat": 49.4337,
     "datum": "2026-10-24", "beginn": "18:00", "ende": "23:00", "besucher": 40000, "kategorie": "Konzert"},
    {"id": "e6", "name": "Christkindlesmarkt-Eröffnung (fiktiv)", "venue": "Hauptmarkt", "lon": 11.0775, "lat": 49.4540,
     "datum": "2026-11-27", "beginn": "17:30", "ende": "22:00", "besucher": 20000, "kategorie": "Markt"},
]


def xy(lon, lat):
    x, y = TO_3035.transform(np.asarray(lon), np.asarray(lat))
    return np.c_[x, y]


def _korridor_kanten(roads, cells, stations, n=3):
    """Kanten auf kürzesten Wegen von unterversorgten Schwerpunkten zum nächsten großen Knoten."""
    import networkx as nx
    nodes = roads["nodes"]
    G = nx.DiGraph()
    edge = {}
    for u, v, length, speed, hw, name, coords in roads["edges"]:
        G.add_edge(u, v, tt=length / (max(speed, 10) / 3.6))
        edge[(u, v)] = (u, v, length, speed, hw, name, coords)
    ids = list(nodes)
    ntree = cKDTree(xy([nodes[i][0] for i in ids], [nodes[i][1] for i in ids]))
    hs = json.load(open(PROCESSED / "hotspots.json", encoding="utf-8"))
    hubs = stations[stations.is_rail & (stations.rail_deps_h >= 8)]
    hxy = xy(hubs.lon.values, hubs.lat.values)
    chosen = {}
    # Hotspots mit den längsten Wegen zuerst (dort lohnt Express am meisten)
    for hsp in sorted(hs, key=lambda h: -h["zeit_bis_schiene_min"]):
        if len(chosen) >= n:
            break
        p0 = xy(hsp["lon"], hsp["lat"])[0]
        d = np.linalg.norm(hxy - p0, axis=1)
        rang = d * 1.35 / 400 - 12 * hubs.hub_score.values  # wie backend/app/express.py
        h = int(np.argmin(np.where(d > 300, rang, 1e9)))
        a = ids[ntree.query(p0)[1]]
        b = ids[ntree.query(hxy[h])[1]]
        try:
            path = nx.shortest_path(G, a, b, weight="tt")
        except nx.NetworkXNoPath:
            continue
        es = [edge[(u, v)] for u, v in zip(path[:-1], path[1:])]
        mid = [e for e in es[len(es) // 4: 3 * len(es) // 4] if e[5] and e[2] > 80 and e[4] not in ("motorway", "motorway_link")]
        if mid and mid[0][5] not in chosen:
            k = es.index(mid[0])
            chosen[mid[0][5]] = [e for e in es[k:k + 3] if e[5] == mid[0][5]] or [mid[0]]
    return chosen


def main(seed: int, ausfall: float, reserve: float):
    print(f"40 · Synthetisch (seed={seed})")
    rng = np.random.default_rng(seed)
    bus_cfg = RULES["bus"]
    trips = pd.read_csv(PROCESSED / "bus_trips.csv")
    stations = pd.DataFrame(json.load(open(PROCESSED / "stations.json", encoding="utf-8"))).set_index("id")
    grid = json.load(open(PROCESSED / "grid.json"))
    cells = np.array(grid["cells"])

    # Einzugsbereich je Station (Einwohner im 400-m-Radius)
    cell_xy = xy(cells[:, 0], cells[:, 1])
    st_xy = xy(stations.lon.values, stations.lat.values)
    tree = cKDTree(cell_xy)
    stations["einw_400m"] = [cells[idx, 2].sum() for idx in tree.query_ball_point(st_xy, 400)]
    rail_xy = st_xy[stations.is_rail.values]
    d_rail, _ = cKDTree(rail_xy).query(st_xy)
    stations["nahe_schiene"] = d_rail * RULES["fusswege"]["umwegfaktor"] <= 600

    trips["halte_list"] = trips.halte.str.split("|")
    trips["stunde"] = (trips.start_min // 60).astype(int)

    # Boardings je Halt/Tag ∝ Einzugsbereich; schienennahe Halte verlieren Fahrgäste an die Schiene
    stations["boardings_tag"] = stations.einw_400m * 0.18 * np.where(stations.nahe_schiene, 0.6, 1.0)
    exploded = trips[["trip_id", "stunde", "halte_list"]].explode("halte_list")
    per_stop_hour = exploded.groupby(["halte_list", "stunde"]).size()
    exploded["n_fahrten"] = per_stop_hour.loc[list(zip(exploded.halte_list, exploded.stunde))].values
    exploded["b_tag"] = exploded.halte_list.map(stations.boardings_tag).fillna(0)
    exploded["anteil"] = exploded.stunde.map(TAGESGANG).fillna(0.005)
    exploded["einsteiger"] = exploded.b_tag * exploded.anteil / exploded.n_fahrten
    pax = exploded.groupby("trip_id").einsteiger.sum()
    trips["fahrgaeste"] = (trips.trip_id.map(pax) * rng.lognormal(0, 0.25, len(trips))).round().astype(int)
    trips["anteil_schienenparallel"] = trips.halte_list.map(
        lambda hs: float(np.mean([bool(stations.nahe_schiene.get(h, False)) for h in hs]))).round(2)

    linie_pax = trips.groupby("linie").fahrgaeste.mean()
    trips["fahrzeugtyp"] = np.where(trips.linie.map(linie_pax) > linie_pax.median(), "Gelenk", "Solo")
    trips["plaetze"] = trips.fahrzeugtyp.map(bus_cfg["plaetze"])
    trips["max_besetzung"] = (trips.fahrgaeste * 0.55).round().astype(int)
    trips["auslastung_pct"] = (100 * trips.max_besetzung / trips.plaetze).clip(0, 140).round(0)
    trips[["trip_id", "linie", "stunde", "fahrgaeste", "max_besetzung", "auslastung_pct", "fahrzeugtyp",
           "anteil_schienenparallel"]].to_csv(SYNTHETIC / "auslastung.csv", index=False)

    # Linien: dichtes Gebiet? (für Mindesttakt nach Nahverkehrsplan)
    linien = []
    for name, g in trips.groupby("linie"):
        halte = set(h for hs in g.halte_list for h in hs)
        einw = stations.loc[[h for h in halte if h in stations.index], "einw_400m"].mean()
        linien.append({"linie": str(name), "einw_400m_mittel": round(float(einw), 0),
                       "gebiet": "dicht" if einw >= RULES["mindesttakt_min"]["dicht_ab_einwohner_400m"] else "locker"})
    write_json(SYNTHETIC / "linien.json", linien, compact=False)

    # Umläufe: Fahrten je Linie greedy verketten (Wendezeit ≥ Minimum)
    wende = bus_cfg["wendezeit_min"]
    umlauf_rows, n_umlauf = [], 0
    for name, g in trips.sort_values("start_min").groupby("linie"):
        frei = []  # (frei_ab, umlauf_id)
        for t in g.itertuples():
            frei.sort()
            if frei and frei[0][0] <= t.start_min:
                _, uid = frei.pop(0)
            else:
                n_umlauf += 1
                uid = f"U{n_umlauf:04d}"
            umlauf_rows.append((uid, t.trip_id, t.linie, t.start_min, t.ende_min))
            frei.append((t.ende_min + wende, uid))
    uml = pd.DataFrame(umlauf_rows, columns=["umlauf_id", "trip_id", "linie", "start_min", "ende_min"])
    uml.to_csv(SYNTHETIC / "umlaeufe.csv", index=False)

    # Fahrzeugbedarf Spitze = max. gleichzeitig aktive Umläufe
    span = uml.groupby("umlauf_id").agg(a=("start_min", "min"), b=("ende_min", "max"))
    minutes = np.arange(4 * 60, 25 * 60)
    aktiv = ((span.a.values[:, None] <= minutes) & (span.b.values[:, None] >= minutes)).sum(0)
    busse_spitze = int(aktiv.max())
    fahrstunden = float(((trips.fahrzeit_min + wende).sum()) / 60)
    fahrer_bedarf = int(math.ceil(fahrstunden / RULES["dienst"]["schicht_h_effektiv"]))

    # Busse & Fahrer (fiktiv)
    n_busse = int(math.ceil(busse_spitze * (1 + reserve)))
    depots = ["Depot West (fiktiv)", "Depot Nord (fiktiv)", "Depot Süd (fiktiv)"]
    busse = pd.DataFrame({
        "bus_id": [f"B{i:03d}" for i in range(1, n_busse + 1)],
        "typ": rng.choice(["Solo", "Gelenk"], n_busse, p=[0.45, 0.55]),
        "depot": rng.choice(depots, n_busse),
        "verfuegbar": rng.random(n_busse) > 0.04,  # Werkstatt
    })
    busse["plaetze"] = busse.typ.map(bus_cfg["plaetze"])
    busse.to_csv(SYNTHETIC / "busse.csv", index=False)

    n_fahrer = int(round(fahrer_bedarf * 1.06))  # Sollbestand inkl. Reserve
    fahrer = pd.DataFrame({
        "fahrer_id": [f"F{i:04d}" for i in range(1, n_fahrer + 1)],
        "depot": rng.choice(depots, n_fahrer),
        "schicht": rng.choice(["früh", "spät", "geteilt"], n_fahrer, p=[0.45, 0.4, 0.15]),
        "krank": rng.random(n_fahrer) < ausfall,
    })
    fahrer.to_csv(SYNTHETIC / "fahrer.csv", index=False)

    baseline = {
        "seed": seed, "stichtag": RULES["stichtag"],
        "fahrten": int(len(trips)), "linien": int(trips.linie.nunique()),
        "fahrstunden": round(fahrstunden, 1), "fahrer_bedarf": fahrer_bedarf,
        "fahrer_bestand": n_fahrer, "fahrer_verfuegbar": int((~fahrer.krank).sum()),
        "busse_spitze": busse_spitze, "busse_bestand": n_busse, "busse_verfuegbar": int(busse.verfuegbar.sum()),
        "fahrgaeste_tag": int(trips.fahrgaeste.sum()),
        "hinweis": "synthetisch – keine VAG-Daten",
    }
    write_json(SYNTHETIC / "baseline.json", baseline, compact=False)
    print("  ", baseline)

    # Events (fiktive Termine an echten Veranstaltungsorten)
    (SYNTHETIC / "events.yaml").write_text(
        "# FIKTIVE Events an echten Veranstaltungsorten (Koordinaten ca.). Besucherzahlen = Annahmen.\n"
        + yaml.safe_dump(EVENTS, allow_unicode=True, sort_keys=False), encoding="utf-8")

    # Baustellen (fiktiv) auf echten Hauptstraßen
    roads = json.load(open(PROCESSED / "roads.json"))
    nodes = roads["nodes"]
    cand = [e for e in roads["edges"] if e[4] in ("primary", "secondary", "tertiary") and e[5]
            and e[2] > 120 and 49.39 < nodes[e[0]][1] < 49.51 and 11.0 < nodes[e[0]][0] < 11.18]
    by_name: dict[str, list] = {}
    for e in cand:
        by_name.setdefault(e[5], []).append(e)
    korridor = _korridor_kanten(roads, cells, stations)  # Baustellen auf typischen Express-Korridoren
    names = [n for n in sorted(by_name) if n not in korridor]
    pick = list(korridor)[:3] + list(rng.choice(names, size=min(5, len(names)), replace=False))
    for n, es in korridor.items():
        by_name[n] = es
    arten = [("Kanalbau", "sperrung", 0), ("Straßenbau", "einspurig", 40), ("Fernwärme", "sperrung", 0),
             ("Gleisbau Tram", "einspurig", 35), ("Leitungsbau", "verzoegerung", 25), ("Brückensanierung", "sperrung", 0),
             ("Fahrbahnerneuerung", "einspurig", 45), ("Glasfaser", "verzoegerung", 20)]
    feats = []
    for i, name in enumerate(pick):
        es = sorted(by_name[name], key=lambda e: -e[2])[:2]
        art, wirkung, verz = arten[i % len(arten)]
        if name in korridor:  # über den Demo-Zeitraum aktiv
            start, ende = pd.Timestamp("2026-10-05") + pd.Timedelta(days=i * 3), pd.Timestamp("2026-11-20")
        else:
            start = pd.Timestamp("2026-10-01") + pd.Timedelta(days=int(rng.integers(0, 25)))
            ende = start + pd.Timedelta(days=int(rng.integers(10, 50)))
        feats.append({
            "type": "Feature",
            "properties": {"id": f"b{i + 1}", "strasse": name, "art": art, "wirkung": wirkung,
                           "verzoegerung_pct": verz, "von": str(start.date()), "bis": str(ende.date()),
                           "kanten": [[e[0], e[1]] for e in es], "quelle": "fiktiv"},
            "geometry": {"type": "MultiLineString",
                         "coordinates": [e[6] or [nodes[e[0]], nodes[e[1]]] for e in es]},
        })
    write_json(SYNTHETIC / "baustellen_fiktiv.geojson", {"type": "FeatureCollection", "features": feats}, compact=False)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--fahrer-ausfall", type=float, default=0.06)
    ap.add_argument("--busse-reserve", type=float, default=0.08)
    a = ap.parse_args()
    main(a.seed, a.fahrer_ausfall, a.busse_reserve)
