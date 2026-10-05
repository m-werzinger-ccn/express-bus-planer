import { RAMP_CSS } from '../theme.js'
import Icon from './Icons.jsx'
import Info from './Info.jsx'

const LAYERS = [
  ['heat', 'Heatmap', '#14B8A6'],
  ['rail', 'Schienennetz U / S / Tram', '#1D6FB8'],
  ['bus', 'Busnetz und Haltestellen', '#3A3A3A'],
  ['plan', 'KI-Plan im Netz', '#E64980'],
  ['hotspots', 'Unterversorgte Gebiete', '#0B7285'],
  ['baustellen', 'Baustellen', '#F59F00'],
  ['events', 'Events', '#9C36B5'],
]

const MODES = [
  ['einwohner', 'Einwohner', 'Einwohner je 100-m-Zelle (Zensus 2022).', 'wenig', 'viele'],
  ['distanz', 'Distanz', 'Fußweg zur nächsten U-/S-Bahn-Station. Je heller, desto weiter.', 'nah', 'über 2 km'],
  ['score', 'Score', 'Unterversorgung: Einwohner × weiter Weg zur Schiene × lange Reisezeit.', 'gut angebunden', 'unterversorgt'],
]

export default function LeftPanel(p) {
  const b = p.meta.baseline
  const m = MODES.find((x) => x[0] === p.heatMode)
  const depot = (p.busse ?? 0) - (p.fahrer ?? 0)
  return (
    <aside className="left panel">
      <section>
        <h4>Ressourcen <Info>Synthetischer Datensatz (Seed {b.seed}), abgeleitet aus dem echten VGN-Fahrplan. Beide Werte zählen zur Spitzenstunde: 1 Fahrer:in je Bus im Einsatz.</Info></h4>
        <Slider label="Busse einsatzbereit" value={p.busse} min={Math.round(b.busse_bestand * 0.8)} max={b.busse_bestand + 10} onChange={p.setBusse}
          info={<>Bedarf zur Spitze: {b.busse_spitze} Busse<br />Fuhrpark-Bestand: {b.busse_bestand} Busse</>} />
        <Slider label="Fahrer:innen im Dienst (Spitze)" value={p.fahrer} min={Math.round(b.fahrer_spitze_bestand * 0.75)} max={b.fahrer_spitze_bestand + 10} onChange={p.setFahrer}
          info={<>Bedarf zur Spitze: {b.fahrer_spitze_bedarf}<br />Entspricht ca. {Math.round((p.fahrer ?? 0) * b.personal_je_spitzenbus)} Personen Personal pro Tag ({b.personal_je_spitzenbus} je Spitzenbus, Früh- und Spätschicht).</>} />
        {depot > 0 && <div className="badge-warn"><Icon name="bus" size={14} />{depot} Busse ohne Fahrer:in im Depot</div>}
      </section>

      <section>
        <h4>Express-Linie <Info>Startpunkt in die Karte klicken. Das System schlägt den besten Schienenknoten vor, berechnet die Route auf dem Straßennetz und setzt Zwischenhalte in unterversorgten Gebieten.</Info></h4>
        <button className={`btn-primary ${p.mode === 'start' ? 'active' : ''}`} onClick={() => p.setMode(p.mode === 'start' ? 'idle' : 'start')}>
          <Icon name={p.mode === 'start' ? 'x' : 'plus'} />{p.mode === 'start' ? 'Abbrechen' : 'Start auf Karte wählen'}
        </button>
      </section>

      <section>
        <h4>Ebenen</h4>
        {LAYERS.map(([k, label, color]) => (
          <label key={k} className="toggle">
            <input type="checkbox" checked={p.layers[k]} onChange={() => p.setLayers({ ...p.layers, [k]: !p.layers[k] })} />
            <span className="sw" style={{ '--c': color }} />{label}
          </label>
        ))}
      </section>

      <section>
        <h4>Heatmap <Info>{m[2]}</Info></h4>
        <div className="seg">
          {MODES.map(([k, l]) => <button key={k} className={p.heatMode === k ? 'on' : ''} onClick={() => p.setHeatMode(k)}>{l}</button>)}
        </div>
        <div className="legend">
          <div className="bar" style={{ background: RAMP_CSS }} />
          <div className="legend-labels"><span>{m[3]}</span><span>{m[4]}</span></div>
        </div>
      </section>
    </aside>
  )
}

function Slider({ label, value, min, max, onChange, info }) {
  return (
    <div className="slider">
      <div className="row"><span>{label} <Info>{info}</Info></span><b>{value}</b></div>
      <input type="range" min={min} max={max} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}
