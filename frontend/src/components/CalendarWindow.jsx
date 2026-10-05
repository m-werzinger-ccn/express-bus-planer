import { useState } from 'react'
import { MONATE, toIso } from '../theme.js'
import Icon from './Icons.jsx'

const WT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

// Monatskalender als Fenster: Datum wählen, Events öffnen
export default function CalendarWindow({ datum, setDatum, events, eventsAus, onEventClick, onClose }) {
  const sel = new Date(datum + 'T12:00:00')
  const [ym, setYm] = useState([sel.getFullYear(), sel.getMonth()])
  const [y, m] = ym
  const first = new Date(y, m, 1, 12)
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, i) => {
    const d = i - offset + 1
    return d >= 1 && d <= daysInMonth ? toIso(new Date(y, m, d, 12)) : null
  })
  const shift = (n) => setYm(([yy, mm]) => { const d = new Date(yy, mm + n, 1); return [d.getFullYear(), d.getMonth()] })
  const monthEvents = events.filter((e) => e.datum.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)).sort((a, b) => a.datum.localeCompare(b.datum))

  return (
    <div className="cal-window" onPointerUp={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="cal-head">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Vorheriger Monat"><Icon name="left" /></button>
        <b>{MONATE[m]} {y}</b>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Nächster Monat"><Icon name="right" /></button>
        <button className="icon-btn close" onClick={onClose} aria-label="Schließen"><Icon name="x" /></button>
      </div>
      <div className="cal-grid">
        {WT.map((w) => <div key={w} className="wt">{w}</div>)}
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} />
          const evs = events.filter((e) => e.datum === iso)
          const cls = ['cd', iso === datum ? 'sel' : '', evs.length ? 'has' : '', i % 7 >= 5 ? 'we' : ''].join(' ')
          return (
            <button key={iso} className={cls} onClick={() => (evs[0] ? onEventClick(evs[0]) : setDatum(iso))}
              title={evs.map((e) => e.name).join(', ')}>
              {Number(iso.slice(8))}
              {evs.length > 0 && <span className={`dot ${evs.every((e) => eventsAus.includes(e.id)) ? 'off' : ''}`} />}
            </button>
          )
        })}
      </div>
      <div className="cal-events">
        {monthEvents.length === 0 && <div className="muted small">Keine Events in diesem Monat</div>}
        {monthEvents.map((e) => (
          <button key={e.id} className={`cal-ev ${e.datum === datum ? 'sel' : ''}`} onClick={() => onEventClick(e)}>
            <span className="d">{e.datum.slice(8)}.{e.datum.slice(5, 7)}.</span>
            <span className="n">{e.name}</span>
            <span className="v">{e.venue} · {e.beginn}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
