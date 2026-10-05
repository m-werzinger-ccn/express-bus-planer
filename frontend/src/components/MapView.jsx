import { useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { FlyToInterpolator, WebMercatorViewport } from '@deck.gl/core'
import { GridCellLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { PathStyleExtension } from '@deck.gl/extensions'
import Map from 'react-map-gl/maplibre'
import { C, fmt, heatColor, hex, popColor } from '../theme.js'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const INITIAL = { longitude: 11.075, latitude: 49.445, zoom: 11.4, pitch: 0, bearing: 0 }
const DASH = new PathStyleExtension({ dash: true })
const FONT = 'Inter, Helvetica, Arial, sans-serif'
// Zellmittelpunkt → linke untere Ecke (≈ 50 m)
const DLON = 0.00069, DLAT = 0.00045

function cellColor(c, mode) {
  const [, , pop, dRail, , , score] = c
  if (mode === 'einwohner') return popColor(Math.sqrt(pop / 260), 175)
  if (mode === 'distanz') return heatColor(dRail / 2200, 50 + Math.min(1, pop / 60) * 160)
  return heatColor(Math.pow(score, 0.75), score > 0.02 ? 35 + Math.min(1, score * 1.6) * 190 : 14)
}

export default function MapView(p) {
  const [hover, setHover] = useState(null)
  const [viewState, setViewState] = useState(INITIAL)
  const box = useRef(null)

  // Auf neue Express-Linie / Event zoomen
  useEffect(() => {
    if (!p.focus || !box.current) return
    const pts = p.focus.points
    const lons = pts.map((c) => c[0]), lats = pts.map((c) => c[1])
    const { width, height } = box.current.getBoundingClientRect()
    const vp = new WebMercatorViewport({ width, height })
    const { longitude, latitude, zoom } = vp.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 90 })
    setViewState((v) => ({ ...v, longitude, latitude, zoom: Math.min(zoom, 13.5), transitionDuration: 900, transitionInterpolator: new FlyToInterpolator() }))
  }, [p.focus])

  const railPaths = useMemo(() => p.network.rail_lines.map((l) => ({
    ...l,
    color: hex(l.color || (l.mode === 'S' ? C.sbahn : l.mode === 'T' ? C.tram : l.mode === 'R' ? C.regio : C.rail)),
    width: l.mode === 'U' ? 5 : l.mode === 'S' ? 3.5 : l.mode === 'T' ? 2 : 1.5,
  })), [p.network])
  const busByName = useMemo(() => Object.fromEntries(p.network.bus_lines.map((l) => [l.name, l])), [p.network])
  const ausgeduennt = useMemo(() => [...new Set(p.acceptedActions.map((a) => a.linie))].map((n) => busByName[n]).filter(Boolean), [p.acceptedActions, busByName])

  const bauPaths = useMemo(() => p.baustellen.flatMap((f) => f.geometry.coordinates.map((path) => ({ path, props: f.properties }))), [p.baustellen])
  const bauPoints = useMemo(() => p.baustellen.map((f) => {
    const line = f.geometry.coordinates[0]
    return { position: line[Math.floor(line.length / 2)], props: f.properties }
  }), [p.baustellen])

  const active = p.express.find((l) => l.id === p.activeId)

  const layers = [
    p.layers.heat && new GridCellLayer({
      id: 'grid', data: p.grid.cells, cellSize: 100, extruded: false, pickable: true,
      getPosition: (c) => [c[0] - DLON, c[1] - DLAT], getFillColor: (c) => cellColor(c, p.heatMode),
      updateTriggers: { getFillColor: p.heatMode },
    }),
    p.layers.bus && new PathLayer({
      id: 'bus', data: p.network.bus_lines, getPath: (d) => d.path, getColor: [148, 163, 184, 110],
      widthUnits: 'pixels', getWidth: 1.5, pickable: true,
    }),
    ausgeduennt.length && new PathLayer({
      id: 'bus-thin', data: ausgeduennt, getPath: (d) => d.path, getColor: [248, 113, 113, 170],
      widthUnits: 'pixels', getWidth: 2.5, getDashArray: [2, 2], extensions: [DASH], pickable: true,
    }),
    p.highlightLine && busByName[p.highlightLine] && new PathLayer({
      id: 'bus-hl', data: [busByName[p.highlightLine]], getPath: (d) => d.path, getColor: hex('#FDE047'),
      widthUnits: 'pixels', getWidth: 5,
    }),
    p.layers.rail && new PathLayer({
      id: 'rail', data: railPaths, getPath: (d) => d.path, getColor: (d) => d.color, widthUnits: 'pixels',
      getWidth: (d) => d.width, getDashArray: (d) => (d.mode === 'S' ? [4, 2] : [0, 0]), extensions: [DASH],
      capRounded: true, jointRounded: true, pickable: true,
    }),
    p.layers.rail && new ScatterplotLayer({
      id: 'rail-st', data: p.network.rail_stations, getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => 2.5 + d.hub_score * 5, radiusUnits: 'pixels', getFillColor: hex(C.bg), stroked: true,
      getLineColor: [248, 250, 252, 230], lineWidthUnits: 'pixels', getLineWidth: 1.5, pickable: true,
    }),
    p.layers.baustellen && new PathLayer({
      id: 'bau', data: bauPaths, getPath: (d) => d.path, getColor: hex(C.bau, 230), widthUnits: 'pixels', getWidth: 6, pickable: true,
    }),
    p.layers.baustellen && new ScatterplotLayer({
      id: 'bau-pt', data: bauPoints, getPosition: (d) => d.position, getRadius: 9, radiusUnits: 'pixels',
      getFillColor: hex(C.bau), stroked: true, getLineColor: hex(C.bg), lineWidthUnits: 'pixels', getLineWidth: 2, pickable: true,
    }),
    p.layers.baustellen && new TextLayer({ fontFamily: FONT,
      id: 'bau-tx', data: bauPoints, getPosition: (d) => d.position, getText: () => '!', getSize: 13,
      getColor: hex(C.bg), fontWeight: 800, getTextAnchor: 'middle', getAlignmentBaseline: 'center',
    }),
    p.eventPlan && new PathLayer({
      id: 'ev-routes', data: p.eventPlan.routen, getPath: (d) => d.coords, getColor: hex(C.event, 230), widthUnits: 'pixels',
      getWidth: 4, getDashArray: [3, 2], extensions: [DASH], pickable: true,
    }),
    p.layers.events && new ScatterplotLayer({
      id: 'events', data: p.events, getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => (d.datum === p.datum ? 14 : 8), radiusUnits: 'pixels',
      getFillColor: (d) => hex(C.event, d.datum === p.datum ? 255 : 140), stroked: true, getLineColor: [255, 255, 255, 200],
      lineWidthUnits: 'pixels', getLineWidth: 1.5, pickable: true, updateTriggers: { getRadius: p.datum, getFillColor: p.datum },
    }),
    p.layers.events && new TextLayer({ fontFamily: FONT,
      id: 'events-tx', data: p.events.filter((e) => e.datum === p.datum), getPosition: (d) => [d.lon, d.lat],
      getText: () => '★', getSize: 14, getColor: [255, 255, 255], characterSet: ['★'],
      getTextAnchor: 'middle', getAlignmentBaseline: 'center',
    }),
    p.layers.hotspots && new ScatterplotLayer({
      id: 'hotspots', data: p.hotspots, getPosition: (d) => [d.lon, d.lat], getRadius: 650, radiusUnits: 'meters',
      filled: true, getFillColor: [253, 224, 71, 18], stroked: true, getLineColor: [253, 224, 71, 200],
      lineWidthUnits: 'pixels', getLineWidth: 1.5, getDashArray: [3, 3], pickable: true,
    }),
    p.layers.hotspots && new TextLayer({ fontFamily: FONT,
      id: 'hotspots-tx', data: p.hotspots.map((h, i) => ({ ...h, i })), getPosition: (d) => [d.lon, d.lat],
      getText: (d) => `Hotspot ${d.i + 1}`, getSize: 11, getColor: [253, 230, 138], getPixelOffset: [0, -28],
      fontWeight: 700, outlineWidth: 3, outlineColor: [15, 23, 42], fontSettings: { sdf: true },
    }),
    // Express-Linien
    ...p.express.filter((l) => l.result).flatMap((l) => {
      const isA = l.id === p.activeId
      const col = hex(l.color)
      return [
        new PathLayer({
          id: `x-${l.id}`, data: [l], getPath: (d) => d.result.route, getColor: col, widthUnits: 'pixels',
          getWidth: isA ? 6 : 4, getDashArray: [3, 1.5], extensions: [DASH], capRounded: true, jointRounded: true, pickable: true,
        }),
        new ScatterplotLayer({
          id: `xs-${l.id}`, data: l.result.stops, getPosition: (d) => [d.lon, d.lat], getRadius: (d) => (d.name === 'Start' ? 8 : 5),
          radiusUnits: 'pixels', getFillColor: (d) => (d.name === 'Start' ? [248, 250, 252] : hex(C.bg)), stroked: true,
          getLineColor: col, lineWidthUnits: 'pixels', getLineWidth: 2.5, pickable: true,
        }),
        new ScatterplotLayer({
          id: `xh-${l.id}`, data: [l.result.hub], getPosition: (d) => [d.lon, d.lat], getRadius: 13, radiusUnits: 'pixels',
          filled: false, stroked: true, getLineColor: col, lineWidthUnits: 'pixels', getLineWidth: 3,
        }),
        new TextLayer({ fontFamily: FONT,
          id: `xt-${l.id}`, data: [{ pos: l.start, name: l.name }, { pos: [l.result.hub.lon, l.result.hub.lat], name: l.result.hub.name.replace('Nürnberg ', '') }],
          getPosition: (d) => d.pos, getText: (d) => d.name, getSize: 12, getColor: col, getPixelOffset: [0, -20], fontWeight: 700,
          outlineWidth: 3, outlineColor: [15, 23, 42], fontSettings: { sdf: true },
        }),
      ]
    }),
    active && active.hubs && new ScatterplotLayer({
      id: 'hub-cands', data: active.hubs.filter((h) => h.id !== active.hubId), getPosition: (d) => [d.lon, d.lat],
      getRadius: 10, radiusUnits: 'pixels', filled: false, stroked: true, getLineColor: [245, 158, 11, 140],
      lineWidthUnits: 'pixels', getLineWidth: 1.5, getDashArray: [2, 2],
    }),
  ].filter(Boolean)

  // Eigener Klick-Handler (robuster als Deck-onClick zusammen mit dem MapLibre-Kind): Drag ≠ Klick
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
      if (!d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 5 || e.target.closest('.maplibregl-ctrl')) return
      const deck = deckRef.current?.deck
      if (!deck) return
      const r = el.getBoundingClientRect()
      const x = e.clientX - r.left, y = e.clientY - r.top
      const picked = deck.pickObject({ x, y, radius: 4, layerIds: ['hotspots', 'events'] })
      const coordinate = deck.getViewports()[0]?.unproject([x, y])
      clickRef.current?.({ layer: picked?.layer, object: picked?.object, coordinate })
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp) }
  }, [])

  const onClick = (info) => {
    if (info.layer?.id === 'hotspots' && p.mode !== 'waypoint') return p.onHotspotClick(info.object)
    if (info.layer?.id === 'events' && p.mode === 'idle') return p.onEventClick(info.object)
    if (p.mode !== 'idle' && info.coordinate) p.onMapClick(info.coordinate[0], info.coordinate[1])
  }
  clickRef.current = onClick

  return (
    <div ref={box} className={`map ${p.mode !== 'idle' ? 'picking' : ''}`}>
      <DeckGL ref={deckRef} viewState={viewState} onViewStateChange={(e) => setViewState(e.viewState)} controller layers={layers} onHover={(i) => setHover(i.object ? i : null)}
        getCursor={({ isHovering }) => (p.mode !== 'idle' ? 'crosshair' : isHovering ? 'pointer' : 'grab')}>
        <Map mapStyle={MAP_STYLE} attributionControl={{ compact: true }} />
      </DeckGL>
      {hover && <Tooltip info={hover} gemeinden={p.grid.gemeinden} />}
      {p.mode !== 'idle' && <div className="map-banner">{p.mode === 'start' ? 'Startpunkt der Express-Linie anklicken' : 'Zwischenhalt anklicken'}</div>}
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
      <div>Zeit bis Schiene heute: ~{fmt(o[5], 1)} min</div>
      <div className={o[6] > 0.4 ? 'bad' : ''}>Unterversorgung: {o[6] > 0.6 ? 'hoch' : o[6] > 0.25 ? 'mittel' : o[6] > 0 ? 'gering' : 'keine'}</div>
    </>)
  } else if (id === 'rail-st') {
    body = (<><b>{o.name}</b><div>{o.rail_deps_h} Abfahrten/h Schiene · Knoten-Score {fmt(o.hub_score * 100)}</div><div className="muted">{o.lines.slice(0, 12).join(', ')}</div></>)
  } else if (id === 'rail' || id === 'bus' || id === 'bus-thin') {
    body = <b>{id === 'rail' ? '' : 'Bus '}{o.name}{id === 'bus-thin' ? ' · ausgedünnt' : ''}</b>
  } else if (id === 'bau' || id === 'bau-pt') {
    const b = o.props
    body = (<><b>Baustelle {b.strasse}</b><div>{b.art} · {b.wirkung === 'sperrung' ? 'Vollsperrung' : `${b.wirkung} (+${b.verzoegerung_pct} %)`}</div><div>{b.von} – {b.bis}</div><div className="muted">fiktiv</div></>)
  } else if (id === 'events') {
    body = (<><b>{o.name}</b><div>{o.venue} · {o.datum} {o.beginn}–{o.ende}</div><div>~{fmt(o.besucher)} Besucher (Annahme)</div><div className="muted">Klick → Event-Express planen</div></>)
  } else if (id === 'hotspots') {
    body = (<><b>Hotspot</b><div>{fmt(o.einwohner_weit_von_schiene)} Einw. &gt; 800 m von der Schiene</div><div>Zeit bis Schiene ~{fmt(o.zeit_bis_schiene_min, 1)} min</div><div className="muted">Klick → Express von hier</div></>)
  } else if (id.startsWith('xs-')) {
    body = (<><b>{o.name}{o.auto ? ' (automatisch)' : ''}</b><div>{fmt(o.fahrzeit_bis_knoten_min, 1)} min bis zum Knoten</div></>)
  } else if (id.startsWith('x-')) {
    body = (<><b>Express {o.name}</b><div>{o.result.fahrzeit_min} min · {o.result.laenge_km} km → {o.result.hub.name}</div></>)
  } else if (id === 'ev-routes') {
    body = (<><b>Event-Shuttle ab {o.von}</b><div>{o.busse} Busse · {o.fahrzeit_min} min Fahrt</div></>)
  }
  if (!body) return null
  return <div className="tooltip" style={{ left: x + 14, top: y + 14 }}>{body}</div>
}
