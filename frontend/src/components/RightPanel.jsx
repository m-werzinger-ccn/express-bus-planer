import { useEffect, useRef, useState } from 'react'
import { fmt } from '../theme.js'
import Icon from './Icons.jsx'
import Info from './Info.jsx'

export default function RightPanel(p) {
  return (
    <aside className="right panel">
      <div className="scroll">
        {p.eventPlan && <EventCard {...p} />}
        <ExpressSection {...p} />
        <PlanSection {...p} />
      </div>
      <Bilanz bilanz={p.bilanz} />
    </aside>
  )
}

function ExpressSection(p) {
  return (
    <section>
      <h4>Express-Linien <Info side="left">Jede Express-Linie fährt vom gewählten Start mit wenigen Halten direkt zu einem Schienenknoten. Bedarf = Busse bzw. Fahrer:innen gleichzeitig im Einsatz.</Info></h4>
      {!p.express.length && <div className="empty">Keine Express-Linie angelegt</div>}
      {p.express.length > 0 && (
        <div className="tabs">
          {p.express.map((l) => (
            <button key={l.id} className={l.id === p.activeId ? 'on' : ''} style={{ '--c': l.color }} onClick={() => p.setActiveId(l.id)}>{l.name}</button>
          ))}
        </div>
      )}
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
      <label className="field">Ziel-Knoten
        <select value={l.hubId} onChange={(e) => updateLine(l.id, { hubId: e.target.value })}>
          {l.hubs.map((h) => <option key={h.id} value={h.id}>{h.name.replace('Nürnberg ', '')} ({h.modes.replace(/[BT]/g, '')})</option>)}
        </select>
      </label>
      <div className="row three">
        <label className="field">Takt
          <select value={l.takt} onChange={(e) => updateLine(l.id, { takt: Number(e.target.value) })}>
            {[10, 15, 20, 30].map((t) => <option key={t} value={t}>{t} min</option>)}
          </select>
        </label>
        <label className="field">Betrieb
          <select value={l.betriebszeit} onChange={(e) => updateLine(l.id, { betriebszeit: e.target.value })}>
            <option value="HVZ">HVZ (6 h)</option><option value="Tag">6–20 Uhr</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={l.autoStops} onChange={() => updateLine(l.id, { autoStops: !l.autoStops })} />Auto-Halte</label>
      </div>

      <div className="kv"><span>Fahrzeit bis {r.hub.name.replace('Nürnberg ', '')}</span><b>{fmt(r.fahrzeit_min, 1)} min · {fmt(r.laenge_km, 1)} km</b></div>
      <div className="kv"><span>Ab Start: heute → Express <Info side="left">Geschätzte Reisezeit vom Startpunkt bis zum Knoten. Heute: Fußweg/Bus zur nächsten Schiene plus Bahnfahrt und Umstieg. Express: halbe Taktzeit warten plus Fahrzeit.</Info></span>
        <b>{fmt(w.start_heute_min, 0)} → {fmt(w.start_express_min, 0)} min <em className={w.start_express_min < w.start_heute_min ? 'good' : 'bad'}>{fmt(w.start_express_min - w.start_heute_min, 0)}</em></b></div>
      <div className="kv"><span>Einwohner profitieren</span><b>{fmt(w.einwohner_profitieren)} <small>Ø −{fmt(w.zeitgewinn_mittel_min, 1)} min</small></b></div>
      <div className="kv"><span>Einzugsbereich 500 m</span><b>{fmt(w.einwohner_einzug)} <small>{fmt(w.einwohner_weit_von_schiene)} weit weg</small></b></div>
      <div className="kv"><span>Halte</span><b>{r.stops.length} <small>({r.stops.filter((s) => s.auto).length} automatisch)</small></b></div>
      <div className="kv need"><span>Bedarf</span><b>{r.bedarf.busse} Busse · {r.bedarf.fahrer} Fahrer:innen</b></div>

      {r.umgeplant && <div className="warn"><Icon name="alert" size={14} />Umgeplant wegen Baustelle {bauNamen.join(', ')}: +{fmt(r.umgeplant.zusatz_min, 1)} min</div>}
      {!r.umgeplant && bauNamen.length > 0 && <div className="warn soft"><Icon name="alert" size={14} />Baustelle in der Nähe: {bauNamen.join(', ')}</div>}

      <div className="row buttons">
        <button className={`btn-small ${mode === 'waypoint' ? 'active' : ''}`} onClick={() => setMode(mode === 'waypoint' ? 'idle' : 'waypoint')}><Icon name="plus" size={14} />Zwischenhalt</button>
        {l.waypoints.length > 0 && <button className="btn-small" onClick={() => updateLine(l.id, { waypoints: l.waypoints.slice(0, -1) })}><Icon name="undo" size={14} />Halt</button>}
        <button className="btn-small danger" onClick={() => removeLine(l.id)}><Icon name="x" size={14} />Löschen</button>
      </div>
    </div>
  )
}

function PlanSection(p) {
  const refs = useRef({})
  const [mehr, setMehr] = useState(false)
  useEffect(() => { refs.current[p.selectedAction]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [p.selectedAction])
  const ohne = p.bilanzOhne?.fahrer?.saldo
  const mit = p.bilanz?.fahrer?.saldo
  const inPlan = new Set(p.plan.map((a) => a.id))
  const gruppen = new Set(p.plan.map((a) => a.gruppe))
  const weitere = p.allActions.filter((a) => !inPlan.has(a.id) && !p.excluded.includes(a.id) && !gruppen.has(a.gruppe))
    .sort((a, b) => a.kosten - b.kosten).slice(0, 12)

  return (
    <section>
      <h4>KI-Plan <span className={`status ${p.rechnet ? 'busy' : ''}`}>{p.rechnet ? 'rechnet' : 'automatisch'}</span>
        <Info side="left">Bei jeder Änderung rechnet ein Optimierungsmodell (MILP) neu: Es dünnt schwach ausgelastete, schienenparallele Fahrten in der Hauptverkehrszeit so aus, dass die Fahrer-Bilanz auf ± 0 kommt. Der Mindesttakt des Nahverkehrsplans bleibt immer eingehalten. Fixieren behält eine Maßnahme, Ausschließen verbietet sie.</Info>
      </h4>
      {ohne != null && (
        <div className="plan-sum">
          <div><span>ohne Maßnahmen</span><b className={ohne < -0.05 ? 'bad' : 'good'}>{saldoText(ohne)}</b></div>
          <Icon name="right" size={14} />
          <div><span>mit Plan</span><b className={mit < -0.05 ? 'bad' : 'good'}>{saldoText(mit)}</b></div>
        </div>
      )}
      {p.plan.length === 0 && !p.rechnet && <div className="empty">Keine Maßnahmen nötig</div>}
      {p.plan.map((a) => {
        const sel = a.id === p.selectedAction
        return (
          <div key={a.id} ref={(el) => { refs.current[a.id] = el }} className={`card sug ${sel ? 'sel' : ''}`}
            onClick={() => p.selectAction(sel ? null : a)} onMouseEnter={() => p.setHoverLine(a.linie)} onMouseLeave={() => p.setHoverLine(null)}>
            <div className="sug-head">
              <b>{a.titel}</b>
              <div className="sug-btns" onClick={(e) => e.stopPropagation()}>
                <button className={`pin ${a.fixiert ? 'on' : ''}`} title={a.fixiert ? 'Fixierung lösen' : 'Fixieren'} onClick={() => p.togglePin(a)}><Icon name="pin" size={14} /></button>
                <button className="no" title="Ausschließen" onClick={() => p.exclude(a)}><Icon name="x" size={14} /></button>
              </div>
            </div>
            <div className="sug-meta">
              <span className="good">+{a.fahrer_frei} Fahrer:in{a.fahrer_frei > 1 ? 'nen' : ''}</span>
              <span>Auslastung {a.auslastung_alt} → {a.auslastung_neu} %</span>
              {a.fixiert && <span className="tag">fixiert</span>}
            </div>
            {sel && <ul className="why">{a.warum.map((w) => <li key={w}>{w}</li>)}<li>Mehrwartezeit ca. {fmt(a.mehrwartezeit_h, 1)} Fahrgast-Stunden/Tag</li></ul>}
          </div>
        )
      })}
      <div className="plan-foot">
        <button className="link" onClick={() => setMehr(!mehr)}><Icon name={mehr ? 'x' : 'plus'} size={13} />{mehr ? 'Schließen' : 'Maßnahme selbst wählen'}</button>
        {p.excluded.length > 0 && <button className="link" onClick={p.resetExcluded}><Icon name="undo" size={13} />{p.excluded.length} ausgeschlossen zurücksetzen</button>}
      </div>
      {mehr && (
        <div className="more">
          {weitere.map((a) => (
            <div key={a.id} className="more-row" onMouseEnter={() => p.setHoverLine(a.linie)} onMouseLeave={() => p.setHoverLine(null)}>
              <span>{a.titel}</span><span className="good">+{a.fahrer_frei}</span>
              <button className="btn-small" onClick={() => p.togglePin(a)}><Icon name="pin" size={13} />Fixieren</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const saldoText = (s) => (s == null ? '–' : Math.abs(s) < 0.5 ? '± 0' : `${s > 0 ? '+' : ''}${fmt(s, 0)}`)

function EventCard({ eventPlan: ep, eventsAus, toggleEventAus, closeEvent }) {
  const e = ep.event
  const aus = eventsAus.includes(e.id)
  return (
    <section className="event-card">
      <div className="row"><h4>Event-Express <Info side="left">Annahmen: ÖV-Anteil {Math.round(ep.annahmen.oev_anteil * 100)} %, davon {Math.round(ep.annahmen.shuttle_anteil * 100)} % per Shuttle, {ep.annahmen.plaetze_bus} Plätze je Bus. Shuttles fahren von großen Schienenknoten zum Veranstaltungsort.</Info></h4>
        <button className="icon-btn" onClick={closeEvent} aria-label="Schließen"><Icon name="x" /></button></div>
      <b>{e.name}</b>
      <div className="muted small">{e.venue} · {e.datum.split('-').reverse().join('.')} · {e.beginn}–{e.ende} · ca. {fmt(e.besucher)} Besucher</div>
      <div className="kv"><span>Shuttle-Fahrgäste</span><b>{fmt(ep.besucher_shuttle)}</b></div>
      <div className="kv"><span>Shuttle-Busse / Fahrer:innen</span><b>{ep.busse} / {ep.fahrer}</b></div>
      <div className="kv"><span>Anreise · Abreise</span><b>{ep.anreise} · {ep.abreise}</b></div>
      {ep.routen.map((r) => <div key={r.von_id} className="kv"><span>ab {r.von.replace('Nürnberg ', '')}</span><b>{r.busse} Busse · {fmt(r.fahrzeit_min, 1)} min</b></div>)}
      <label className="check"><input type="checkbox" checked={!aus} onChange={() => toggleEventAus(e.id)} />in Fahrer-Bilanz einplanen</label>
    </section>
  )
}

function Bilanz({ bilanz: b }) {
  if (!b) return <div className="bilanz" />
  const f = b.fahrer
  const ok = f.saldo >= -0.05
  const bok = b.busse.saldo >= -0.05
  const total = Math.max(f.frei + Math.max(f.verfuegbar - f.basis, 0), f.express + f.event, 1)
  const pct = (x) => `${Math.min(100, (100 * Math.max(x, 0)) / total)}%`
  return (
    <div className="bilanz">
      <h4>Fahrer-Bilanz Spitze <span className="tag">{b.wochentag}</span>
        <Info side="left">Angebot = Reserve (verfügbar minus Grundbedarf) + durch den KI-Plan frei gewordene Fahrer:innen. Bedarf = Express-Linien + eingeplante Events. Busse in der Spitze: {fmt(b.busse.verfuegbar)} verfügbar, Grundbedarf {fmt(b.busse.basis)}, Express {fmt(b.busse.express)}, Event {fmt(b.busse.event)}, frei {fmt(b.busse.frei)}.</Info>
      </h4>
      <div className="bars">
        <div className="bar-row"><span>Angebot</span><div className="track">
          <div className="seg-a" style={{ width: pct(f.verfuegbar - f.basis) }} />
          <div className="seg-b" style={{ width: pct(f.frei) }} />
        </div></div>
        <div className="bar-row"><span>Bedarf</span><div className="track">
          <div className="seg-c" style={{ width: pct(f.express) }} />
          <div className="seg-d" style={{ width: pct(f.event) }} />
        </div></div>
      </div>
      <div className="bil-legend">
        <span><i className="seg-a" />Reserve {fmt(f.verfuegbar - f.basis, 0)}</span>
        <span><i className="seg-b" />frei {fmt(f.frei, 0)}</span>
        <span><i className="seg-c" />Express {fmt(f.express, 0)}</span>
        <span><i className="seg-d" />Event {fmt(f.event, 0)}</span>
      </div>
      <div className={`saldo ${ok ? 'ok' : 'nok'}`}>
        <div className="big">{saldoText(f.saldo)} Fahrer:innen</div>
        <div className="small">{ok ? 'keine zusätzlichen Fahrer:innen nötig' : 'nicht vollständig deckbar'}</div>
      </div>
      <div className={`bus-saldo ${bok ? '' : 'bad'}`}>Busse in der Spitze: {saldoText(b.busse.saldo)}</div>
    </div>
  )
}
