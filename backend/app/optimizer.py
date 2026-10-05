"""Fahrer freispielen (F5): Kandidaten-Maßnahmen, Fahrer-/Bus-Bilanz, Optimierung (MILP oder Greedy)."""
from __future__ import annotations

import math
from functools import lru_cache

import numpy as np

from .data import RULES, store, wochentag_typ

WENDE = RULES["bus"]["wendezeit_min"]
SCHICHT = RULES["dienst"]["schicht_h_effektiv"]
ZF = RULES["zeitfenster"]
ZF_LABEL = {"HVZ_frueh": "HVZ früh", "NVZ": "NVZ", "HVZ_spaet": "HVZ spät", "SVZ": "SVZ"}
SPITZE = {"HVZ_frueh", "HVZ_spaet"}


@lru_cache(maxsize=1)
def candidates() -> list[dict]:
    s = store()
    trips = s.trips.dropna(subset=["zeitfenster"])
    out = []
    for (linie, zf), g in trips.groupby(["linie", "zeitfenster"]):
        a, b = ZF[zf]
        L = (b - a) * 60
        dirs = [d.sort_values("start_min") for _, d in g.groupby("richtung")]
        n_dir = min(len(d) for d in dirs)
        if n_dir < 3:
            continue
        h = float(np.mean([L / len(d) for d in dirs]))
        gebiet = s.linien.get(str(linie), {}).get("gebiet", "locker")
        mindest = RULES["mindesttakt_min"][gebiet][zf]
        C = 2 * (float(g.fahrzeit_min.median()) + WENDE)
        ausl = float(g.auslastung_pct.mean())
        ausl_max = float(g.auslastung_pct.quantile(0.9))
        parallel = float(g.anteil_schienenparallel.mean())
        pax = float(g.fahrgaeste.sum())
        for faktor, pick in ((1.5, lambda i: i % 3 == 2), (2.0, lambda i: i % 2 == 1)):
            h_neu = h * faktor
            if h_neu > mindest + 0.5:
                continue
            if ausl_max * faktor > 95:  # Restfahrten würden überfüllt
                continue
            removed = [t for d in dirs for i, t in enumerate(d.itertuples()) if pick(i)]
            if not removed:
                continue
            frei_h = sum(t.fahrzeit_min + WENDE for t in removed) / 60
            busse_frei = max(0, math.ceil(C / h) - math.ceil(C / h_neu)) if zf in SPITZE else 0
            mehrwarte_h = pax * (h_neu - h) / 2 / 60 * (1 - 0.6 * parallel)
            aid = f"{linie}|{zf}|x{faktor:g}"
            out.append({
                "id": aid, "gruppe": f"{linie}|{zf}", "linie": str(linie), "zeitfenster": zf,
                "faktor": faktor, "takt_alt": round(h, 1), "takt_neu": round(h_neu, 1), "mindesttakt": mindest,
                "gebiet": gebiet, "fahrten_weniger": len(removed), "fahrerstunden_frei": round(frei_h, 1),
                "fahrer_frei": round(frei_h / SCHICHT, 2), "busse_frei": int(busse_frei),
                "fahrgaeste_betroffen": int(pax), "mehrwartezeit_h": round(mehrwarte_h, 1),
                "auslastung_alt": round(ausl), "auslastung_neu": round(min(ausl * faktor, 140)),
                "schienenparallel": round(parallel, 2),
                "trip_ids": [t.trip_id for t in removed],
                "titel": f"Linie {linie} · {ZF_LABEL[zf]} {h:.0f} → {h_neu:.0f} min",
                "warum": [
                    f"Auslastung Ø {ausl:.0f} % → ca. {min(ausl * faktor, 140):.0f} %",
                    f"{parallel * 100:.0f} % der Halte schienennah (≤ 600 m)",
                    f"Takt bleibt im Mindeststandard: {h_neu:.0f} ≤ {mindest} min (NVP, Gebiet {gebiet})",
                    f"{len(removed)} Fahrten weniger → {frei_h:.1f} Fahrerstunden frei",
                ],
            })
    # Kosten-Kennzahl für Ranking: Mehrwartezeit je freier Fahrerschicht
    for c in out:
        c["kosten"] = round(c["mehrwartezeit_h"] / max(c["fahrer_frei"], 0.05), 1)
    return out


def _cand_by_id():
    return {c["id"]: c for c in candidates()}


def bilanz(fahrer_verfuegbar: float, busse_verfuegbar: float, datum: str | None,
           express: list[dict], accepted: list[str], events: list[dict]) -> dict:
    s = store()
    wt = wochentag_typ(datum)
    fb = RULES["wochentag_faktor"]["bedarf"][wt]
    fv = RULES["wochentag_faktor"]["verfuegbar"][wt]
    cmap = _cand_by_id()
    acc = [cmap[a] for a in accepted if a in cmap]

    f_basis = s.baseline["fahrer_bedarf"] * fb
    f_frei = sum(c["fahrer_frei"] for c in acc) * fb
    f_express = sum(e.get("fahrer", 0) for e in express)
    f_event = sum(e.get("fahrer", 0) for e in events)
    f_avail = fahrer_verfuegbar * fv
    f_saldo = f_avail - (f_basis - f_frei) - f_express - f_event

    b_basis = s.baseline["busse_spitze"] * fb
    b_frei = sum(c["busse_frei"] for c in acc) * fb
    b_express = sum(e.get("busse", 0) for e in express)
    b_event = sum(e.get("busse", 0) for e in events)
    b_saldo = busse_verfuegbar - (b_basis - b_frei) - b_express - b_event

    r1 = lambda x: round(x, 1)
    return {
        "wochentag": wt,
        "fahrer": {"verfuegbar": r1(f_avail), "basis": r1(f_basis), "frei": r1(f_frei), "express": r1(f_express),
                   "event": r1(f_event), "saldo": r1(f_saldo)},
        "busse": {"verfuegbar": r1(busse_verfuegbar), "basis": r1(b_basis), "frei": r1(b_frei),
                  "express": r1(b_express), "event": r1(b_event), "saldo": r1(b_saldo)},
        "mehrwartezeit_h": r1(sum(c["mehrwartezeit_h"] for c in acc)),
        "fahrten_weniger": sum(c["fahrten_weniger"] for c in acc),
    }


def optimize(fahrer_verfuegbar, busse_verfuegbar, datum, express, events, accepted, rejected, method="milp"):
    """Wählt Maßnahmen, sodass Fahrer- und Bus-Saldo ≥ 0 bei minimaler Mehrwartezeit."""
    b0 = bilanz(fahrer_verfuegbar, busse_verfuegbar, datum, express, accepted, events)
    fb = RULES["wochentag_faktor"]["bedarf"][b0["wochentag"]]
    need_f = max(0.0, -b0["fahrer"]["saldo"]) / fb
    need_b = max(0.0, -b0["busse"]["saldo"]) / fb
    pool = [c for c in candidates() if c["id"] not in set(rejected) and c["id"] not in set(accepted)
            and c["gruppe"] not in {a.rsplit("|", 1)[0] for a in accepted}]

    chosen, used = [], method
    if need_f > 0 or need_b > 0:
        if method == "milp":
            try:
                chosen = _milp(pool, need_f, need_b)
            except Exception:  # Solver fehlt/zu langsam → Greedy
                used = "greedy"
                chosen = _greedy(pool, need_f, need_b)
        else:
            chosen = _greedy(pool, need_f, need_b)

    b1 = bilanz(fahrer_verfuegbar, busse_verfuegbar, datum, express, accepted + [c["id"] for c in chosen], events)
    return {"methode": used, "bedarf": {"fahrer": round(need_f, 2), "busse": round(need_b, 2)},
            "vorschlaege": chosen, "bilanz_vorher": b0, "bilanz_nachher": b1,
            "kandidaten_gesamt": len(candidates())}


def _greedy(pool, need_f, need_b):
    chosen, groups, f, b = [], set(), 0.0, 0.0
    for c in sorted(pool, key=lambda c: (c["kosten"], -c["busse_frei"])):
        if f >= need_f and b >= need_b:
            break
        if c["gruppe"] in groups:
            continue
        if f >= need_f and c["busse_frei"] == 0:
            continue
        chosen.append(c)
        groups.add(c["gruppe"])
        f += c["fahrer_frei"]
        b += c["busse_frei"]
    return chosen


def _milp(pool, need_f, need_b):
    import pulp

    m = pulp.LpProblem("fahrer_freispielen", pulp.LpMinimize)
    x = {c["id"]: pulp.LpVariable(f"x_{i}", cat="Binary") for i, c in enumerate(pool)}
    sf = pulp.LpVariable("fehl_fahrer", lowBound=0)
    sb = pulp.LpVariable("fehl_busse", lowBound=0)
    m += pulp.lpSum(c["mehrwartezeit_h"] * x[c["id"]] for c in pool) + 10_000 * sf + 10_000 * sb
    m += pulp.lpSum(c["fahrer_frei"] * x[c["id"]] for c in pool) + sf >= need_f
    m += pulp.lpSum(c["busse_frei"] * x[c["id"]] for c in pool) + sb >= need_b
    groups: dict[str, list] = {}
    for c in pool:
        groups.setdefault(c["gruppe"], []).append(x[c["id"]])
    for vs in groups.values():
        if len(vs) > 1:
            m += pulp.lpSum(vs) <= 1
    m.solve(pulp.PULP_CBC_CMD(msg=False, timeLimit=8))
    if pulp.LpStatus[m.status] not in ("Optimal", "Not Solved") and m.status != 1:
        raise RuntimeError(pulp.LpStatus[m.status])
    return sorted([c for c in pool if (x[c["id"]].value() or 0) > 0.5], key=lambda c: -c["fahrer_frei"])
