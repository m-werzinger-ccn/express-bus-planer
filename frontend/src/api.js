// Dünne Hülle um das FastAPI-Backend
async function req(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

export const api = {
  meta: () => req('/meta'),
  grid: () => req('/grid'),
  network: () => req('/network'),
  hotspots: () => req('/hotspots'),
  hubs: (lon, lat) => req(`/hubs?lon=${lon}&lat=${lat}`),
  express: (body) => req('/express/route', { method: 'POST', body }),
  bilanz: (body) => req('/bilanz', { method: 'POST', body }),
  optimize: (body) => req('/optimize', { method: 'POST', body }),
  actions: () => req('/actions'),
  events: () => req('/events'),
  eventPlan: (id, datum) => req(`/events/${id}/plan${datum ? `?datum=${datum}` : ''}`, { method: 'POST' }),
  baustellen: (datum) => req(`/baustellen${datum ? `?datum=${datum}` : ''}`),
  scenarios: () => req('/scenarios'),
  saveScenario: (name, state) => req('/scenarios', { method: 'POST', body: { name, state } }),
}
