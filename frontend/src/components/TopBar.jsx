import { useState } from 'react'
import Icon from './Icons.jsx'
import Info from './Info.jsx'

export default function TopBar({ applyPreset, saveScenario, loadScenario, listScenarios, meta }) {
  const [scs, setScs] = useState(null)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    const name = `Szenario ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
    await saveScenario(name)
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="mark">E</span>
        <span className="name">ExpressNetz</span>
        <span className="sub">Nürnberg · Planungsdemo</span>
      </div>
      <div className="actions">
        <select className="btn-ghost" defaultValue="" onChange={(e) => { applyPreset(e.target.value); e.target.value = '' }}>
          <option value="" disabled>Szenario-Vorlage</option>
          <option value="normal">Normaltag (Di)</option>
          <option value="krank">Krankheitswelle −15 % Fahrer:innen</option>
          <option value="messe">Messe-Mittwoch</option>
          <option value="samstag">Heimspiel-Samstag</option>
        </select>
        <button className="btn-ghost" onClick={save}><Icon name={saved ? 'check' : 'save'} />{saved ? 'Gespeichert' : 'Speichern'}</button>
        <div className="dropdown">
          <button className="btn-ghost" onClick={async () => setScs(scs ? null : await listScenarios())}><Icon name="folder" />Laden</button>
          {scs && (
            <div className="menu">
              {scs.length === 0 && <div className="menu-empty">Noch keine Szenarien gespeichert</div>}
              {scs.map((s) => <button key={s.name} onClick={() => { loadScenario(s); setScs(null) }}>{s.name}</button>)}
            </div>
          )}
        </div>
        <span className="data-info">
          <Icon name="database" />Daten
          <Info side="left">
            <b>Datenquellen</b><br />
            {meta.quellen.map((q) => <span key={q.name}>{q.name} · {q.lizenz}<br /></span>)}
            <br />Fahrplan-Stichtag {meta.regeln.stichtag.replace(/(\d{4})(\d{2})(\d{2})/, '$3.$2.$1')} (Werktag). Fußwege = Luftlinie × 1,3, Reisezeiten sind Schätzungen.
            Fahrer:innen, Busse, Auslastung, Events und Baustellen sind fiktiv.
          </Info>
        </span>
      </div>
    </header>
  )
}
