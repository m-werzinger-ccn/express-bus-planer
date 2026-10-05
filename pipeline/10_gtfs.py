"""10 · GTFS aufbereiten: Stationen, Schienenknoten, Linienverläufe, Stadtbus-Fahrten am Stichtag.

Eingabe : data/raw/gtfs/*.txt   (VGN GTFS, CC BY 3.0 DE)
Ausgabe : data/processed/stations.json, rail_lines.json, bus_lines.json, bus_trips.csv
"""
from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd

from common import PROCESSED, RAW, RULES, gtfs_time_to_min, in_bbox, write_json, zeitfenster_von, r

G = RAW / "gtfs"
STICHTAG = RULES["stichtag"]
LINE_COLORS = {"U1": "#1D6FB8", "U2": "#E2001A", "U3": "#00A3A1"}
RAIL_DESC = {"U-Bahn": "U", "S-Bahn": "S", "R-Bahn": "R", "Tram": "T"}


def read(name, **kw):
    return pd.read_csv(G / name, dtype=str, encoding="utf-8-sig", **kw)


def active_services() -> set[str]:
    cal = read("calendar.txt")
    d = dt.datetime.strptime(STICHTAG, "%Y%m%d")
    wd = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][d.weekday()]
    on = cal[(cal[wd] == "1") & (cal.start_date <= STICHTAG) & (cal.end_date >= STICHTAG)].service_id
    services = set(on)
    cd = read("calendar_dates.txt")
    cd = cd[cd.date == STICHTAG]
    services |= set(cd[cd.exception_type == "1"].service_id)
    services -= set(cd[cd.exception_type == "2"].service_id)
    return services


def main():
    print("10 · GTFS")
    routes = read("routes.txt")
    trips = read("trips.txt")
    stops = read("stops.txt")
    services = active_services()
    trips = trips[trips.service_id.isin(services)].merge(
        routes[["route_id", "route_short_name", "route_desc", "route_type"]], on="route_id"
    )
    trips["mode"] = trips.route_desc.map({**RAIL_DESC, "Stadtbus": "B"}).fillna("X")
    trips = trips[trips["mode"] != "X"]
    print(f"  aktive Fahrten am {STICHTAG}: {len(trips):,} (U/S/R/Tram/Stadtbus)")

    # --- Stationen (Haltepunkte → Station gruppieren) ---
    # IFOPT: de:<Gemeinde>:<Station>:<Bereich>:<Steig> → Station = erste drei Teile
    stops["station_id"] = stops.stop_id.str.split(":").str[:3].str.join(":")
    stops["lat"] = stops.stop_lat.astype(float)
    stops["lon"] = stops.stop_lon.astype(float)
    stops = stops[stops.location_type.fillna("") != "1"]
    stop2station = dict(zip(stops.stop_id, stops.station_id))

    st = read("stop_times.txt", usecols=["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"])
    st = st[st.trip_id.isin(set(trips.trip_id))]
    st["departure_time"] = st.departure_time.fillna(st.arrival_time)
    st = st.dropna(subset=["departure_time"])
    st["station_id"] = st.stop_id.map(stop2station)
    st["seq"] = st.stop_sequence.astype(int)
    st["min"] = st.departure_time.map(gtfs_time_to_min)
    st = st.merge(trips[["trip_id", "route_short_name", "mode", "direction_id"]], on="trip_id")
    st = st.sort_values(["trip_id", "seq"])

    stations = (
        stops.groupby("station_id")
        .agg(name=("stop_name", "first"), lon=("lon", "mean"), lat=("lat", "mean"))
        .reset_index()
    )
    stations = stations[in_bbox(stations.lon, stations.lat, pad=0.03)]
    st = st[st.station_id.isin(set(stations.station_id))]

    day = st[(st["min"] >= 6 * 60) & (st["min"] < 20 * 60)]
    rail = day[day["mode"].isin(["U", "S", "R"])]
    rail_deps = rail.groupby("station_id").size() / 14.0
    bus_deps = day[day["mode"] == "B"].groupby("station_id").size() / 14.0
    tram_deps = day[day["mode"] == "T"].groupby("station_id").size() / 14.0
    modes = st.groupby("station_id")["mode"].agg(lambda s: "".join(sorted(set(s))))
    lines = st.groupby("station_id")["route_short_name"].agg(lambda s: sorted(set(s)))

    stations["modes"] = stations.station_id.map(modes).fillna("")
    stations["rail_deps_h"] = stations.station_id.map(rail_deps).fillna(0)
    stations["bus_deps_h"] = stations.station_id.map(bus_deps).fillna(0)
    stations["tram_deps_h"] = stations.station_id.map(tram_deps).fillna(0)
    stations["lines"] = stations.station_id.map(lines)
    stations = stations[stations.modes != ""]
    stations["is_rail"] = stations.modes.str.contains("U|S|R")

    # Knoten-Score (F2): Abfahrten/h, Linienzahl, U+S-Verknüpfung
    hub = stations[stations.is_rail].copy()
    n_lines = hub.lines.map(len)
    hub_score = (
        0.5 * (np.log1p(hub.rail_deps_h) / np.log1p(hub.rail_deps_h.max()))
        + 0.3 * (np.log1p(n_lines) / np.log1p(n_lines.max()))
        + 0.2 * (hub.modes.str.contains("U") & hub.modes.str.contains("S|R")).astype(float)
    )
    hub_score.index = hub.station_id
    stations["hub_score"] = stations.station_id.map(hub_score).fillna(0)

    out = []
    for s in stations.itertuples():
        out.append({
            "id": s.station_id, "name": s.name, "lon": r(s.lon), "lat": r(s.lat), "modes": s.modes,
            "rail_deps_h": r(s.rail_deps_h, 1), "bus_deps_h": r(s.bus_deps_h, 1), "tram_deps_h": r(s.tram_deps_h, 1),
            "lines": s.lines, "is_rail": bool(s.is_rail), "hub_score": r(s.hub_score, 3),
        })
    write_json(PROCESSED / "stations.json", out)
    print(f"  Stationen: {len(out):,}, davon Schiene (U/S/R): {int(stations.is_rail.sum())}")

    # --- Linienverläufe (kein shapes.txt → Haltestellenfolge des längsten Trips) ---
    coords = stations.set_index("station_id")[["lon", "lat"]]

    def line_paths(modes_wanted):
        res = []
        sub = st[st["mode"].isin(modes_wanted)]
        counts = sub.groupby(["route_short_name", "direction_id", "trip_id"]).size().reset_index(name="n")
        best = counts.sort_values("n").groupby(["route_short_name", "direction_id"]).tail(1)
        for b in best.itertuples():
            if b.direction_id != "0" and ((best.route_short_name == b.route_short_name) & (best.direction_id == "0")).any():
                continue
            seq = sub[sub.trip_id == b.trip_id].station_id
            seq = [x for x in seq if x in coords.index]
            if len(seq) < 2:
                continue
            path = [[r(coords.at[x, "lon"]), r(coords.at[x, "lat"])] for x in seq]
            mode = sub[sub.trip_id == b.trip_id]["mode"].iloc[0]
            res.append({"name": b.route_short_name, "mode": mode, "path": path, "stations": seq,
                        "color": LINE_COLORS.get(b.route_short_name)})
        return res

    rail_lines = line_paths(["U", "S", "R", "T"])
    write_json(PROCESSED / "rail_lines.json", rail_lines)

    # --- Stadtbus Nürnberg (VAG): Linien + Fahrten ---
    bus = st[st["mode"] == "B"].copy()
    nbg_share = bus.groupby("route_short_name").stop_id.agg(lambda s: s.str.startswith("de:09564").mean())
    vag_lines = set(nbg_share[nbg_share >= 0.6].index)
    bus = bus[bus.route_short_name.isin(vag_lines)]
    bus_lines = [l for l in line_paths(["B"]) if l["name"] in vag_lines]
    write_json(PROCESSED / "bus_lines.json", bus_lines)

    g = bus.groupby("trip_id")
    tr = pd.DataFrame({
        "linie": g.route_short_name.first(),
        "richtung": g.direction_id.first(),
        "start_min": g["min"].min(),
        "ende_min": g["min"].max(),
        "anzahl_halte": g.size(),
        "halte": g.station_id.agg(lambda s: "|".join(s)),
    }).reset_index()
    tr["fahrzeit_min"] = tr.ende_min - tr.start_min
    tr = tr[tr.fahrzeit_min > 0]
    tr["zeitfenster"] = tr.start_min.map(zeitfenster_von)
    tr.to_csv(PROCESSED / "bus_trips.csv", index=False)
    print(f"  VAG-Stadtbuslinien: {len(vag_lines)}, Fahrten am Stichtag: {len(tr):,}")


if __name__ == "__main__":
    main()
