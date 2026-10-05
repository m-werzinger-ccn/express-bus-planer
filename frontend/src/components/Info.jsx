import { useRef, useState } from 'react'
import Icon from './Icons.jsx'

// Info-Button: Erklärtext erscheint erst bei Hover/Fokus/Klick (fixed positioniert, wird nicht abgeschnitten)
export default function Info({ children, side = 'right' }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  const show = () => {
    const r = ref.current.getBoundingClientRect()
    const w = 260
    let left = side === 'left' ? r.left - w - 8 : r.right + 8
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    setPos({ left, top: Math.min(r.top - 6, window.innerHeight - 160) })
  }
  return (
    <span className="info" ref={ref} tabIndex={0} role="button" aria-label="Info"
      onMouseEnter={show} onMouseLeave={() => setPos(null)} onFocus={show} onBlur={() => setPos(null)}
      onClick={(e) => { e.stopPropagation(); pos ? setPos(null) : show() }}>
      <Icon name="info" size={14} />
      {pos && <span className="info-pop-fixed" style={{ left: pos.left, top: pos.top }}>{children}</span>}
    </span>
  )
}
