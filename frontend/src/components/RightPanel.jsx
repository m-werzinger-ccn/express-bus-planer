import { fmt } from '../theme.js'

export default function RightPanel(p) {
  return (
    <aside className="right panel">
      <div className="scroll">
        {p.eventPlan && <EventCard {...p} />}
        <ExpressSection {...p} />
        <Suggestions {...p} />
        {p.acceptedActions.length > 0 && <Accepted {...p} />}
      </div>
      <Bilanz bilanz={p.bilanz} />
    </aside>
  )
}

function ExpressSection(p) {
  if (!p.express.length) {
    return (
      <section>
        <h4>Express-Linien</h4>
        <div className="empty">Noch keine Express-Linie. Links „Start auf Karte wählen“ oder einen Hotspot anklicken.</div>
      </section>
    )
  }
  return (
    <section>
      <h4>Express-Linien</h4>
      <div className="tabs">
        {p.express.map((l) => (
          <button key={l.id} className={l.id === p.activeId ? 'on' : ''} style={{ '--c': l.color }} onClick={() => p.setActiveId(l.id)}>{l.name}</button>
        ))}
      </div>
      {p.express.filter((l) => l.id === p.activeId).map((l) => <ExpressCard key={l.id} l={l} {...p} />)}
    </section>
  )
}

function ExpressCard({ l, updateLine, removeLine, setMode, mode, baustellen }) {
  const r = l.result
  if (!r) return <div className="card">berechne …</div>
  const w = r.wirkung
  const bauNamen = r.baustellen_nahe.map((id) => baustellen.find((b) => b.properties.id === id)?.properties.strasse).filter(Boolean)
  return (
    <div className="card express" style={{ '--c': l.color }}>
      <div className="row">
        <span className="muted">Ziel-Knoten</span>
        <select value={l.hubId} onChange={(e) => updateLine(l.id, { hubId: e.target.value })}>
          {l.hubs.map((h) => <option key={h.id} value={h.id}>{h.name.replace('Nürnberg ', '')} · {h.modes.replace(/[BT]/g, '')}</option>)}
        </select>
      </div>
      <div className="row three">
        <label>Takt
          <select value={l.takt} onChange={(e) => updateLine(l.id, { takt: Number(e.target.value) })}>
            {[10, 15, 20, 30].map((t) => <option key={t} value={t}>{t} min</option>)}
          </select>
        </label>
        <label>Betrieb
          <select value={l.betriebszeit} onChange={(e) => updateLine(l.id, { betriebszeit: e.target.value })}>
            <option value="HVZ">HVZ (6 h)</option><option value="Tag">6–20 Uhr</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={l.autoStops} onChange={() => updateLine(l.id, { autoStops: !l.autoStops })} />Auto-Halte</label>
      </div>

      <div className="kv"><span>Fahrzeit bis {r.hub.name.replace('Nürnberg ', '')}</span><b>{fmt(r.fahrzeit_min, 1)} min · {fmt(r.laenge_km, 1)} km</b></div>
      <div className="kv"><span>Ab Start heute → Express</span><b>{fmt(w.start_heute_min, 0)} → {fmt(w.start_express_min, 0)} min <em className={w.start_express_min < w.start_heute_min ? 'good' : 'bad'}>{fmt(w.start_express_min - w.start_heute_min, 0)}</em></b></div>
      <div className="kv"><span>Einwohner profitieren</span><b>{fmt(w.einwohner_profitieren)} <small>Ø −{fmt(w.zeitgewinn_mittel_min, 1)} min</small></b></div>
      <div className="kv"><span>Einzugsbereich (500 m)</span><b>{fmt(w.einwohner_einzug)} <small>davon {fmt(w.einwohner_weit_von_schiene)} weit weg</small></b></div>
      <div className="kv"><span>Halte</span><b>{r.stops.length} <small>({r.stops.filter((s) => s.auto).length} automatisch)</small></b></div>
      <div className="kv need"><span>Bedarf</span><b>{r.bedarf.busse} Busse · {fmt(r.bedarf.fahrer, 1)} Fahrerschichten</b></div>

      {r.umgeplant && <div className="warn">⚠ Wegen Baustelle {bauNamen.join(', ')} umgeplant: +{fmt(r.umgeplant.zusatz_min, 1)} min, {r.umgeplant.zusatz_m >= 0 ? '+' : ''}{fmt(r.umgeplant.zusatz_m)} m</div>}
      {!r.umgeplant && bauNamen.length > 0 && <div className="warn soft">Baustelle in der Nähe: {bauNamen.join(', ')}</div>}

      <div className="row buttons">
        <button className={`mini ${mode === 'waypoint' ? 'active' : ''}`} onClick={() => setMode(mode === 'waypoint' ? 'idle' : 'waypoint')}>＋ Zwischenhalt</button>
        {l.waypoints.length > 0 && <button className="mini" onClick={() => updateLine(l.id, { waypoints: l.waypoints.slice(0, -1) })}>↶ Halt</button>}
        <button className="mini danger" onClick={() => removeLine(l.id)}>Löschen</button>
      </div>
    </div>
  )
}

function Suggestions({ suggestions, optInfo, accept, reject, acceptAll, setHighlightLine }) {
  if (suggestions == null) {
    return (
      <section>
        <h4>KI-Vorschläge (umschichten)</h4>
        <div className="empty">„KI-Vorschlag berechnen“ sucht Fahrten, die sich ausdünnen lassen, ohne den Mindesttakt zu verletzen.</div>
      </section>
    )
  }
  return (
    <section>
      <h4>KI-Vorschläge <span className="tag">{optInfo?.methode?.toUpperCase()}</span></h4>
      {optInfo && (
        <div className="opt-sum">
          Bedarf: <b>{fmt(optInfo.bedarf.fahrer, 1)}</b> Fahrerschichten, <b>{fmt(optInfo.bedarf.busse)}</b> Busse
          {optInfo.bedarf.fahrer === 0 && optInfo.bedarf.busse === 0 && <div className="good">Bilanz ist ausgeglichen – nichts umzuschichten.</div>}
          {optInfo.nachher.fahrer.saldo < 0 && <div className="bad">Nicht vollständig deckbar – es fehlen noch {fmt(-optInfo.nachher.fahrer.saldo, 1)} Schichten.</div>}
        </div>
      )}
      {suggestions.length > 1 && <button className="mini wide" onClick={acceptAll}>✓ Alle {suggestions.length} annehmen</button>}
      {suggestions.map((s) => (
        <div key={s.id} className="card sug" onMouseEnter={() => setHighlightLine(s.linie)} onMouseLeave={() => setHighlightLine(null)}>
          <div className="sug-head">
            <b>{s.titel}</b>
            <div className="sug-btns">
              <button className="ok" title="annehmen" onClick={() => accept(s)}>✓</button>
              <button className="no" title="ablehnen" onClick={() => reject(s)}>✕</button>
            </div>
          </div>
          <div className="muted small">{s.warum[0]} · {s.warum[1]}</div>
          <div className="good small">+{fmt(s.fahrer_frei, 2)} Fahrerschichten{s.busse_frei ? ` · +${s.busse_frei} Busse (Spitze)` : ''}</div>
          <details>
            <summary>Warum?</summary>
            <ul>{s.warum.map((w) => <li key={w}>{w}</li>)}<li>Mehrwartezeit ca. {fmt(s.mehrwartezeit_h, 1)} Fahrgast-Stunden/Tag ({fmt(s.fahrgaeste_betroffen)} Fahrgäste im Zeitfenster)</li></ul>
          </details>
        </div>
      ))}
    </section>
  )
}

function Accepted({ acceptedActions, undoAccept, resetPlan, setHighlightLine }) {
  return (
    <section>
      <h4>Angenommen ({acceptedActions.length}) <button className="link" onClick={resetPlan}>zurücksetzen</button></h4>
      {acceptedActions.map((a) => (
        <div key={a.id} className="acc" onMouseEnter={() => setHighlightLine(a.linie)} onMouseLeave={() => setHighlightLine(null)}>
          <span>{a.titel}</span><span className="good">+{fmt(a.fahrer_frei, 1)}</span>
          <button className="link" onClick={() => undoAccept(a.id)}>↶</button>
        </div>
      ))}
    </section>
  )
}

function EventCard({ eventPlan: ep, eventsAus, toggleEventAus, closeEvent }) {
  const e = ep.event
  const aus = eventsAus.includes(e.id)
  return (
    <section className="event-card">
      <div className="row"><h4>★ Event-Express</h4><button className="link" onClick={closeEvent}>✕</button></div>
      <b>{e.name}</b>
      <div className="muted small">{e.venue} · {e.datum} · {e.beginn}–{e.ende} · ~{fmt(e.besucher)} Besucher</div>
      <div className="kv"><span>Shuttle-Fahrgäste (Annahme)</span><b>{fmt(ep.besucher_shuttle)}</b></div>
      <div className="kv"><span>Shuttle-Busse / Fahrer</span><b>{ep.busse} / {ep.fahrer}</b></div>
      <div className="kv"><span>Anreise · Abreise</span><b>{ep.anreise} · {ep.abreise}</b></div>
      {ep.routen.map((r) => <div key={r.von_id} className="muted small">↳ ab {r.von}: {r.busse} Busse, {fmt(r.fahrzeit_min, 1)} min Fahrt{r.umgeplant ? ' · Baustelle umfahren' : ''}</div>)}
      <label className="check"><input type="checkbox" checked={!aus} onChange={() => toggleEventAus(e.id)} />in Fahrer-Bilanz einplanen</label>
      <div className="hint">ÖV-Anteil {Math.round(ep.annahmen.oev_anteil * 100)} %, davon {Math.round(ep.annahmen.shuttle_anteil * 100)} % per Shuttle, {ep.annahmen.plaetze_bus} Plätze/Bus</div>
    </section>
  )
}

function Bilanz({ bilanz: b }) {
  if (!b) return <div className="bilanz" />
  const f = b.fahrer
  const ok = f.saldo >= -0.05
  const bok = b.busse.saldo >= -0.05
  const total = Math.max(f.frei + Math.max(f.verfuegbar - f.basis, 0), f.express + f.event, 1)
  const pct = (x) => `${Math.min(100, (100 * x) / total)}%`
  return (
    <div className="bilanz">
      <h4>Fahrer-Bilanz <span className="tag">{b.wochentag}</span></h4>
      <div className="bars">
        <div className="bar-row"><span>Angebot</span><div className="track">
          <div className="seg-a" style={{ width: pct(Math.max(f.verfuegbar - f.basis, 0)) }} title="Reserve" />
          <div className="seg-b" style={{ width: pct(f.frei) }} title="frei gespielt" />
        </div></div>
        <div className="bar-row"><span>Bedarf</span><div className="track">
          <div className="seg-c" style={{ width: pct(f.express) }} title="Express" />
          <div className="seg-d" style={{ width: pct(f.event) }} title="Event" />
        </div></div>
      </div>
      <div className="bil-legend">
        <span><i className="seg-a" />Reserve {fmt(f.verfuegbar - f.basis, 1)}</span>
        <span><i className="seg-b" />frei {fmt(f.frei, 1)}</span>
        <span><i className="seg-c" />Express {fmt(f.express, 1)}</span>
        <span><i className="seg-d" />Event {fmt(f.event, 1)}</span>
      </div>
      <div className={`saldo ${ok ? 'ok' : 'nok'}`}>
        <div className="big">{ok ? (f.saldo < 0.5 ? '± 0' : `+${fmt(f.saldo, 1)}`) : fmt(f.saldo, 1)} Fahrer</div>
        <div className="small">{ok ? 'zusätzlich benötigt: keine' : 'fehlen → KI-Vorschlag berechnen'}</div>
      </div>
      <div className={`bus-saldo ${bok ? 'good' : 'bad'}`}>Busse in der Spitze: {bok ? '+' : ''}{fmt(b.busse.saldo, 0)} <small>(verfügbar {fmt(b.busse.verfuegbar)}, Basis {fmt(b.busse.basis)}, Express {fmt(b.busse.express)}, Event {fmt(b.busse.event)}, frei {fmt(b.busse.frei)})</small></div>
    </div>
  )
}
