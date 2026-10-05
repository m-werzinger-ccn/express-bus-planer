"""ExpressNetz Nürnberg – FastAPI-Backend.

Start (aus dem Ordner backend/):  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import json
from functools import lru_cache
from typing import Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import events as ev
from .data import ROOT, RULES, store
from .express import hotspots, hubs_for_start, plan_express
from .optimizer import bilanz, candidates, optimize

app = FastAPI(title="ExpressNetz Nürnberg API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
SCENARIOS = ROOT / "data" / "scenarios.json"


@app.on_event("startup")
def _load():
    store()
    candidates()


# ---------- Modelle ----------
class ExpressReq(BaseModel):
    start: list[float] = Field(..., description="[lon, lat]")
    hub_id: str
    waypoints: list[list[float]] = []
    takt: int = 15
    betriebszeit: str = "HVZ"
    datum: Optional[str] = None
    auto_stops: bool = True


class Need(BaseModel):
    fahrer: float = 0          # gleichzeitig im Dienst (Spitze)
    busse: float = 0
    fahrerstunden: float = 0   # Dienststunden je Tag (Info)


class BilanzReq(BaseModel):
    fahrer_verfuegbar: float
    busse_verfuegbar: float
    datum: Optional[str] = None
    express: list[Need] = []
    accepted: list[str] = []
    rejected: list[str] = []
    events_aus: list[str] = []  # Event-IDs, die nicht eingeplant werden sollen
    method: str = "milp"


class Scenario(BaseModel):
    name: str
    state: dict


# ---------- Endpunkte ----------
@app.get("/api/meta")
def meta():
    s = store()
    return {
        "baseline": s.baseline, "kpi": s.grid_kpi,
        "regeln": {k: RULES[k] for k in ("stichtag", "zeitfenster", "mindesttakt_min", "express", "events", "wochentag_faktor")},
        "quellen": [
            {"name": "VGN GTFS (Soll-Fahrplan)", "lizenz": "CC BY 3.0 DE"},
            {"name": "Zensus 2022, 100-m-Gitter", "lizenz": "dl-de/by-2-0"},
            {"name": "OpenStreetMap (BBBike-Extrakt)", "lizenz": "ODbL"},
            {"name": "Fahrer, Busse, Auslastung, Events, Baustellen", "lizenz": "synthetisch (seed %s)" % s.baseline["seed"]},
        ],
    }


@app.get("/api/grid")
def grid():
    return store().grid_raw


@app.get("/api/network")
def network():
    s = store()
    rail = [st for st in s.stations if st["is_rail"]]
    bus_ids = {sid for l in s.bus_lines for sid in l["stations"]}
    bus_stops = [{"id": st["id"], "name": st["name"], "lon": st["lon"], "lat": st["lat"],
                  "lines": [x for x in st["lines"] if not x.startswith(("U", "S", "R"))][:12], "bus_deps_h": st["bus_deps_h"]}
                 for st in s.stations if st["id"] in bus_ids]
    return {"rail_lines": s.rail_lines, "bus_lines": s.bus_lines, "rail_stations": rail, "bus_stops": bus_stops}


@app.get("/api/hubs")
def hubs(lon: float, lat: float, n: int = 3):
    return hubs_for_start(lon, lat, n)


@app.get("/api/hotspots")
def get_hotspots(n: int = 6):
    return hotspots(n)


@app.post("/api/express/route")
def express_route(req: ExpressReq):
    if req.hub_id not in store().station_by_id:
        raise HTTPException(404, "Knoten unbekannt")
    return plan_express(req.start, req.hub_id, req.waypoints, req.takt, req.betriebszeit, req.datum, req.auto_stops)


@app.get("/api/actions")
def actions():
    return candidates()


@lru_cache(maxsize=64)
def _event_plan(event_id: str, datum: Optional[str]):
    e = next((x for x in store().events if x["id"] == event_id), None)
    if e is None:
        raise HTTPException(404, "Event unbekannt")
    return ev.plan_event(e, datum)


def _events_for(datum, aus):
    if not datum:
        return []
    return [_event_plan(e["id"], datum) for e in ev.events_between(datum, datum) if e["id"] not in aus]


@app.post("/api/bilanz")
def post_bilanz(req: BilanzReq):
    evs = _events_for(req.datum, set(req.events_aus))
    b = bilanz(req.fahrer_verfuegbar, req.busse_verfuegbar, req.datum,
               [n.model_dump() for n in req.express], req.accepted, evs)
    b["events"] = [{"id": e["event"]["id"], "name": e["event"]["name"], "busse": e["busse"], "fahrer": e["fahrer"]} for e in evs]
    return b


@app.post("/api/optimize")
def post_optimize(req: BilanzReq):
    evs = _events_for(req.datum, set(req.events_aus))
    return optimize(req.fahrer_verfuegbar, req.busse_verfuegbar, req.datum, [n.model_dump() for n in req.express],
                    evs, req.accepted, req.rejected, req.method)


@app.get("/api/events")
def get_events(von: Optional[str] = None, bis: Optional[str] = None):
    return ev.events_between(von, bis)


@app.post("/api/events/{event_id}/plan")
def post_event_plan(event_id: str, datum: Optional[str] = None):
    return _event_plan(event_id, datum)


@app.get("/api/baustellen")
def get_baustellen(datum: Optional[str] = None):
    s = store()
    feats = s.active_baustellen(datum) if datum else s.baustellen
    return {"type": "FeatureCollection", "features": feats}


@app.get("/api/scenarios")
def list_scenarios():
    return json.loads(SCENARIOS.read_text(encoding="utf-8")) if SCENARIOS.exists() else []


@app.post("/api/scenarios")
def save_scenario(sc: Scenario):
    items = [x for x in list_scenarios() if x["name"] != sc.name] + [sc.model_dump()]
    SCENARIOS.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"ok": True, "anzahl": len(items)}


# ---------- Frontend (Build) ausliefern, falls vorhanden ----------
DIST = ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = DIST / path
        return FileResponse(f if path and f.is_file() else DIST / "index.html")
