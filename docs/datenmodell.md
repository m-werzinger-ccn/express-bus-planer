# Datenmodell – Track 1 Express-Busse Nürnberg

Art: **D** = direkt aus Quelle · **B** = berechnet · **S** = geschätzt/synthetisch
Koordinatensystem: EPSG:3035 · Stichtag Fahrplan: ein normaler Werktag (z. B. Di 13.10.2026)
Gemeindeschlüssel in GTFS-IDs: Nürnberg `de:09564`, Fürth `de:09563`, Erlangen `de:09562`, Schwabach `de:09565`

## 1. haltestellen (eine Zeile pro Station)
| Attribut | Quelle | Wie | Art |
|---|---|---|---|
| station_id | GTFS `stops.txt` | `parent_station`, Haltepunkte zu Station gruppieren | D |
| name | GTFS `stops.txt` | `stop_name` | D |
| geom | GTFS `stops.txt` | `stop_lat/lon` → EPSG:3035 | D |
| gemeinde | GTFS `stop_id` | Präfix `de:09564` usw. | D |
| vag_kennung | VAG OpenData „Haltestellen ID & Geodaten“ | Join über Name/Koordinate → Schlüssel für VAG-API | D |
| verkehrsmittel | GTFS `stop_times`→`trips`→`routes` | `route_type`: 0 Tram, 1 U-Bahn, 2 S-/R-Bahn, 3 Bus | B |
| ist_schienenknoten | aus verkehrsmittel | U-Bahn oder S-Bahn hält dort | B |
| abfahrten_pro_stunde | GTFS `stop_times` + `calendar(_dates)` | Stichtag filtern, nach Stunde zählen | B |
| anzahl_linien | GTFS | eindeutige `route_short_name` | B |
| umstiegszeit_min | GTFS `transfers.txt` | `min_transfer_time` | D |
| einwohner_400m / _800m | Zensus 100 m + OSM-Fußwegenetz | Zellen innerhalb Fußweg-Isochrone summieren | B |
| arbeitsplaetze_800m | Tabelle `zellen` | arbeitsplatz_proxy im Einzugsbereich | S |
| pr_platz | OSM `park_ride=yes` | P+R innerhalb 300 m | B |
| barrierefrei / aufzug | VAG OpenData Ausstattung/Aufzüge | Join über Station | D |
| ein_aussteiger_pro_stunde | Nachfrage-Umlegung | aus Tabelle `nachfrage` | S |
| knoten_score | aus Spalten oben | Abfahrten/h, Linien, Umstieg, P+R, barrierefrei gewichtet (F2) | B |

## 2. fahrten (eine Zeile pro Fahrt am Stichtag)
| Attribut | Quelle | Wie | Art |
|---|---|---|---|
| trip_id, route_id | GTFS `trips.txt` | direkt | D |
| linie | GTFS `routes.txt` | `route_short_name` | D |
| linientyp | GTFS `routes.txt` | `route_desc` (Stadtbus, Regionalbus, Rufbus …) | D |
| richtung, ziel | GTFS `trips.txt` | `direction_id`, `trip_headsign` | D |
| verkehrt_am_stichtag | GTFS `calendar` + `calendar_dates` | Wochentag + Ausnahmen prüfen | B |
| start/ende (Zeit, Halt) | GTFS `stop_times` | erste/letzte `stop_sequence` | B |
| fahrzeit_min, anzahl_halte | GTFS `stop_times` | Differenz / Anzahl | B |
| laenge_km | GTFS + OSM | Linienverlauf aus OSM-Routen oder Routing zwischen Halten (kein `shapes.txt`) | B |
| geschwindigkeit_kmh | aus laenge/fahrzeit | | B |
| zeitfenster | Startzeit | HVZ früh 6–9, NVZ, HVZ spät 15–18, SVZ | B |
| ist_vag | GTFS | `route_desc = Stadtbus` + Mehrheit der Halte in `de:09564` | B |
| anteil_schienenparallel | `stop_times` + `haltestellen` | Anteil Halte ≤ 600 m Fußweg zu U-/S-Station | B |
| ist_fahrzeit_p50 / p85 | GTFS-RT `realtime.gtfs.de` | mitloggen, Verspätung Start/Ende → echte Fahrzeit | B |
| verspaetung_mittel | GTFS-RT | mitloggen | B |
| fahrgaeste_geschaetzt, max_besetzung | Nachfrage-Umlegung | Wege auf Fahrten umlegen (r5py) | S |
| spender_score | aus Spalten oben | hoch = wenig Fahrgäste + schienenparallel + Takt über Mindeststandard | B |
| baustelle_betroffen | Tabelle `baustellen` | Linienverlauf im 50-m-Puffer einer aktiven Baustelle (F7) | B |

## 3. linien (Aggregat aus fahrten)
| Attribut | Quelle | Wie | Art |
|---|---|---|---|
| takt_min je Zeitfenster | `fahrten` | Abstand der Abfahrten am Starthalt | B |
| fahrten_pro_tag | `fahrten` | zählen | B |
| mindesttakt_nvp | Nahverkehrsplan 2025 | Standard je Gebietstyp (z. B. 15 / 30 min) | D |
| puffer_zum_mindesttakt | aus beiden | wie weit man ausdünnen darf | B |
| fahrgaeste_tag_geschaetzt | `fahrten` | summieren | S |

## 4. zellen (100 m-Gitter, Nürnberg + Puffer)
| Attribut | Quelle | Wie | Art |
|---|---|---|---|
| zelle_id, geom | Zensus 2022 100 m-CSV | `GITTER_ID_100m`, `x_mp_100m`, `y_mp_100m` | D |
| einwohner | Zensus 2022 100 m-CSV | `Einwohner` | D |
| stat_bezirk | Statistik Nürnberg | Bezirksgeometrie verschneiden (anfragen / Bezirksatlas) | D |
| anteil_wohnen/gewerbe/industrie | Bayern OpenGeodata ALKIS „Tatsächliche Nutzung“ | Flächen mit Gitter verschneiden | B |
| gebaeudeflaeche_m2 | Bayern OpenGeodata Hausumringe | Grundflächen pro Zelle summieren | B |
| pois_bildung/gesundheit/einkauf/freizeit | OSM (Geofabrik Mittelfranken) | `pyrosm`/`osmium`, Tags zählen | B |
| arbeitsplatz_proxy | ALKIS + Gebäude + POIs, BA „Beschäftigte am Arbeitsort“ | gewichteter Index, auf Gesamtbeschäftigte Nürnberg skaliert | S |
| fussweg_bus_m, fussweg_schiene_m | OSM-Fußwegenetz + `haltestellen` | kürzester Fußweg (r5py / OSMnx) | B |
| reisezeit_oev_hbf_min | r5py (GTFS + OSM) | Tür-zu-Tür, Werktag 7:30 | B |
| reisezeit_naechster_knoten_min | r5py | zur nächsten U-/S-Station | B |
| kfz_pro_einwohner | Statistik Nürnberg (Bezirksebene) | Bezirkswert auf Zellen übertragen | D |
| unterversorgung_score | aus Spalten oben | Einwohner × langer Weg zur Schiene × lange Reisezeit | B |

## 5. nachfrage (Quelle-Ziel-Matrix, Zonen = stat. Bezirke oder 500 m-Zellen)
| Attribut | Quelle | Wie | Art |
|---|---|---|---|
| herkunft, ziel, stunde | `zellen` aggregiert | Zonen bilden | B |
| wege | Einwohner, arbeitsplatz_proxy, Reisezeit | Gravitationsmodell | S |
| tagesganglinie | MiD „Mobilität in Deutschland“ | Anteil Wege je Stunde/Zweck | S |
| einpendler | Pendleratlas Bundesagentur für Arbeit | Gemeinde → Nürnberg, auf Einfallachsen / P+R verteilen | S |
| kalibrierung | VAG Gesamtfahrgäste (Daten & Fakten) | Matrix auf Jahreswert skalieren | S |

## 6. umlaeufe & dienste (Ausgangslage Personal/Fahrzeuge)
| Attribut | Quelle | Wie | Art |
|---|---|---|---|
| umlauf_id, fahrtenfolge | GTFS-Fahrten (`block_id` leer) | Fahrten verketten: Endhalt = Starthalt, Wendezeit ≥ Minimum | B |
| wendezeit_min, leerfahrt_min | aus Verkettung | Lücken zwischen Fahrten | B |
| fahrzeugbedarf_spitze | Umläufe | max. gleichzeitig aktive Umläufe | B |
| fahrzeugtyp, plaetze | VAG OpenData Fuhrpark Bus | Solo/Gelenk, Kapazität (falls enthalten) | D |
| dienst_id, beginn, ende, pausen | Umläufe + ArbZG/FPersV | Umläufe in regelkonforme Schichten schneiden | S |
| fahrerbedarf_gesamt | Dienste | zählen → Baseline | B |

## 7. regeln (YAML)
| Parameter | Quelle | Art |
|---|---|---|
| Mindesttakt je Gebietstyp/Zeitfenster | Nahverkehrsplan Nürnberg 2025 | D |
| max. Fußweg zur Haltestelle | Nahverkehrsplan / Richtwerte ~300–500 m Bus, ~600–800 m Schiene | D/S |
| Schichtlänge, Pausen, Ruhezeiten | ArbZG, FPersV | D |
| min. Wendezeit, Umstiegszuschlag | Annahme | S |
| ÖV-Anteil Event-Besucher, Anteil Express | Annahme (je Venue) | S |

## 8. ressourcen (synthetisch, F4)
| Tabelle | Attribute | Art |
|---|---|---|
| busse | bus_id, typ (Solo/Gelenk), plaetze, depot, verfuegbar_ab, verfuegbar_bis | S |
| fahrer | fahrer_id, depot, schicht (früh/spät/geteilt), dienstbeginn, dienstende, krank | S |
| auslastung | trip_id, stunde, fahrgaeste, max_besetzung, auslastung_pct | S |
| szenario | szenario_id, seed, fahrer_verfuegbar, busse_verfuegbar, angenommene_vorschlaege[] | B |

## 9. events (F6)
| Attribut | Quelle | Wie | Art |
|---|---|---|---|
| event_id, name, kategorie | `events.yaml` / Veranstaltungskalender Stadt | kuratiert bzw. Export-Schnittstelle | D/S |
| venue, geom | `events.yaml`, OSM | Venue-Koordinate | D |
| beginn, ende | Kalender | direkt | D |
| besucher_erwartet | Kapazität Venue / Annahme | als Annahme kennzeichnen | S |
| shuttle_busse, zeitfenster_an/ab | Bedarfsmodell | `ceil(besucher × oev_anteil × anteil_express / (plaetze × umlaeufe))` | B |

## 10. baustellen (F7)
| Attribut | Quelle | Wie | Art |
|---|---|---|---|
| baustelle_id, strasse, hausnr | Stadt Nürnberg Baustellenliste | scrapen | D |
| geom | OSM / Nominatim | Straße(+Nr.) geocodieren, auf Straßenkante snappen | B |
| von, bis, art | Baustellenliste / BayernInfo | direkt | D |
| wirkung | Annahme je Art | sperrung / einspurig / verzoegerung_pct | S |
