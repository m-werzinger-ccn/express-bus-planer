import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import { EXPRESS_COLORS } from './theme.js'
import TopBar from './components/TopBar.jsx'
import LeftPanel from './components/LeftPanel.jsx'
import MapView from './components/MapView.jsx'
import RightPanel from './components/RightPanel.jsx'

const START_DATUM = '2026-10-13' // Di, Werktag = GTFS-Stichtag

let nextId = 1

export default function App() {
  // ---------- Stammdaten ----------
  const [meta, setMeta] = useState(null)
  const [grid, setGrid] = useState(null)
  const [network, setNetwork] = useState(null)
  const [hotspots, setHotspots] = useState([])
  const [events, setEvents] = useState([])
  const [baustellen, setBaustellen] = useState([])
  const [allActions, setAllActions] = useState([])
  const [fehler, setFehler] = useState(null)

  // ---------- Szenario ----------
  const [datum, setDatum] = useState(START_DATUM)
  const [fahrer, setFahrer] = useState(null)
  const [busse, setBusse] = useState(null)
  const [express, setExpress] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [pinned, setPinned] = useState([])     // vom Menschen fixierte Maßnahmen
  const [excluded, setExcluded] = useState([]) // vom Menschen ausgeschlossene Maßnahmen
  const [eventsAus, setEventsAus] = useState([])

  // ---------- Ergebnis KI-Plan (automatisch) ----------
  const [plan, setPlan] = useState([])
  const [bilanz, setBilanz] = useState(null)
  const [bilanzOhne, setBilanzOhne] = useState(null)
  const [planEvents, setPlanEvents] = useState([])
  const [rechnet, setRechnet] = useState(false)

  // ---------- UI ----------
  const [layers, setLayers] = useState({ heat: true, rail: true, bus: true, plan: true, baustellen: true, events: true, hotspots: true })
  const [heatMode, setHeatMode] = useState('score')
  const [mode, setMode] = useState('idle') // idle | start | waypoint
  const [eventPlan, setEventPlan] = useState(null)
  const [selectedAction, setSelectedAction] = useState(null)
  const [hoverLine, setHoverLine] = useState(null)
  const [focus, setFocus] = useState(null)
  const [calOpen, setCalOpen] = useState(false)

  useEffect(() => {
    Promise.all([api.meta(), api.grid(), api.network(), api.hotspots(), api.events(), api.actions()])
      .then(([m, g, n, h, e, a]) => {
        setMeta(m); setGrid(g); setNetwork(n); setHotspots(h); setEvents(e); setAllActions(a)
        setFahrer(m.baseline.fahrer_spitze_verfuegbar)
        setBusse(m.baseline.busse_verfuegbar)
      })
      .catch((e) => setFehler(String(e)))
  }, [])

  useEffect(() => { api.baustellen(datum).then((fc) => setBaustellen(fc.features)).catch(() => {}) }, [datum])

  // ---------- Express-Linien ----------
  const recompute = useCallback(async (line, d = datum) => {
    if (!line.hubId) return line
    const result = await api.express({
      start: line.start, hub_id: line.hubId, waypoints: line.waypoints, takt: line.takt,
      betriebszeit: line.betriebszeit, datum: d, auto_stops: line.autoStops,
    })
    return { ...line, result }
  }, [datum])

  const updateLine = useCallback(async (id, patch) => {
    const line = express.find((l) => l.id === id)
    if (!line) return
    const next = await recompute({ ...line, ...patch })
    setExpress((xs) => xs.map((l) => (l.id === id ? next : l)))
  }, [express, recompute])

  const addExpressAt = useCallback(async (lon, lat) => {
    try {
      const hubs = await api.hubs(lon, lat)
      const id = nextId++
      const line = {
        id, name: `X${id}`, color: EXPRESS_COLORS[(id - 1) % EXPRESS_COLORS.length],
        start: [lon, lat], hubs, hubId: hubs[0]?.id, waypoints: [], takt: 15, betriebszeit: 'HVZ', autoStops: true,
      }
      const done = await recompute(line)
      setExpress((xs) => [...xs, done])
      setActiveId(id)
      if (done.result) setFocus({ points: [...done.result.route, [done.result.hub.lon, done.result.hub.lat]] })
    } catch (e) { setFehler(String(e)) } finally { setMode('idle') }
  }, [recompute])

  const lastDatum = useRef(datum)
  useEffect(() => {
    if (lastDatum.current === datum) return
    lastDatum.current = datum
    if (express.length) Promise.all(express.map((l) => recompute(l, datum))).then(setExpress)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datum])

  const onMapClick = useCallback((lon, lat) => {
    if (mode === 'start') addExpressAt(lon, lat)
    else if (mode === 'waypoint' && activeId) {
      const line = express.find((l) => l.id === activeId)
      if (line) updateLine(activeId, { waypoints: [...line.waypoints, [lon, lat]] })
      setMode('idle')
    }
  }, [mode, activeId, express, addExpressAt, updateLine])

  const removeLine = (id) => setExpress((xs) => xs.filter((l) => l.id !== id))

  // ---------- KI-Plan: bei jeder Änderung automatisch auf ± 0 rechnen ----------
  const needs = useMemo(() => express.filter((l) => l.result).map((l) => l.result.bedarf), [express])
  const req = useMemo(() => ({
    fahrer_verfuegbar: fahrer ?? 0, busse_verfuegbar: busse ?? 0, datum, express: needs,
    accepted: pinned, rejected: excluded, events_aus: eventsAus,
  }), [fahrer, busse, datum, needs, pinned, excluded, eventsAus])

  useEffect(() => {
    if (fahrer == null) return
    setRechnet(true)
    let alive = true
    const t = setTimeout(() => {
      Promise.all([api.optimize(req), api.bilanz({ ...req, accepted: [] })])
        .then(([o, ohne]) => {
          if (!alive) return
          setPlan(o.plan); setBilanz(o.bilanz_nachher); setBilanzOhne(ohne); setPlanEvents(ohne.events || [])
        })
        .catch((e) => setFehler(String(e)))
        .finally(() => alive && setRechnet(false))
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [req, fahrer])

  const selectAction = (a) => {
    setSelectedAction(a?.id ?? null)
    const line = a && network?.bus_lines.find((l) => l.name === a.linie)
    if (line) setFocus({ points: line.path })
  }
  const togglePin = (a) => setPinned((xs) => (xs.includes(a.id) ? xs.filter((x) => x !== a.id) : [...xs, a.id]))
  const exclude = (a) => { setExcluded((xs) => [...xs, a.id]); setPinned((xs) => xs.filter((x) => x !== a.id)) }
  const resetExcluded = () => setExcluded([])

  // ---------- Events ----------
  const openEvent = async (e) => {
    setDatum(e.datum)
    const p = await api.eventPlan(e.id, e.datum)
    setEventPlan(p)
    setFocus({ points: [[e.lon, e.lat], ...p.routen.flatMap((r) => r.coords)] })
  }
  const toggleEventAus = (id) => setEventsAus((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))
  useEffect(() => { if (eventPlan && eventPlan.event.datum !== datum) setEventPlan(null) }, [datum, eventPlan])

  // ---------- Vorlagen & Szenarien ----------
  const applyPreset = (p) => {
    if (!meta) return
    const b = meta.baseline
    if (p === 'normal') { setFahrer(b.fahrer_spitze_verfuegbar); setBusse(b.busse_verfuegbar); setDatum(START_DATUM) }
    if (p === 'krank') { setFahrer(Math.round(b.fahrer_spitze_bestand * 0.85)); setBusse(b.busse_verfuegbar) }
    if (p === 'messe') { const e = events.find((x) => x.id === 'e3'); if (e) openEvent(e) }
    if (p === 'samstag') { const e = events.find((x) => x.id === 'e1'); if (e) openEvent(e) }
  }
  const snapshot = () => ({ datum, fahrer, busse, pinned, excluded, eventsAus,
    express: express.map(({ result, ...l }) => l) })
  const saveScenario = async (name) => { await api.saveScenario(name, snapshot()) }
  const loadScenario = async (sc) => {
    const s = sc.state
    setDatum(s.datum); setFahrer(s.fahrer); setBusse(s.busse)
    setPinned(s.pinned || s.accepted || []); setExcluded(s.excluded || s.rejected || []); setEventsAus(s.eventsAus || [])
    const lines = await Promise.all(s.express.map((l) => recompute(l, s.datum)))
    nextId = Math.max(1, ...lines.map((l) => l.id + 1))
    setExpress(lines)
  }

  if (fehler && !meta) return <div className="loading">Backend nicht erreichbar.<br /><small>{fehler}</small><br /><small>Läuft <code>uvicorn app.main:app --port 8000</code> im Ordner backend/?</small></div>
  if (!meta || !grid || !network) return <div className="loading"><div className="spinner" />Lade Daten …</div>

  return (
    <div className="app">
      <TopBar applyPreset={applyPreset} saveScenario={saveScenario} loadScenario={loadScenario} listScenarios={api.scenarios} meta={meta} />
      <LeftPanel meta={meta} fahrer={fahrer} setFahrer={setFahrer} busse={busse} setBusse={setBusse}
        layers={layers} setLayers={setLayers} heatMode={heatMode} setHeatMode={setHeatMode} mode={mode} setMode={setMode} />
      <MapView grid={grid} network={network} heatMode={heatMode} layers={layers} express={express}
        activeId={activeId} hotspots={hotspots} baustellen={baustellen} events={events} datum={datum} setDatum={setDatum}
        eventPlan={eventPlan} focus={focus} onMapClick={onMapClick} mode={mode} plan={plan}
        selectedAction={selectedAction} hoverLine={hoverLine} onSelectAction={selectAction}
        onEventClick={openEvent} onHotspotClick={(h) => addExpressAt(h.lon, h.lat)}
        calOpen={calOpen} setCalOpen={setCalOpen} eventsAus={eventsAus} />
      <RightPanel express={express} activeId={activeId} setActiveId={setActiveId} updateLine={updateLine}
        removeLine={removeLine} setMode={setMode} mode={mode} baustellen={baustellen}
        plan={plan} allActions={allActions} pinned={pinned} excluded={excluded} rechnet={rechnet}
        selectedAction={selectedAction} selectAction={selectAction} togglePin={togglePin} exclude={exclude}
        resetExcluded={resetExcluded} setHoverLine={setHoverLine}
        bilanz={bilanz} bilanzOhne={bilanzOhne} planEvents={planEvents}
        eventPlan={eventPlan} eventsAus={eventsAus} toggleEventAus={toggleEventAus} closeEvent={() => setEventPlan(null)} />
      {fehler && <div className="toast" onClick={() => setFehler(null)}>{fehler}</div>}
    </div>
  )
}
