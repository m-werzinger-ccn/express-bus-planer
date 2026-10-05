import { useState } from 'react'
import { datumLabel } from '../theme.js'

export default function TopBar({ datum, setDatum, applyPreset, saveScenario, loadScenario, listScenarios, meta }) {
  const [scs, setScs] = useState(null)
  const [saved, setSaved] = useState(false)
  const [info, setInfo] = useState(false)

  const save = async () => {
    const name = `Szenario ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
    await saveScenario(name)
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  return (
    <header className="topbar">
      <div className="brand"><span className="logo">E</span>ExpressNetz <span className="sub">Nürnberg · Track 1</span></div>
      <div className="chips">
        <label className="chip">
          📅 {datumLabel(datum)}
          <input type="date" value={datum} min="2026-06-24" max="2026-12-12" onChange={(e) => e.target.value && setDatum(e.target.value)} />
        </label>
        <select className="chip" defaultValue="" onChange={(e) => { applyPreset(e.target.value); e.target.value = '' }}>
          <option value="" disabled>Szenario-Vorlage ▾</option>
          <option value="normal">Normaltag (Di)</option>
          <option value="krank">Krankheitswelle −15 % Fahrer</option>
          <option value="messe">Messe-Mittwoch</option>
          <option value="samstag">Heimspiel-Samstag</option>
        </select>
        <button className="chip" onClick={save}>{saved ? '✓ gespeichert' : '💾 Speichern'}</button>
        <div className="dropdown">
          <button className="chip" onClick={async () => setScs(scs ? null : await listScenarios())}>📂 Laden</button>
          {scs && (
            <div className="menu">
              {scs.length === 0 && <div className="menu-empty">Noch keine Szenarien</div>}
              {scs.map((s) => <button key={s.name} onClick={() => { loadScenario(s); setScs(null) }}>{s.name}</button>)}
            </div>
          )}
        </div>
        <button className="chip ghost" onClick={() => setInfo(!info)}>ⓘ Daten</button>
      </div>
      {info && (
        <div className="info-pop" onClick={() => setInfo(false)}>
          <b>Datenquellen</b>
          <ul>{meta.quellen.map((q) => <li key={q.name}>{q.name} <span>· {q.lizenz}</span></li>)}</ul>
          <p>Fahrplan-Stichtag {meta.regeln.stichtag.replace(/(\d{4})(\d{2})(\d{2})/, '$3.$2.$1')} (Werktag). Fußwege = Luftlinie × 1,3. Reisezeiten sind Schätzungen. Fahrer, Busse, Auslastung, Events und Baustellen sind <b>fiktiv</b>.</p>
        </div>
      )}
    </header>
  )
}
