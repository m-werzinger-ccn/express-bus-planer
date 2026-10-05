# ExpressNetz Nürnberg

**Schneller zur Schiene – mit dem Personal, das schon da ist.**

ExpressNetz zeigt, wo in Nürnberg Menschen weit vom Schienennetz entfernt wohnen, plant Express-Busse zu den großen U- und S-Bahn-Knoten und gewinnt die dafür nötigen Fahrer:innen aus dem bestehenden Busnetz zurück. Automatisch, regelkonform und für jede Entscheidung nachvollziehbar.

![ExpressNetz: Express-Linie und KI-Plan](docs/screenshot-express.png)

*Hackathon Track 1 · Fraunhofer IIS – KI-Optimierung für Express-Busse in Nürnberg trotz Fahrermangel*

---

## Das Problem

- **Rund 199.000 Menschen in Nürnberg wohnen mehr als 800 m von der nächsten U- oder S-Bahn entfernt.** Rund 74.000 von ihnen brauchen heute über 15 Minuten, bis sie überhaupt an der Schiene sind.
- Express-Busse würden diese Gebiete schnell anbinden. Aber **jede neue Linie braucht Fahrer:innen**, und genau die fehlen.
- Das Ergebnis: Busse stehen im Depot, während gleichzeitig manche Fahrten parallel zur U-Bahn fast leer unterwegs sind.

## Die Lösung

ExpressNetz verbindet Netzplanung und Personaleinsatz in einem Werkzeug:

1. **Sehen** – Eine Versorgungs-Heatmap auf Basis echter Einwohnerdaten macht sichtbar, wo der Weg zur Schiene am längsten ist.
2. **Planen** – Ein Klick in die Karte genügt: ExpressNetz wählt den passenden Schienenknoten, berechnet die Route auf dem echten Straßennetz und setzt Halte dort, wo sie am meisten Menschen erreichen.
3. **Ausgleichen** – Ein Optimierungsmodell findet sofort die Fahrten, die sich am verträglichsten ausdünnen lassen, und bringt die Fahrer-Bilanz auf **± 0**. Der Mindesttakt des Nahverkehrsplans bleibt dabei immer eingehalten.
4. **Vorausschauen** – Großveranstaltungen und Baustellen fließen automatisch in die Planung ein.

---

## Funktionen

### Versorgungs-Heatmap
Ein 100-m-Raster über ganz Nürnberg zeigt Einwohner, Fußweg zur nächsten U-/S-Bahn und einen kombinierten Unterversorgungs-Score. Die am schlechtesten angebundenen Gebiete werden automatisch markiert und lassen sich direkt als Startpunkt für eine Express-Linie wählen.

![Versorgungs-Heatmap](docs/screenshot-heatmap.png)

### Express-Planer
Startpunkt anklicken, und ExpressNetz schlägt die drei besten Zielknoten vor, bewertet nach Takt, Linienzahl und Umsteigemöglichkeiten. Für jede Linie sieht man sofort:
- Fahrzeit und Reisezeitgewinn gegenüber heute
- wie viele Einwohner schneller ans Schienennetz kommen
- wie viele Busse und Fahrer:innen der gewählte Takt braucht

Takt, Betriebszeit und Zwischenhalte lassen sich frei anpassen.

### KI-Personalausgleich
Bei jeder Änderung rechnet ExpressNetz im Hintergrund neu und schlägt einen Plan vor, der den Personalbedarf genau ausgleicht. Bevorzugt werden Fahrten, die schwach ausgelastet sind und parallel zur Schiene laufen. Jede Maßnahme ist:
- **sichtbar** – die betroffene Linie wird in der Karte hervorgehoben,
- **begründet** – mit Auslastung, Schienennähe, neuem Takt und Mehrwartezeit,
- **steuerbar** – fixieren, ausschließen oder eigene Maßnahmen hinzufügen. Der Plan passt sich sofort an.

### Event-Express
Ein Veranstaltungskalender plant Shuttle-Busse für Großereignisse wie Heimspiele, Messen oder Konzerte: Anzahl der Busse, An- und Abreisefenster und Routen von den großen Knoten zum Veranstaltungsort. Der zusätzliche Personalbedarf fließt direkt in die Bilanz.

![Event-Express zur Messe](docs/screenshot-event.png)

### Baustellen-Routing
Baustellen werden datumsgenau berücksichtigt. Gesperrte Straßen umfährt ExpressNetz automatisch, Verzögerungen gehen in die Fahrzeit ein, und betroffene Linien werden gekennzeichnet.

### Szenarien
Fertige Vorlagen wie „Krankheitswelle“, „Messe-Mittwoch“ oder „Heimspiel-Samstag“ zeigen in Sekunden, wie robust der Plan ist. Eigene Szenarien lassen sich speichern und wieder laden.

---

## Beispiel aus der Demo

| | |
|---|---|
| **Ausgangslage** | 269 Busse einsatzbereit, aber nur 255 Fahrer:innen in der Spitze – 14 Busse stehen im Depot |
| **Neue Linie** | Express X1 aus dem unterversorgten Süden zur U-Bahn Langwasser Mitte |
| **Wirkung** | Reisezeit ab Start **43 → 25 Minuten**, rund **5.000 Einwohner** kommen schneller zur Schiene |
| **Bedarf** | 4 Busse, 4 Fahrer:innen |
| **Ausgleich** | 4 gezielte Taktanpassungen in der Hauptverkehrszeit, Mindesttakt überall eingehalten |
| **Ergebnis** | **± 0 zusätzliche Fahrer:innen** |

---

## Mehrwert

**Für Fahrgäste** – schnellere Wege aus schlecht angebundenen Stadtteilen zur U- und S-Bahn.

**Für den Verkehrsbetrieb** – mehr Angebot ohne zusätzliches Personal. Vorhandene Fahrzeuge und Fahrer:innen werden dort eingesetzt, wo sie den größten Nutzen haben.

**Für die Planung** – Entscheidungen auf Basis offener Daten, in wenigen Minuten durchgespielt, mit nachvollziehbarer Begründung für jede Maßnahme. Die KI schlägt vor, der Mensch entscheidet.

---

## Datengrundlage

ExpressNetz arbeitet mit **echten offenen Daten**:
- Fahrplan des VGN (GTFS) – Haltestellen, U-/S-Bahn-, Tram- und Buslinien
- Zensus 2022 – Einwohner im 100-m-Raster
- OpenStreetMap – Straßennetz für das Bus-Routing

Personalbestand, Fuhrpark, Auslastung, Veranstaltungen und Baustellen sind für die Demo **realistisch simuliert**, da diese Daten nicht öffentlich sind. Die simulierten Tabellen sind so aufgebaut, dass sie sich später durch echte Betriebsdaten ersetzen lassen.

## Ausblick

- Anbindung echter Fahrgastzählungen und Dienstpläne
- Echtzeitdaten (GTFS-Realtime) für Verstärkerbusse im laufenden Betrieb
- Live-Daten zu Baustellen und Veranstaltungen der Stadt Nürnberg
- Detaillierte Dienstplanregeln (Pausen, Ruhezeiten) direkt im Optimierungsmodell

## Technologie

Python · FastAPI · Optimierung mit gemischt-ganzzahliger Programmierung (PuLP/CBC) · React · MapLibre · deck.gl

---

## Demo starten

Voraussetzungen: Python 3.10 oder neuer, Node 18 oder neuer.

```bash
./start.sh
```

Danach im Browser **http://localhost:8000** öffnen.

Technische Details für das Team: [`PLAN.md`](PLAN.md) · [`docs/datenmodell.md`](docs/datenmodell.md) · [`docs/datenquellen.md`](docs/datenquellen.md)

---

<sub>Daten: VGN GTFS © VGN, CC BY 3.0 DE · Zensus 2022 © Statistisches Bundesamt, dl-de/by-2-0 · © OpenStreetMap-Mitwirkende, ODbL · Kartenstil © CARTO</sub>
