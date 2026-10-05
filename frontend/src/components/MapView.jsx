import { useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { FlyToInterpolator, WebMercatorViewport } from '@deck.gl/core'
import { GridCellLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { PathStyleExtension } from '@deck.gl/extensions'
import Map from 'react-map-gl/maplibre'
import { C, datumLabel, fmt, heatColor, hex } from '../theme.js'
import Icon from './Icons.jsx'
import CalendarWindow from './CalendarWindow.jsx'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const INITIAL = { longitude: 11.075, latitude: 49.445, zoom: 11.4, pitch: 0, bearing: 0 }
const DASH = new PathStyleExtension({ dash: true })
const FONT = 'Arial, Helvetica, sans-serif'
const WHITE = [255, 255, 255]
// Zellmittelpunkt → linke untere Ecke (≈ 50 m)
const DLON = 0.00069, DLAT = 0.00045

// Alle Heatmap-Modi nutzen dieselbe Farbrampe
function cellColor(c, mode) {
  const [, , pop, dRail, , , score] = c
  if (mode === 'einwohner') return heatColor(Math.sqrt(pop / 260), 170)
  if (mode === 'distanz') return heatColor(dRail / 2200, 60 + Math.min(1, pop / 60) * 140)
  return heatColor(Math.pow(score, 0.75), score > 0.02 ? 50 + Math.min(1, score * 1.6) * 160 : 0)
}

export default function MapView(p) {
  const [hover, setHover] = useState(null)
  const [viewState, setViewState] = useState(INITIAL)
  const box = useRef(null)

  useEffect(() => {
    if (!p.focus || !box.current) return
    const pts = p.focus.points
    const lons = pts.map((c) => c[0]), lats = pts.map((c) => c[1])
    const { width, height } = box.current.getBoundingClientRect()
    const vp = new WebMercatorViewport({ width, height })
    const { longitude, latitude, zoom } = vp.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 90 })
    setViewState((v) => ({ ...v, longitude, latitude, zoom: Math.min(zoom, 14), transitionDuration: 900, transitionInterpolator: new FlyToInterpolator() }))
  }, [p.focus])

  const railPaths = useMemo(() => p.network.rail_lines.map((l) => ({
    ...l,
    color: hex(l.color || (l.mode === 'S' ? C.sbahn : l.mode === 'T' ? C.tram : l.mode === 'R' ? C.regio : C.rail)),
    width: l.mode === 'U' ? 5 : l.mode === 'S' ? 3.5 : l.mode === 'T' ? 2.5 : 1.5,
  })), [p.network])
  const busByName = useMemo(() => Object.fromEntries(p.network.bus_lines.map((l) => [l.name, l])), [p.network])

  // KI-Plan: eine Linie kann mehrere Maßnahmen haben (verschiedene Zeitfenster)
  const selected = p.plan.find((a) => a.id === p.selectedAction)
  const planLines = useMemo(() => {
    const by = {}
    p.plan.forEach((a) => { (by[a.linie] = by[a.linie] || []).push(a) })
    return Object.entries(by).map(([name, actions]) => ({ ...busByName[name], name, actions, frei: actions.reduce((s, a) => s + a.fahrer_frei, 0) }))
      .filter((l) => l.path)
  }, [p.plan, busByName])
  const isHot = (l) => l.name === selected?.linie || l.name === p.hoverLine

  const bauPaths = useMemo(() => p.baustellen.flatMap((f) => f.geometry.coordinates.map((path) => ({ path, props: f.properties }))), [p.baustellen])
  const bauPoints = useMemo(() => p.baustellen.map((f) => {
    const line = f.geometry.coordinates[0]
    return { position: line[Math.floor(line.length / 2)], props: f.properties }
  }), [p.baustellen])

  const active = p.express.find((l) => l.id === p.activeId)
  const label = { fontFamily: FONT, fontWeight: 700, outlineWidth: 4, outlineColor: [255, 255, 255, 230], fontSettings: { sdf: true }, characterSet: 'auto' }

  const layers = [
    p.layers.heat && new GridCellLayer({
      id: 'grid', data: p.grid.cells, cellSize: 100, extruded: false, pickable: true,
      getPosition: (c) => [c[0] - DLON, c[1] - DLAT], getFillColor: (c) => cellColor(c, p.heatMode),
      updateTriggers: { getFillColor: p.heatMode },
    }),
    p.layers.bus && new PathLayer({
      id: 'bus-casing', data: p.network.bus_lines, getPath: (d) => d.path, getColor: [255, 255, 255, 220],
      widthUnits: 'pixels', getWidth: 4.5, capRounded: true, jointRounded: true,
    }),
    p.layers.bus && new PathLayer({
      id: 'bus', data: p.network.bus_lines, getPath: (d) => d.path, getColor: hex(C.bus, 230),
      widthUnits: 'pixels', getWidth: 2.2, capRounded: true, jointRounded: true, pickable: true,
    }),
    p.layers.rail && new PathLayer({
      id: 'rail', data: railPaths, getPath: (d) => d.path, getColor: (d) => d.color, widthUnits: 'pixels',
      getWidth: (d) => d.width, getDashArray: (d) => (d.mode === 'S' ? [4, 2] : [0, 0]), extensions: [DASH],
      capRounded: true, jointRounded: true, pickable: true,
    }),
    p.layers.plan && planLines.length && new PathLayer({
      id: 'plan-glow', data: planLines.filter(isHot), getPath: (d) => d.path, getColor: hex(C.plan, 70),
      widthUnits: 'pixels', getWidth: 16, capRounded: true, jointRounded: true,
      updateTriggers: { data: [p.selectedAction, p.hoverLine] },
    }),
    p.layers.plan && planLines.length && new PathLayer({
      id: 'plan', data: planLines, getPath: (d) => d.path, getColor: (d) => hex(C.plan, isHot(d) || !selected ? 255 : 150),
      widthUnits: 'pixels', getWidth: (d) => (isHot(d) ? 7 : 4.5), getDashArray: [3, 1.5], extensions: [DASH],
      capRounded: true, jointRounded: true, pickable: true,
      updateTriggers: { getColor: [p.selectedAction, p.hoverLine], getWidth: [p.selectedAction, p.hoverLine] },
    }),
    p.layers.bus && new ScatterplotLayer({
      id: 'bus-stops', data: p.network.bus_stops, getPosition: (d) => [d.lon, d.lat], getRadius: 2.6, radiusUnits: 'pixels',
      getFillColor: WHITE, stroked: true, getLineColor: hex(C.bus), lineWidthUnits: 'pixels', getLineWidth: 1.3, pickable: true,
    }),
    p.layers.rail && new ScatterplotLayer({
      id: 'rail-st', data: p.network.rail_stations, getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => 3 + d.hub_score * 5, radiusUnits: 'pixels', getFillColor: WHITE, stroked: true,
      getLineColor: [31, 31, 31], lineWidthUnits: 'pixels', getLineWidth: 2, pickable: true,
    }),
    p.layers.plan && planLines.length && new TextLayer({
      ...label, id: 'plan-tx', data: planLines, getPosition: (d) => d.path[Math.floor(d.path.length / 2)],
      getText: (d) => `${d.name}  −${d.frei}`, getSize: (d) => (isHot(d) ? 15 : 12), getColor: hex(C.plan),
      background: true, getBackgroundColor: [255, 255, 255, 235], backgroundPadding: [5, 3], getBorderColor: hex(C.plan), getBorderWidth: 1.5,
      pickable: true, updateTriggers: { getSize: [p.selectedAction, p.hoverLine] },
    }),
    p.layers.baustellen && new PathLayer({
      id: 'bau', data: bauPaths, getPath: (d) => d.path, getColor: hex(C.bau, 240), widthUnits: 'pixels', getWidth: 6, pickable: true,
    }),
    p.layers.baustellen && new ScatterplotLayer({
      id: 'bau-pt', data: bauPoints, getPosition: (d) => d.position, getRadius: 9, radiusUnits: 'pixels',
      getFillColor: hex(C.bau), stroked: true, getLineColor: WHITE, lineWidthUnits: 'pixels', getLineWidth: 2, pickable: true,
    }),
    p.layers.baustellen && new TextLayer({
      fontFamily: FONT, id: 'bau-tx', data: bauPoints, getPosition: (d) => d.position, getText: () => '!', getSize: 13,
      getColor: [31, 31, 31], fontWeight: 800, getTextAnchor: 'middle', getAlignmentBaseline: 'center',
    }),
    p.eventPlan && new PathLayer({
      id: 'ev-routes', data: p.eventPlan.routen, getPath: (d) => d.coords, getColor: hex(C.event, 230), widthUnits: 'pixels',
      getWidth: 4, getDashArray: [3, 2], extensions: [DASH], pickable: true,
    }),
    p.layers.events && new ScatterplotLayer({
      id: 'events', data: p.events, getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => (d.datum === p.datum ? 11 : 7), radiusUnits: 'pixels',
      getFillColor: (d) => hex(C.event, d.datum === p.datum ? 255 : 150), stroked: true, getLineColor: WHITE,
      lineWidthUnits: 'pixels', getLineWidth: 2.5, pickable: true, updateTriggers: { getRadius: p.datum, getFillColor: p.datum },
    }),
    p.layers.events && new TextLayer({
      ...label, id: 'events-tx', data: p.events.filter((e) => e.datum === p.datum), getPosition: (d) => [d.lon, d.lat],
      getText: (d) => d.venue, getSize: 12, getColor: hex(C.event), getPixelOffset: [0, -20],
    }),
    p.layers.hotspots && new ScatterplotLayer({
      id: 'hotspots', data: p.hotspots, getPosition: (d) => [d.lon, d.lat], getRadius: 650, radiusUnits: 'meters',
      filled: true, getFillColor: [11, 114, 133, 18], stroked: true, getLineColor: [11, 114, 133, 220],
      lineWidthUnits: 'pixels', getLineWidth: 1.8, pickable: true,
    }),
    p.layers.hotspots && new TextLayer({
      ...label, id: 'hotspots-tx', data: p.hotspots.map((h, i) => ({ ...h, i })), getPosition: (d) => [d.lon, d.lat],
      getText: (d) => `Gebiet ${d.i + 1}`, getSize: 11, getColor: [11, 114, 133], getPixelOffset: [0, -30],
    }),
    ...p.express.filter((l) => l.result).flatMap((l) => {
      const isA = l.id === p.activeId
      const col = hex(l.color)
      return [
        new PathLayer({
          id: `xc-${l.id}`, data: [l], getPath: (d) => d.result.route, getColor: WHITE, widthUnits: 'pixels',
          getWidth: isA ? 10 : 8, capRounded: true, jointRounded: true,
        }),
        new PathLayer({
          id: `x-${l.id}`, data: [l], getPath: (d) => d.result.route, getColor: col, widthUnits: 'pixels',
          getWidth: isA ? 6 : 4.5, capRounded: true, jointRounded: true, pickable: true,
        }),
        new ScatterplotLayer({
          id: `xs-${l.id}`, data: l.result.stops, getPosition: (d) => [d.lon, d.lat], getRadius: (d) => (d.name === 'Start' ? 8 : 5),
          radiusUnits: 'pixels', getFillColor: (d) => (d.name === 'Start' ? col : WHITE), stroked: true,
          getLineColor: (d) => (d.name === 'Start' ? WHITE : col), lineWidthUnits: 'pixels', getLineWidth: 2.5, pickable: true,
        }),
        new ScatterplotLayer({
          id: `xh-${l.id}`, data: [l.result.hub], getPosition: (d) => [d.lon, d.lat], getRadius: 13, radiusUnits: 'pixels',
          filled: false, stroked: true, getLineColor: col, lineWidthUnits: 'pixels', getLineWidth: 3,
        }),
        new TextLayer({
          ...label, id: `xt-${l.id}`, data: [{ pos: l.start, name: l.name }, { pos: [l.result.hub.lon, l.result.hub.lat], name: l.result.hub.name.replace('Nürnberg ', '') }],
          getPosition: (d) => d.pos, getText: (d) => d.name, getSize: 13, getColor: col, getPixelOffset: [0, -20],
        }),
      ]
    }),
    active && active.hubs && new ScatterplotLayer({
      id: 'hub-cands', data: active.hubs.filter((h) => h.id !== active.hubId), getPosition: (d) => [d.lon, d.lat],
      getRadius: 10, radiusUnits: 'pixels', filled: false, stroked: true, getLineColor: [...hex(active.color).slice(0, 3), 150],
      lineWidthUnits: 'pixels', getLineWidth: 1.5,
    }),
  ].filter(Boolean)

  // Eigener Klick-Handler (robuster als Deck-onClick mit MapLibre-Kind): Drag ≠ Klick
  const deckRef = useRef(null)
  const down = useRef(null)
  const clickRef = useRef(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onDown = (e) => { down.current = [e.clientX, e.clientY] }
    const onUp = (e) => {
      const d = down.current
      down.current = null
      if (!d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 5) return
      if (e.target.closest('.maplibregl-ctrl, .cal-window, .cal-btn')) return
      const deck = deckRef.current?.deck
      if (!deck) return
      const r = el.getBoundingClientRect()
      const x = e.clientX - r.left, y = e.clientY - r.top
      const picked = deck.pickObject({ x, y, radius: 5, layerIds: ['plan', 'plan-tx', 'hotspots', 'events'] })
      const coordinate = deck.getViewports()[0]?.unproject([x, y])
      clickRef.current?.({ layer: picked?.layer, object: picked?.object, coordinate })
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp) }
  }, [])

  const onClick = (info) => {
    const id = info.layer?.id
    if (p.mode === 'idle' && (id === 'plan' || id === 'plan-tx')) return p.onSelectAction(info.object.actions[0])
    if (id === 'hotspots' && p.mode !== 'waypoint') return p.onHotspotClick(info.object)
    if (id === 'events' && p.mode === 'idle') return p.onEventClick(info.object)
    if (p.mode !== 'idle' && info.coordinate) p.onMapClick(info.coordinate[0], info.coordinate[1])
  }
  clickRef.current = onClick

  return (
    <div ref={box} className={`map ${p.mode !== 'idle' ? 'picking' : ''}`}>
      <DeckGL ref={deckRef} viewState={viewState} onViewStateChange={(e) => setViewState(e.viewState)} controller layers={layers}
        onHover={(i) => setHover(i.object ? i : null)}
        getCursor={({ isHovering }) => (p.mode !== 'idle' ? 'crosshair' : isHovering ? 'pointer' : 'grab')}>
        <Map mapStyle={MAP_STYLE} attributionControl={{ compact: true }} />
      </DeckGL>
      {hover && <Tooltip info={hover} gemeinden={p.grid.gemeinden} />}
      {p.mode !== 'idle' && <div className="map-banner">{p.mode === 'start' ? 'Startpunkt der Express-Linie anklicken' : 'Zwischenhalt anklicken'}</div>}
      <button className={`cal-btn ${p.calOpen ? 'on' : ''}`} onClick={() => p.setCalOpen(!p.calOpen)}>
        <Icon name="calendar" size={18} />
        <span>{datumLabel(p.datum)}</span>
      </button>
      {p.calOpen && (
        <CalendarWindow datum={p.datum} setDatum={p.setDatum} events={p.events} eventsAus={p.eventsAus}
          onEventClick={p.onEventClick} onClose={() => p.setCalOpen(false)} />
      )}
    </div>
  )
}

function Tooltip({ info, gemeinden }) {
  const { x, y, object: o, layer } = info
  let body = null
  const id = layer.id
  if (id === 'grid') {
    body = (<>
      <b>Rasterzelle 100 m · {gemeinden[o[7]]}</b>
      <div>Einwohner: {fmt(o[2])}</div>
      <div>Fußweg zur U-/S-Bahn: {fmt(o[3])} m</div>
      <div>Fußweg zum Bus/Tram: {fmt(o[4])} m</div>
      <div>Zeit bis Schiene heute: ca. {fmt(o[5], 1)} min</div>
      <div className={o[6] > 0.4 ? 'bad' : ''}>Unterversorgung: {o[6] > 0.6 ? 'hoch' : o[6] > 0.25 ? 'mittel' : o[6] > 0 ? 'gering' : 'keine'}</div>
    </>)
  } else if (id === 'rail-st') {
    body = (<><b>{o.name}</b><div>{o.rail_deps_h} Abfahrten/h Schiene · Knoten-Score {fmt(o.hub_score * 100)}</div><div className="muted">{o.lines.slice(0, 12).join(', ')}</div></>)
  } else if (id === 'bus-stops') {
    body = (<><b>{o.name}</b><div>Bus: {o.lines.join(', ')}</div><div className="muted">{fmt(o.bus_deps_h, 1)} Abfahrten/h (6–20 Uhr)</div></>)
  } else if (id === 'rail' || id === 'bus') {
    body = <b>{id === 'rail' ? '' : 'Buslinie '}{o.name}</b>
  } else if (id === 'plan' || id === 'plan-tx') {
    body = (<><b>KI-Plan · Linie {o.name}</b>{o.actions.map((a) => <div key={a.id}>{a.titel.replace(`Linie ${o.name} · `, '')} · +{a.fahrer_frei} Fahrer:in</div>)}<div className="muted">Klick zeigt Details</div></>)
  } else if (id === 'bau' || id === 'bau-pt') {
    const b = o.props
    body = (<><b>Baustelle {b.strasse}</b><div>{b.art} · {b.wirkung === 'sperrung' ? 'Vollsperrung' : `${b.wirkung} (+${b.verzoegerung_pct} %)`}</div><div>{b.von} bis {b.bis}</div><div className="muted">fiktiv</div></>)
  } else if (id === 'events') {
    body = (<><b>{o.name}</b><div>{o.venue} · {o.datum} {o.beginn}–{o.ende}</div><div>ca. {fmt(o.besucher)} Besucher (Annahme)</div><div className="muted">Klick plant den Event-Express</div></>)
  } else if (id === 'hotspots') {
    body = (<><b>Unterversorgtes Gebiet</b><div>{fmt(o.einwohner_weit_von_schiene)} Einw. über 800 m von der Schiene</div><div>Zeit bis Schiene ca. {fmt(o.zeit_bis_schiene_min, 1)} min</div><div className="muted">Klick plant einen Express von hier</div></>)
  } else if (id.startsWith('xs-')) {
    body = (<><b>{o.name}{o.auto ? ' (automatisch)' : ''}</b><div>{fmt(o.fahrzeit_bis_knoten_min, 1)} min bis zum Knoten</div></>)
  } else if (id.startsWith('x-')) {
    body = (<><b>Express {o.name}</b><div>{o.result.fahrzeit_min} min · {o.result.laenge_km} km bis {o.result.hub.name}</div></>)
  } else if (id === 'ev-routes') {
    body = (<><b>Event-Shuttle ab {o.von}</b><div>{o.busse} Busse · {o.fahrzeit_min} min Fahrt</div></>)
  }
  if (!body) return null
  return <div className="tooltip" style={{ left: x + 14, top: y + 14 }}>{body}</div>
}
