"""20 · Zensus-100-m-Raster: Einwohner, Fußweg zur Schiene, Zeit bis Schiene heute, Unterversorgungs-Score.

Eingabe : data/raw/Zensus2022_Bevoelkerungszahl_100m-Gitter.csv (dl-de/by-2-0), data/processed/stations.json
Ausgabe : data/processed/grid.json  (kompakte Arrays für die Karte), data/processed/grid_kpi.json
Vereinfachung MVP: Fußweg = Luftlinie × Umwegfaktor (später OSMnx/r5py).
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

from common import BBOX, PROCESSED, RAW, RULES, TO_3035, TO_4326, write_json

F = RULES["fusswege"]
GEMEINDEN = {"09564": 0, "09563": 1, "09562": 2}  # Nürnberg, Fürth, Erlangen, sonst 3


def hotspots(g, n=6, radius_m=700, abstand_m=2500):
    """Unterversorgte Schwerpunkte (F3): gierig die Zelle mit größter Score-Summe im Umkreis wählen."""
    pts = np.c_[g.x_mp_100m.values, g.y_mp_100m.values]
    tree = cKDTree(pts)
    cand = np.where((g.score > 0.1) & (g.gemeinde == 0) & (g.zeit_bis_schiene_min > 12))[0]
    sp = (g.score * g.Einwohner).values
    weit = (g.fussweg_schiene_m > F["max_schiene_m"]).values
    neigh = tree.query_ball_point(pts[cand], radius_m)
    wert = np.array([sp[idx].sum() for idx in neigh])
    pop = np.array([g.Einwohner.values[idx][weit[idx]].sum() for idx in neigh])
    out, gesperrt = [], np.zeros(len(cand), bool)
    for _ in range(n):
        w = np.where(gesperrt, -1, wert)
        k = int(np.argmax(w))
        if w[k] <= 0:
            break
        i = cand[k]
        out.append({"lon": round(float(g.lon[i]), 5), "lat": round(float(g.lat[i]), 5),
                    "einwohner_weit_von_schiene": int(pop[k]),
                    "zeit_bis_schiene_min": round(float(g.zeit_bis_schiene_min[i]), 1),
                    "fussweg_schiene_m": int(g.fussweg_schiene_m[i])})
        gesperrt |= np.linalg.norm(pts[cand] - pts[i], axis=1) < abstand_m
    return out


def main():
    print("20 · Raster")
    xmin, ymin = TO_3035.transform(BBOX[0], BBOX[1])
    xmax, ymax = TO_3035.transform(BBOX[2], BBOX[3])
    # Rechteck in 3035 großzügig aufspannen, danach in 4326 zuschneiden
    xs = [TO_3035.transform(lo, la)[0] for lo in (BBOX[0], BBOX[2]) for la in (BBOX[1], BBOX[3])]
    ys = [TO_3035.transform(lo, la)[1] for lo in (BBOX[0], BBOX[2]) for la in (BBOX[1], BBOX[3])]
    xmin, xmax, ymin, ymax = min(xs), max(xs), min(ys), max(ys)

    chunks = []
    for c in pd.read_csv(RAW / "Zensus2022_Bevoelkerungszahl_100m-Gitter.csv", sep=";", chunksize=500_000,
                         usecols=["x_mp_100m", "y_mp_100m", "Einwohner"]):
        c = c[(c.x_mp_100m.between(xmin, xmax)) & (c.y_mp_100m.between(ymin, ymax))]
        chunks.append(c)
    g = pd.concat(chunks)
    g["Einwohner"] = pd.to_numeric(g.Einwohner, errors="coerce").fillna(0)
    g = g[g.Einwohner > 0]
    lon, lat = TO_4326.transform(g.x_mp_100m.values, g.y_mp_100m.values)
    g["lon"], g["lat"] = lon, lat
    g = g[(g.lon.between(BBOX[0], BBOX[2])) & (g.lat.between(BBOX[1], BBOX[3]))].reset_index(drop=True)
    print(f"  bewohnte Zellen: {len(g):,}, Einwohner: {int(g.Einwohner.sum()):,}")

    st = pd.DataFrame(json.load(open(PROCESSED / "stations.json", encoding="utf-8")))
    sx, sy = TO_3035.transform(st.lon.values, st.lat.values)
    st["x"], st["y"] = sx, sy
    rail = st[st.is_rail].reset_index(drop=True)
    local = st[st.modes.str.contains("B|T")].reset_index(drop=True)

    pts = np.c_[g.x_mp_100m.values, g.y_mp_100m.values]
    d_rail, i_rail = cKDTree(np.c_[rail.x, rail.y]).query(pts)
    d_bus, i_bus = cKDTree(np.c_[local.x, local.y]).query(pts)
    _, i_any = cKDTree(np.c_[st.x, st.y]).query(pts)

    uf = F["umwegfaktor"]
    v_walk = F["gehgeschwindigkeit_kmh"] * 1000 / 60  # m/min
    v_bus = RULES["bus"]["geschwindigkeit_heute_kmh"] * 1000 / 60
    g["fussweg_schiene_m"] = d_rail * uf
    g["fussweg_bus_m"] = d_bus * uf

    # Zeit bis Schiene heute (Schätzung): direkt laufen ODER Bus/Tram + Umstieg
    t_walk = g.fussweg_schiene_m / v_walk
    stop = local.iloc[i_bus]
    deps = (stop.bus_deps_h.values + stop.tram_deps_h.values).clip(min=0.5)
    wait = np.minimum(60 / (2 * deps), 20)
    d_stop_rail, _ = cKDTree(np.c_[rail.x, rail.y]).query(np.c_[stop.x, stop.y])
    t_bus = g.fussweg_bus_m / v_walk + wait + d_stop_rail * 1.4 / v_bus + 3
    g["zeit_bis_schiene_min"] = np.minimum(t_walk, t_bus)

    # Unterversorgungs-Score: Einwohner × (weit weg von der Schiene)
    weite = ((g.fussweg_schiene_m - 600) / 1400).clip(0, 1)
    zeit = ((g.zeit_bis_schiene_min - 8) / 17).clip(0, 1)
    g["score_raw"] = g.Einwohner * weite * (0.4 + 0.6 * zeit)
    p99 = np.percentile(g.score_raw[g.score_raw > 0], 99) if (g.score_raw > 0).any() else 1
    g["score"] = (g.score_raw / p99).clip(0, 1)

    gem = st.id.iloc[i_any].str.split(":").str[1].map(GEMEINDEN).fillna(3).astype(int).values
    g["gemeinde"] = gem

    cells = np.c_[
        g.lon.round(5), g.lat.round(5), g.Einwohner.astype(int), g.fussweg_schiene_m.round(0),
        g.fussweg_bus_m.round(0), g.zeit_bis_schiene_min.round(1), g.score.round(3), g.gemeinde,
    ].tolist()
    write_json(PROCESSED / "grid.json", {
        "fields": ["lon", "lat", "einwohner", "fussweg_schiene_m", "fussweg_bus_m", "zeit_bis_schiene_min", "score", "gemeinde"],
        "gemeinden": ["Nürnberg", "Fürth", "Erlangen", "sonstige"],
        "cell_size_m": 100,
        "cells": cells,
    })

    write_json(PROCESSED / "hotspots.json", hotspots(g), compact=False)

    nbg = g[g.gemeinde == 0]
    kpi = {
        "einwohner_gesamt": int(g.Einwohner.sum()),
        "einwohner_nuernberg": int(nbg.Einwohner.sum()),
        "nbg_ueber_800m_schiene": int(nbg.Einwohner[nbg.fussweg_schiene_m > 800].sum()),
        "nbg_ueber_15min_schiene": int(nbg.Einwohner[nbg.zeit_bis_schiene_min > 15].sum()),
        "nbg_ueber_400m_bus": int(nbg.Einwohner[nbg.fussweg_bus_m > 400].sum()),
    }
    write_json(PROCESSED / "grid_kpi.json", kpi, compact=False)
    print("  ", kpi)


if __name__ == "__main__":
    main()
