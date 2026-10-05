"""Smoke-Tests für die API. Aufruf aus backend/:  python -m pytest -q"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
WERKTAG = "2026-10-13"


def test_meta_und_grid():
    m = client.get("/api/meta").json()
    assert m["baseline"]["fahrer_bedarf"] > 0
    g = client.get("/api/grid").json()
    assert len(g["cells"]) > 5000 and len(g["fields"]) == len(g["cells"][0])


def test_hotspots_hubs_express():
    hs = client.get("/api/hotspots").json()
    assert hs, "keine Hotspots"
    h = hs[0]
    hubs = client.get("/api/hubs", params={"lon": h["lon"], "lat": h["lat"]}).json()
    assert len(hubs) == 3
    r = client.post("/api/express/route", json={"start": [h["lon"], h["lat"]], "hub_id": hubs[0]["id"], "datum": WERKTAG}).json()
    assert r["fahrzeit_min"] > 0 and r["bedarf"]["busse"] >= 1 and len(r["route"]) > 2


def test_optimierer_haelt_mindesttakt_und_gleicht_aus():
    req = {"fahrer_verfuegbar": 340, "busse_verfuegbar": 260, "datum": WERKTAG, "express": [{"fahrer": 3, "busse": 4}]}
    for method in ("milp", "greedy"):
        o = client.post("/api/optimize", json={**req, "method": method}).json()
        assert o["bilanz_nachher"]["fahrer"]["saldo"] >= -0.01
        for v in o["vorschlaege"]:
            assert v["takt_neu"] <= v["mindesttakt"] + 0.5
        gruppen = [v["gruppe"] for v in o["vorschlaege"]]
        assert len(gruppen) == len(set(gruppen)), "max. eine Maßnahme je Linie und Zeitfenster"


def test_event_und_baustellen():
    p = client.post("/api/events/e1/plan").json()
    assert p["busse"] >= 1 and p["routen"]
    b = client.get("/api/baustellen", params={"datum": WERKTAG}).json()
    assert b["type"] == "FeatureCollection"
