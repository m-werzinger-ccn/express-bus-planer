// Farbsystem aus docs/moodboard.svg
export const C = {
  bg: '#0F172A', panel: '#131D30', card: '#1E293B', line: '#334155',
  text: '#E2E8F0', muted: '#94A3B8', dim: '#64748B',
  amber: '#F59E0B', rail: '#3B82F6', sbahn: '#22C55E', tram: '#F87171', regio: '#94A3B8',
  bau: '#FB923C', event: '#A855F7', good: '#4ADE80', bad: '#F87171',
}

export const hex = (h, a = 255) => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]
}

// Farbrampen für die Heatmap
const RAMP_HEAT = ['#1E293B', '#7F1D1D', '#DC2626', '#F97316', '#FDE047'].map((h) => hex(h))
const RAMP_POP = ['#0B3B5C', '#0E7490', '#14B8A6', '#A3E635', '#FDE047'].map((h) => hex(h))

function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t))
  const x = t * (stops.length - 1)
  const i = Math.min(Math.floor(x), stops.length - 2)
  const f = x - i
  return stops[i].slice(0, 3).map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f))
}

export const heatColor = (t, a) => [...ramp(RAMP_HEAT, t), a]
export const popColor = (t, a) => [...ramp(RAMP_POP, t), a]
export const RAMPS = {
  heat: 'linear-gradient(90deg,#1E293B,#7F1D1D,#DC2626,#F97316,#FDE047)',
  pop: 'linear-gradient(90deg,#0B3B5C,#0E7490,#14B8A6,#A3E635,#FDE047)',
}

export const EXPRESS_COLORS = ['#F59E0B', '#38BDF8', '#F472B6', '#A3E635', '#FB7185', '#C084FC']

export const fmt = (n, d = 0) =>
  n == null ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

export const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
export const datumLabel = (iso) => {
  const d = new Date(iso + 'T12:00:00')
  return `${WOCHENTAG[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`
}
export const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
