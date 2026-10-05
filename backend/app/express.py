"""Express-Linien: Zielknoten vorschlagen (F2) und Linie bewerten (F3)."""
from __future__ import annotations

import math

import numpy as np

from .data import RULES, store, to_xy
from .routing import route

F = RULES["fusswege"]
V_WALK = F["gehgeschwindigkeit_kmh"] * 1000 / 60  # m/min
WENDE = RULES["bus"]["wendezeit_min"]
HALT = RULES["bus"]["haltezeit_express_min"]
SCHICHT = RULES["dienst"]["schicht_h_effektiv"]
# Spalten im Raster
LON, LAT, EINW, D_RAIL, D_BUS, T_RAIL, SCORE, GEM = range(8)


def hubs_for_start(lon: float, lat: float, n: int = 3):
    s = store()
    d = np.linalg.norm(s.rail_xy - to_xy(lon, lat)[0], axis=1)
    df = s.rail_df.assign(dist_m=d)
    df = df[(df.dist_m > 300) & (df.rail_deps_h >= 8)]
    df = df.assign(fahrzeit_schaetzung_min=df.dist_m * 1.35 / (24 * 1000 / 60))
    # Express soll zu leistungsfähigen Knoten fahren, nicht zur nächstbesten Station
    df = df.assign(rang=df.fahrzeit_schaetzung_min - 12 * df.hub_score)
    out = []
    for r in df.nsmallest(n, "rang").itertuples():
        out.append({"id": r.id, "name": r.name, "lon": r.lon, "lat": r.lat, "modes": r.modes,
                    "hub_score": r.hub_score, "rail_deps_h": r.rail_deps_h, "lines": r.lines,
                    "dist_m": round(r.dist_m), "fahrzeit_schaetzung_min": round(r.fahrzeit_schaetzung_min, 1)})
    return out


def _heute_bis_knoten(cxy, t_schiene, hub):
    """Schätzung heute bis zum Zielknoten: Zeit bis zur nächsten Schienenstation + Bahnfahrt + Umstieg."""
    s = store()
    hub_xy = to_xy(hub["lon"], hub["lat"])[0]
    _, i_rail = s.rail_tree.query(cxy)
    d_hub = np.linalg.norm(s.rail_xy[i_rail] - hub_xy, axis=1)
    bahn = np.where(d_hub < 150, 0.0, 4 + d_hub * 1.25 / (32 * 1000 / 60))
    return t_schiene + bahn


def _cum_dist(coords):
    xy = to_xy([c[0] for c in coords], [c[1] for c in coords])
    seg = np.r_[0, np.linalg.norm(np.diff(xy, axis=0), axis=1)]
    return xy, np.cumsum(seg)


def _auto_stops(coords, xy, cum, max_stops=4):
    s = store()
    total = cum[-1]
    stops, last = [], 0.0
    for pos in np.arange(900, total - 900, 250):
        if pos - last < 1000 or len(stops) >= max_stops:
            continue
        i = int(np.searchsorted(cum, pos))
        idx = s.grid_tree.query_ball_point(xy[i], 400)
        if not idx:
            continue
        cells = s.grid[idx]
        pop = cells[cells[:, D_RAIL] > F["max_schiene_m"], EINW].sum()
        if pop >= 250:
            stops.append({"lon": coords[i][0], "lat": coords[i][1], "pos_m": float(pos), "auto": True})
            last = pos
    return stops


def plan_express(start, hub_id, waypoints=None, takt=15, betriebszeit="HVZ", datum=None, auto_stops=True):
    s = store()
    hub = s.station_by_id[hub_id]
    waypoints = waypoints or []
    pts = [start] + waypoints + [[hub["lon"], hub["lat"]]]
    r = route(pts, datum)
    coords = r["coords"]
    xy, cum = _cum_dist(coords)
    total = float(cum[-1]) if len(cum) else 0.0

    stops = [{"lon": start[0], "lat": start[1], "pos_m": 0.0, "auto": False}]
    for w in waypoints:
        i = int(np.argmin(np.linalg.norm(xy - to_xy(*w)[0], axis=1)))
        stops.append({"lon": coords[i][0], "lat": coords[i][1], "pos_m": float(cum[i]), "auto": False})
    if auto_stops and total > 2500:
        manual = [st["pos_m"] for st in stops]
        for a in _auto_stops(coords, xy, cum):
            if all(abs(a["pos_m"] - m) > 700 for m in manual):
                stops.append(a)
    stops.sort(key=lambda x: x["pos_m"])
    n_halte = len(stops)
    fahrzeit = r["fahrzeit_min"] + HALT * n_halte
    for k, st in enumerate(stops):
        anteil = (total - st["pos_m"]) / total if total else 0
        st["fahrzeit_bis_knoten_min"] = round(r["fahrzeit_min"] * anteil + HALT * (n_halte - k), 1)
        st["name"] = "Start" if k == 0 else f"Halt {k}"

    # Einzugsbereich und Reisezeit-Effekt
    stop_xy = to_xy([x["lon"] for x in stops], [x["lat"] for x in stops])
    idx = sorted(set(i for lst in s.grid_tree.query_ball_point(stop_xy, RULES["express"]["einzugsradius_m"]) for i in lst))
    if idx:
        cells = s.grid[idx]
        cxy = s.grid_xy[idx]
        dists = np.linalg.norm(cxy[:, None, :] - stop_xy[None, :, :], axis=2)
        t_stop = np.array([x["fahrzeit_bis_knoten_min"] for x in stops])
        t_exp = (dists * F["umwegfaktor"] / V_WALK) + takt / 2 + t_stop[None, :]
        t_exp = t_exp.min(axis=1)
        heute_schiene = cells[:, T_RAIL]
        heute = _heute_bis_knoten(cxy, heute_schiene, hub)
        neu = np.minimum(heute, t_exp)
        pop = cells[:, EINW]
        besser = neu < heute - 1
        einzug = float(pop.sum())
        neu_15 = float(pop[(heute_schiene > 15) & (np.minimum(heute_schiene, t_exp) <= 15)].sum())
        profit = float(pop[besser].sum())
        gewinn = float(((heute - neu) * pop)[besser].sum() / profit) if profit else 0.0
        weit = float(pop[cells[:, D_RAIL] > F["max_schiene_m"]].sum())
    else:
        einzug = neu_15 = profit = gewinn = weit = 0.0

    _, i0 = s.grid_tree.query(stop_xy[0])
    heute_start = float(_heute_bis_knoten(s.grid_xy[[i0]], s.grid[[i0], T_RAIL], hub)[0])

    # Ressourcen
    umlauf = 2 * fahrzeit + 2 * WENDE
    busse = math.ceil(umlauf / takt)
    stunden = sum(b - a for a, b in RULES["express"]["betriebszeiten"][betriebszeit])
    fahrer = busse  # gleichzeitig im Dienst: 1 Fahrer:in je Bus

    return {
        "hub": {k: hub[k] for k in ("id", "name", "lon", "lat", "modes", "lines")},
        "route": coords,
        "stops": stops,
        "laenge_km": round(total / 1000, 1),
        "fahrzeit_min": round(fahrzeit, 1),
        "baustellen_nahe": r["baustellen_nahe"],
        "umgeplant": r["umgeplant"],
        "takt": takt, "betriebszeit": betriebszeit, "betriebsstunden": stunden,
        "umlaufzeit_min": round(umlauf, 1),
        "bedarf": {"busse": busse, "fahrer": fahrer, "fahrerstunden": round(busse * stunden, 1)},
        "wirkung": {
            "einwohner_einzug": round(einzug), "einwohner_weit_von_schiene": round(weit),
            "einwohner_neu_15min": round(neu_15), "einwohner_profitieren": round(profit),
            "zeitgewinn_mittel_min": round(gewinn, 1),
            "start_heute_min": round(heute_start, 1),
            "start_express_min": round(takt / 2 + stops[0]["fahrzeit_bis_knoten_min"], 1),
        },
    }



def hotspots(n: int = 6):
    """Unterversorgte Schwerpunkte – berechnet in pipeline/20_grid.py."""
    return store().hotspots[:n]
