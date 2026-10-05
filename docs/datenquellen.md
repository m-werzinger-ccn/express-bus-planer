# Datenquellen – Track 1 Express-Busse Nürnberg (Stand 05.10.2026)

## Idee (Kurzfassung)
Ein System erkennt mit offenen Daten, wo in Nürnberg Menschen weit von U-/S-Bahn entfernt wohnen und wo Busse wirklich gebraucht werden. Es schichtet Fahrer von schwach genutzten, schienenparallelen Fahrten auf Express-Linien um, die schlecht angebundene Gebiete schnell an U-/S-Bahn-Knoten bringen. Taktisch: Netzplanung pro Fahrplanperiode (MILP, Mindestbedienung, Laufwege, Lenk-/Ruhezeiten). Operativ: Verstärkerbusse live nach Nachfrage.

## Getestet & funktioniert
| Daten | Zugang | Lizenz | Notiz |
|---|---|---|---|
| **VAG Netzbelastung 2023 (Fahrgastzahlen pro Streckenabschnitt)** | https://www.nuernberg.de/imperia/md/verkehrsplanung/dokumente/netzbelastungsplane_2023_nurnberg.pdf | Stadt Nürnberg / VAG (Quelle angeben) | 3 Seiten: Bus, Tram (Herbst 2023), U-Bahn. Bandbreite + Zahl je Abschnitt (alle Linien zusammen, vermutlich Fahrgäste/Werktag). ~1.300 Zahlen auf der Busseite sind als Text mit Koordinaten extrahierbar (`pdftotext -bbox`), Karte nicht georeferenziert → per Passpunkten georeferenzieren und auf GTFS-Abschnitte snappen. Einzige offene Quelle für echte Nachfrage → Kalibrierung/Validierung |
| VGN GTFS (Soll-Fahrplan) | https://www.vgn.de/opendata/GTFS.zip | CC BY 3.0 DE | Getestet: 15 MB, 1.295 Routen (1.206 Bus, 10 U-Bahn, 71 Bahn/S-Bahn, 8 Tram), 25.464 Haltepunkte, gültig 24.06.–12.12.2026. Kein shapes.txt |
| GTFS-Realtime Deutschland | https://realtime.gtfs.de/realtime-free.pb | CC BY-SA 4.0 | Getestet: ~60 MB, alle 10 s, enthält VAG Nürnberg |
| VAG PULS-API (Echtzeit-Abfahrten) | https://start.vag.de/dm/api/abfahrten.json/vgn/{VGNKennung} , Haltestellen: /haltestellen.json/vgn?name=… | CC BY 4.0 | Getestet, ohne Auth. Feld `Besetztgrad` existiert, ist aber aktuell immer "Unbekannt" → VAG fragen, ob befüllbar |
| Zensus 2022 Bevölkerung Gitter | https://www.destatis.de/static/DE/zensus/gitterdaten/Zensus2022_Bevoelkerungszahl.zip | dl-de/by-2-0 | Download erreichbar; 100 m / 1 km / 10 km Gitter |

## Weitere offene Quellen
- VAG OpenData (https://opendata.vag.de): Haltestellen + Geodaten, Fuhrpark Bus, Ausstattung U-Bahnhöfe/Tram, CC BY 4.0
- OpenStreetMap Mittelfranken (Geofabrik): https://download.geofabrik.de/europe/germany/bayern/mittelfranken.html – Fußwegenetz, POIs, Straßen
- Bayern OpenGeodata (https://geodaten.bayern.de/opengeodata/): ALKIS Tatsächliche Nutzung, Hausumringe, LoD2-Gebäude, Verwaltungsgrenzen, DOP; CC BY 4.0, Download pro Gemeinde
- Stadt Nürnberg Statistik: Innergebietliche Strukturdaten (PDF, pro statistischem Bezirk), Interaktiver Bezirksatlas mit Export – https://www.nuernberg.de/internet/statistik/gebietszahlen.html
- Pendleratlas Bundesagentur für Arbeit (Gemeinde-Ebene Ein-/Auspendler): https://statistik.arbeitsagentur.de/DE/Navigation/Statistiken/Interaktive-Statistiken/Pendleratlas/Pendleratlas-Nav.html , Scraper: https://github.com/noerw/pendleratlas
- Nahverkehrsplan Nürnberg Fortschreibung 2025 (Bedienungsstandards, z. B. Bus in dichten Gebieten mind. 15-Min-Takt HVZ/NVZ, stadtweit mind. 30 Min): https://www.nuernberg.de/imperia/md/verkehrsplanung/dokumente/nahverkehrsplan_2025_stadt_nurnberg.pdf
- Verkehrszählung 2025 Stadt Nürnberg: https://www.nuernberg.de/internet/stadtportal/aktuell_97264.html
- VAG Daten & Fakten / Pressemitteilungen: Gesamtfahrgastzahlen zur Kalibrierung
- VGN Netzplan Städteachse (PDF, nur zur Orientierung, nicht georeferenziert): https://www.vgn.de/media/liniennetz-staedteachse.pdf

## Events (F6)
- Veranstaltungskalender Nürnberg/Fürth/Erlangen/Schwabach: https://www.nuernberg.de/internet/veranstaltungskalender/veranstaltungsdatenbank.html – Export als XLS/XML/JSON; automatisierte Export-Schnittstelle für Partner der Städte: https://meine-veranstaltungen.net/dokus/Exportschnittstelle → Zugang anfragen
- Für die Demo: kuratierte `events.yaml` mit großen Venues (Stadion, Arena, Messe, Volksfestplatz, Zeppelinfeld, Hauptmarkt); Besucherzahlen als Annahme kennzeichnen

## Baustellen (F7)
- Stadt Nürnberg „Alle Baustellen im Stadtgebiet“: https://www.nuernberg.de/internet/soer_nbg/alle_baustellen.html – Liste mit Straße, Hausnummer, Zeitraum, Art; kein Download/Feed → scrapen + geocodieren (Nominatim/OSM)
- Größere Baustellen als Karte (BayernInfo): https://www.bayerninfo.de/inbound/nuernberg
- Baustellenmeldungen in Bayern (GovData, DATEX II, eher übergeordnete Straßen): https://www.govdata.de/suche/daten/baustellenmeldungen-in-bayern
- VGN/VAG Fahrplanänderungen: https://www.vgn.de/fahrplanaenderungen/ · https://www.vag.de/fahrplan/fahrplanaenderungen-stoerungen

## Nicht offen → anfragen oder synthetisch
- Fahrgastzahlen pro Linie/Fahrt (APC-Zählungen der VAG) → Fraunhofer IIS / VAG fragen; teilweise ersetzt durch Netzbelastung 2023 (pro Abschnitt, nicht pro Linie/Stunde)
- Dienstpläne / Umläufe → aus GTFS ableiten (Umlaufbildung) + Regeln ArbZG/FPersV synthetisch
- Arbeitsplätze kleinräumig → Proxy aus ALKIS-Nutzung (Gewerbe/Industrie), OSM-POIs, Wirtschaftsstandort-Seite
- Fahrer- und Busbestand → synthetischer Datensatz (`pipeline/40_synthetic.py`, Seed)

## Tools
- r5py (GTFS + OSM → Tür-zu-Tür-Reisezeiten pro Gitterzelle)
- gtfs-kit / partridge (GTFS-Analyse), OSMnx (Fußwege), OR-Tools / PuLP (MILP)
