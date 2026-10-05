// Farbsystem angelehnt an das moderne Corporate Design der VAG Nürnberg (Rot #B80012, Grautöne, Arial)
export const C = {
  red: '#B80012', redDark: '#8F000E', text: '#1F1F1F', muted: '#6B6B6B', line: '#E3E3E3',
  rail: '#1D6FB8', sbahn: '#2E9D46', tram: '#E8737A', regio: '#9A9A9A',
  bus: '#3A3A3A', bau: '#F59F00', event: '#9C36B5', plan: '#E64980', good: '#2B8A3E', bad: '#B80012',
}

export const hex = (h, a = 255) => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]
}

// Eine Farbrampe für alle Heatmap-Modi (dunkelblau → türkis → grün → gelb)
const RAMP = ['#0B3B5C', '#0E7490', '#14B8A6', '#A3E635', '#FDE047'].map((h) => hex(h))

function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t))
  const x = t * (stops.length - 1)
  const i = Math.min(Math.floor(x), stops.length - 2)
  const f = x - i
  return stops[i].slice(0, 3).map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f))
}

export const heatColor = (t, a) => [...ramp(RAMP, t), a]
export const RAMP_CSS = 'linear-gradient(90deg,#0B3B5C,#0E7490,#14B8A6,#A3E635,#FDE047)'

// Express-Linien: kräftig, unterscheidbar von U-Bahn-, Bus- und Plan-Farben
export const EXPRESS_COLORS = ['#D9480F', '#0B7285', '#5F3DC4', '#2B8A3E', '#C2255C', '#1971C2']

export const fmt = (n, d = 0) =>
  n == null ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

export const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
export const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
export const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

const d12 = (iso) => new Date(iso + 'T12:00:00')
export const datumLabel = (iso) => {
  const d = d12(iso)
  return `${WOCHENTAG[d.getDay()]}, ${d.getDate()}. ${MONATE_KURZ[d.getMonth()]} ${d.getFullYear()}`
}
export const addDays = (iso, n) => {
  const d = d12(iso)
  d.setDate(d.getDate() + n)
  return toIso(d)
}
export const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
