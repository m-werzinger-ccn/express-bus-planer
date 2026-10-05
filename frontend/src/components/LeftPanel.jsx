import { RAMPS, fmt } from '../theme.js'

const LAYERS = [
  ['heat', 'Heatmap Einwohner', '#F97316'],
  ['rail', 'Schienennetz U/S/Tram', '#3B82F6'],
  ['bus', 'Busnetz heute (VAG)', '#94A3B8'],
  ['hotspots', 'Hotspots (unterversorgt)', '#FDE047'],
  ['baustellen', 'Baustellen', '#FB923C'],
  ['events', 'Events', '#A855F7'],
]

const MODES = [
  ['einwohner', 'Einw.', 'Einwohner je 100-m-Zelle', RAMPS.pop, 'wenig', 'viele'],
  ['distanz', 'Distanz', 'Fußweg zur nächsten U-/S-Bahn', RAMPS.heat, 'nah', '≥ 2 km'],
  ['score', 'Score', 'Einwohner × weit weg von der Schiene', RAMPS.heat, 'gut angebunden', 'unterversorgt'],
]

export default function LeftPanel(p) {
  const b = p.meta.baseline
  const m = MODES.find((x) => x[0] === p.heatMode)
  return (
    <aside className="left panel">
      <section>
        <h4>Ressourcen <span className="tag">synthetisch · seed {b.seed}</span></h4>
        <Slider label="Fahrer:innen verfügbar" value={p.fahrer} min={Math.round(b.fahrer_bestand * 0.75)} max={b.fahrer_bestand + 15}
          onChange={p.setFahrer} hint={`Bedarf Werktag ${b.fahrer_bedarf} · Bestand ${b.fahrer_bestand}`} />
        <Slider label="Busse verfügbar" value={p.busse} min={Math.round(b.busse_bestand * 0.8)} max={b.busse_bestand + 10}
          onChange={p.setBusse} hint={`Spitzenbedarf ${b.busse_spitze} · Bestand ${b.busse_bestand}`} />
      </section>

      <section>
        <h4>Express-Linie</h4>
        <button className={`btn ${p.mode === 'start' ? 'active' : ''}`} onClick={() => p.setMode(p.mode === 'start' ? 'idle' : 'start')}>
          {p.mode === 'start' ? '✕ Abbrechen' : '＋ Start auf Karte wählen'}
        </button>
        {p.mode === 'start' && <div className="hint pulse">Klicke in die Karte (oder auf einen Hotspot)</div>}
        <div className="hotspot-list">
          {p.hotspots.slice(0, 4).map((h, i) => (
            <button key={i} className="mini" onClick={() => p.addExpressAt(h.lon, h.lat)} title="Express von hier planen">
              <span className="dot" />Hotspot {i + 1} · {fmt(h.einwohner_weit_von_schiene)} Einw. · {fmt(h.zeit_bis_schiene_min)} min
            </button>
          ))}
        </div>
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
        <h4>Heatmap-Modus</h4>
        <div className="seg">
          {MODES.map(([k, l]) => <button key={k} className={p.heatMode === k ? 'on' : ''} onClick={() => p.setHeatMode(k)}>{l}</button>)}
        </div>
        <div className="legend">
          <div className="bar" style={{ background: m[3] }} />
          <div className="legend-labels"><span>{m[4]}</span><span>{m[5]}</span></div>
          <div className="hint">{m[2]}</div>
        </div>
      </section>

      <section className="grow" />
      <section>
        <div className="seg small">
          <button className={p.method === 'milp' ? 'on' : ''} onClick={() => p.setMethod('milp')}>MILP</button>
          <button className={p.method === 'greedy' ? 'on' : ''} onClick={() => p.setMethod('greedy')}>Greedy</button>
        </div>
        <button className="btn primary" disabled={p.busy} onClick={p.runOptimizer}>{p.busy ? '… rechnet' : '✦ KI-Vorschlag berechnen'}</button>
        <div className="hint center">Mindesttakt NVP · Lenkzeiten · Busse</div>
      </section>
    </aside>
  )
}

function Slider({ label, value, min, max, onChange, hint }) {
  return (
    <div className="slider">
      <div className="row"><span>{label}</span><b>{value}</b></div>
      <input type="range" min={min} max={max} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="hint">{hint}</div>
    </div>
  )
}
