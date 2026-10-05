// Schlanke Strich-Icons (24×24, currentColor) – keine Emojis
const P = {
  calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  save: 'M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4zM8 4v5h7V4M8 20v-6h8v6',
  folder: 'M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z',
  info: 'M12 11v6M12 7.5v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  plus: 'M12 5v14M5 12h14',
  alert: 'M12 4l9 16H3L12 4zM12 10v4M12 17v.01',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  pin: 'M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7',
  database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  bus: 'M6 17V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v11M6 13h12M6 17h12v2H6zM8.5 17v2M15.5 17v2',
}

export default function Icon({ name, size = 16, stroke = 2, className = '', title }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={P[name]} />
    </svg>
  )
}
