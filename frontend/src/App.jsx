import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import { EXPRESS_COLORS } from './theme.js'
import TopBar from './components/TopBar.jsx'
import LeftPanel from './components/LeftPanel.jsx'
import MapView from './components/MapView.jsx'
import RightPanel from './components/RightPanel.jsx'
import BottomBar from './components/BottomBar.jsx'

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
  const [fehler, setFehler] = useState(null)

  // ---------- Szenario ----------
  const [datum, setDatum] = useState(START_DATUM)
  const [fahrer, setFahrer] = useState(null)
  const [busse, setBusse] = useState(null)
  const [express, setExpress] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [accepted, setAccepted] = useState([])
  const [rejected, setRejected] = useState([])
  const [eventsAus, setEventsAus] = useState([])
  const [method, setMethod] = useState('milp')

  // ---------- UI ----------
  const [layers, setLayers] = useState({ heat: true, rail: true, bus: false, baustellen: true, events: true, hotspots: true })
  const [heatMode, setHeatMode] = useState('score')
  const [mode, setMode] = useState('idle') // idle | start | waypoint
  const [suggestions, setSuggestions] = useState(null)
  const [optInfo, setOptInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [bilanz, setBilanz] = useState(null)
  const [eventPlan, setEventPlan] = useState(null)
  const [highlightLine, setHighlightLine] = useState(null)
  const [allActions, setAllActions] = useState([])
  const [focus, setFocus] = useState(null)

  // Stammdaten laden
  useEffect(() => {
    Promise.all([api.meta(), api.grid(), api.network(), api.hotspots(), api.events(), api.actions()])
      .then(([m, g, n, h, e, a]) => {
        setMeta(m); setGrid(g); setNetwork(n); setHotspots(h); setEvents(e); setAllActions(a)
        setFahrer(m.baseline.fahrer_verfuegbar)
        setBusse(m.baseline.busse_verfuegbar)
      })
      .catch((e) => setFehler(String(e)))
  }, [])

  // Baustellen je Datum
  useEffect(() => {
    api.baustellen(datum).then((fc) => setBaustellen(fc.features)).catch(() => {})
  }, [datum])

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
    setBusy(true)
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
    } catch (e) { setFehler(String(e)) } finally { setBusy(false); setMode('idle') }
  }, [recompute])

  // Datum gewechselt → Routen neu (Baustellen!)
  const lastDatum = useRef(datum)
  useEffect(() => {
    if (lastDatum.current === datum) return
    lastDatum.current = datum
    if (!express.length) return
    Promise.all(express.map((l) => recompute(l, datum))).then(setExpress)
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

  // ---------- Bilanz (Server rechnet, eine Quelle der Wahrheit) ----------
  const needs = useMemo(() => express.filter((l) => l.result).map((l) => l.result.bedarf), [express])
  const bilanzReq = useMemo(() => ({
    fahrer_verfuegbar: fahrer ?? 0, busse_verfuegbar: busse ?? 0, datum, express: needs,
    accepted, rejected, events_aus: eventsAus, method,
  }), [fahrer, busse, datum, needs, accepted, rejected, eventsAus, method])

  useEffect(() => {
    if (fahrer == null) return
    const t = setTimeout(() => api.bilanz(bilanzReq).then(setBilanz).catch((e) => setFehler(String(e))), 150)
    return () => clearTimeout(t)
  }, [bilanzReq, fahrer])

  // ---------- KI-Vorschlag ----------
  const runOptimizer = async () => {
    setBusy(true)
    try {
      const r = await api.optimize(bilanzReq)
      setSuggestions(r.vorschlaege)
      setOptInfo({ methode: r.methode, bedarf: r.bedarf, nachher: r.bilanz_nachher })
    } catch (e) { setFehler(String(e)) } finally { setBusy(false) }
  }
  const accept = (s) => { setAccepted((a) => [...a, s.id]); setSuggestions((xs) => xs?.filter((x) => x.id !== s.id)) }
  const reject = (s) => { setRejected((a) => [...a, s.id]); setSuggestions((xs) => xs?.filter((x) => x.id !== s.id)) }
  const acceptAll = () => { setAccepted((a) => [...a, ...(suggestions || []).map((s) => s.id)]); setSuggestions([]) }
  const undoAccept = (id) => setAccepted((a) => a.filter((x) => x !== id))
  const resetPlan = () => { setAccepted([]); setRejected([]); setSuggestions(null); setOptInfo(null) }

  // ---------- Events ----------
  const openEvent = async (e) => {
    setDatum(e.datum)
    const p = await api.eventPlan(e.id, e.datum)
    setEventPlan(p)
    setFocus({ points: [[e.lon, e.lat], ...p.routen.flatMap((r) => r.coords)] })
  }
  const toggleEventAus = (id) => setEventsAus((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))
  useEffect(() => { if (eventPlan && eventPlan.event.datum !== datum) setEventPlan(null) }, [datum, eventPlan])

  // ---------- Presets & Szenarien ----------
  const applyPreset = (p) => {
    if (!meta) return
    const b = meta.baseline
    if (p === 'normal') { setFahrer(b.fahrer_verfuegbar); setBusse(b.busse_verfuegbar); setDatum(START_DATUM) }
    if (p === 'krank') { setFahrer(Math.round(b.fahrer_bestand * 0.85)); setBusse(b.busse_verfuegbar) }
    if (p === 'messe') { const e = events.find((x) => x.id === 'e3'); if (e) openEvent(e) }
    if (p === 'samstag') { const e = events.find((x) => x.id === 'e1'); if (e) openEvent(e) }
  }
  const snapshot = () => ({ datum, fahrer, busse, accepted, rejected, eventsAus,
    express: express.map(({ result, hubs, ...l }) => ({ ...l, hubs })) })
  const saveScenario = async (name) => { await api.saveScenario(name, snapshot()) }
  const loadScenario = async (sc) => {
    const s = sc.state
    setDatum(s.datum); setFahrer(s.fahrer); setBusse(s.busse); setAccepted(s.accepted); setRejected(s.rejected)
    setEventsAus(s.eventsAus || [])
    const lines = await Promise.all(s.express.map((l) => recompute(l, s.datum)))
    nextId = Math.max(1, ...lines.map((l) => l.id + 1))
    setExpress(lines)
  }

  // KPIs für die untere Leiste
  const kpi = useMemo(() => {
    const ws = express.filter((l) => l.result).map((l) => l.result.wirkung)
    const prof = ws.reduce((a, w) => a + w.einwohner_profitieren, 0)
    const gewinn = prof ? ws.reduce((a, w) => a + w.zeitgewinn_mittel_min * w.einwohner_profitieren, 0) / prof : 0
    return {
      profitieren: prof, gewinn,
      weit: ws.reduce((a, w) => a + w.einwohner_weit_von_schiene, 0),
      fehlend: bilanz ? Math.max(0, -bilanz.fahrer.saldo) : null,
      eventsTag: bilanz?.events?.length ?? 0,
      fahrtenWeniger: bilanz?.fahrten_weniger ?? 0,
      mehrwarte: bilanz?.mehrwartezeit_h ?? 0,
    }
  }, [express, bilanz])

  const acceptedActions = useMemo(() => {
    const m = Object.fromEntries(allActions.map((a) => [a.id, a]))
    return accepted.map((id) => m[id]).filter(Boolean)
  }, [accepted, allActions])

  if (fehler && !meta) return <div className="loading">Backend nicht erreichbar.<br /><small>{fehler}</small><br /><small>Läuft <code>uvicorn app.main:app --port 8000</code> im Ordner backend/?</small></div>
  if (!meta || !grid || !network) return <div className="loading"><div className="spinner" />Lade Daten …</div>

  return (
    <div className="app">
      <TopBar datum={datum} setDatum={setDatum} applyPreset={applyPreset} saveScenario={saveScenario}
        loadScenario={loadScenario} listScenarios={api.scenarios} meta={meta} />
      <LeftPanel meta={meta} fahrer={fahrer} setFahrer={setFahrer} busse={busse} setBusse={setBusse}
        layers={layers} setLayers={setLayers} heatMode={heatMode} setHeatMode={setHeatMode}
        mode={mode} setMode={setMode} runOptimizer={runOptimizer} busy={busy} method={method} setMethod={setMethod}
        hotspots={hotspots} addExpressAt={addExpressAt} />
      <MapView grid={grid} network={network} heatMode={heatMode} layers={layers} express={express}
        activeId={activeId} hotspots={hotspots} baustellen={baustellen} events={events} datum={datum}
        eventPlan={eventPlan} focus={focus} onMapClick={onMapClick} mode={mode} highlightLine={highlightLine}
        acceptedActions={acceptedActions} onEventClick={openEvent} onHotspotClick={(h) => addExpressAt(h.lon, h.lat)} />
      <RightPanel express={express} activeId={activeId} setActiveId={setActiveId} updateLine={updateLine}
        removeLine={removeLine} setMode={setMode} mode={mode} suggestions={suggestions} optInfo={optInfo}
        accept={accept} reject={reject} acceptAll={acceptAll} acceptedActions={acceptedActions} undoAccept={undoAccept}
        resetPlan={resetPlan} bilanz={bilanz} setHighlightLine={setHighlightLine} baustellen={baustellen}
        eventPlan={eventPlan} eventsAus={eventsAus} toggleEventAus={toggleEventAus} closeEvent={() => setEventPlan(null)} />
      <BottomBar datum={datum} setDatum={setDatum} events={events} openEvent={openEvent} eventsAus={eventsAus}
        kpi={kpi} meta={meta} bilanz={bilanz} />
      {fehler && <div className="toast" onClick={() => setFehler(null)}>{fehler}</div>}
    </div>
  )
}
