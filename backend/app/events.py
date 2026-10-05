"""Event-Express (F6): Shuttle-Bedarf aus Besucherzahl, Routen von Schienenknoten zum Veranstaltungsort."""
from __future__ import annotations

import math

import numpy as np

from .data import RULES, store, to_xy
from .routing import route

E = RULES["events"]
WENDE = RULES["bus"]["wendezeit_min"]
PLAETZE = RULES["bus"]["plaetze"]["Gelenk"]


def _hhmm(minutes: float) -> str:
    minutes = int(round(minutes)) % (24 * 60)
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _min(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def events_between(von: str | None = None, bis: str | None = None):
    evs = store().events
    return [e for e in evs if (not von or e["datum"] >= von) and (not bis or e["datum"] <= bis)]


def plan_event(event: dict, datum: str | None = None) -> dict:
    s = store()
    exy = to_xy(event["lon"], event["lat"])[0]
    d = np.linalg.norm(s.rail_xy - exy, axis=1)
    df = s.rail_df.assign(dist_m=d)
    # Shuttle-Quellen: Hbf + bester weiterer Knoten in 1,5–8 km Entfernung (nicht fußläufig)
    df = df[(df.dist_m > 1500) & (df.dist_m < 8000) & (df.rail_deps_h >= 10)]
    quellen = df.sort_values("hub_score", ascending=False).head(2)

    besucher_shuttle = event["besucher"] * E["oev_anteil"] * E["shuttle_anteil"]
    an_fenster = E["anreise_vorlauf_min"] - 15
    routen, busse_gesamt = [], 0
    gewichte = quellen.hub_score / quellen.hub_score.sum() if len(quellen) else []
    for (q, w) in zip(quellen.itertuples(), gewichte):
        r = route([[q.lon, q.lat], [event["lon"], event["lat"]]], datum or event["datum"])
        umlauf = 2 * r["fahrzeit_min"] + 2 * WENDE
        runden = max(1, math.floor(an_fenster / umlauf))
        busse = max(1, math.ceil(besucher_shuttle * w / (PLAETZE * runden)))
        busse_gesamt += busse
        routen.append({"von": q.name, "von_id": q.id, "coords": r["coords"], "fahrzeit_min": r["fahrzeit_min"],
                       "umlauf_min": round(umlauf, 1), "busse": busse, "runden_anreise": runden,
                       "baustellen_nahe": r["baustellen_nahe"], "umgeplant": r["umgeplant"]})
    b, e_ = _min(event["beginn"]), _min(event["ende"])
    return {
        "event": event,
        "annahmen": {"oev_anteil": E["oev_anteil"], "shuttle_anteil": E["shuttle_anteil"], "plaetze_bus": PLAETZE},
        "besucher_shuttle": round(besucher_shuttle),
        "busse": busse_gesamt,
        "fahrer": busse_gesamt,  # 1 Fahrer:in je Shuttle-Bus für den Event-Dienst
        "anreise": f"{_hhmm(b - E['anreise_vorlauf_min'])}–{_hhmm(b - 15)}",
        "abreise": f"{_hhmm(e_)}–{_hhmm(e_ + E['abreise_dauer_min'])}",
        "routen": routen,
    }
