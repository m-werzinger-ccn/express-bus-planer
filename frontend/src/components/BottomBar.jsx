import { WOCHENTAG, addDays, fmt } from '../theme.js'

export default function BottomBar({ datum, setDatum, events, openEvent, eventsAus, kpi, meta, bilanz }) {
  const d = new Date(datum + 'T12:00:00')
  const monday = addDays(datum, -((d.getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  return (
    <footer className="bottom">
      <div className="calendar">
        <div className="cal-head">
          <button className="link" onClick={() => setDatum(addDays(datum, -7))}>‹</button>
          <b>Event-Kalender</b>
          <button className="link" onClick={() => setDatum(addDays(datum, 7))}>›</button>
        </div>
        <div className="days">
          {days.map((day) => {
            const dd = new Date(day + 'T12:00:00')
            const evs = events.filter((e) => e.datum === day)
            return (
              <div key={day} className={`day ${day === datum ? 'sel' : ''} ${evs.length ? 'has' : ''}`} onClick={() => (evs[0] ? openEvent(evs[0]) : setDatum(day))}>
                <div className="dn">{WOCHENTAG[dd.getDay()]} {dd.getDate()}.</div>
                {evs.map((e) => (
                  <div key={e.id} className={`ev ${eventsAus.includes(e.id) ? 'off' : ''}`} title={`${e.name} · ${e.beginn}`}>
                    {e.venue.split(' ')[0]} <small>{Math.round(e.besucher / 1000)}k</small>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      <div className="kpis">
        <Tile c="amber" big={fmt(kpi.profitieren)} label="Einwohner schneller am Knoten" sub={kpi.profitieren ? `Ø −${fmt(kpi.gewinn, 1)} min` : 'Express-Linie anlegen'} />
        <Tile c="red" big={fmt(meta.kpi.nbg_ueber_800m_schiene)} label="Einw. Nürnberg > 800 m zur U-/S-Bahn" sub={`${fmt(meta.kpi.nbg_ueber_15min_schiene)} brauchen > 15 min`} />
        <Tile c={kpi.fehlend > 0.05 ? 'red' : 'green'} big={kpi.fehlend == null ? '–' : kpi.fehlend > 0.05 ? `+${fmt(Math.ceil(kpi.fehlend))}` : '± 0'} label="zusätzliche Fahrer:innen nötig" sub={`${fmt(kpi.fahrtenWeniger)} Fahrten weniger · ${fmt(kpi.mehrwarte, 0)} Fgh Mehrwartezeit`} />
        <Tile c="purple" big={`${bilanz?.events?.length ?? 0}`} label="Events heute eingeplant" sub={bilanz?.events?.map((e) => `${e.busse} Busse`).join(', ') || 'keins am gewählten Tag'} />
      </div>
    </footer>
  )
}

function Tile({ c, big, label, sub }) {
  return (
    <div className={`tile ${c}`}>
      <div className="big">{big}</div>
      <div className="label">{label}</div>
      <div className="sub">{sub}</div>
    </div>
  )
}
