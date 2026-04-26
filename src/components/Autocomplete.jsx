import { useState, useEffect, useRef } from 'react'
import { T } from '../lib/theme'

export default function Autocomplete({ value, onChange, suggestions, placeholder, style }) {
  const [show, setShow] = useState(false)
  const [filtered, setFiltered] = useState([])
  const ref = useRef(null)

  useEffect(() => {
    if (!value.trim()) { setFiltered([]); return }
    const q = value.toLowerCase().trim()
    const seen = new Set()
    const matches = suggestions.filter(s => {
      const normalized = s.toLowerCase().trim()
      if (normalized === q) return false
      if (!normalized.includes(q)) return false
      if (seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
    setFiltered(matches.slice(0, 6))
    setShow(matches.length > 0)
  }, [value, suggestions])

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setShow(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => {
          if (filtered.length > 0) setShow(true)
        }}
        placeholder={placeholder}
        style={style}
      />
      {show && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#0d2137', border: `1px solid ${T.tealBorder}`,
          borderRadius: '8px', marginTop: '4px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden'
        }}>
          {filtered.map(s => (
            <div key={s} onMouseDown={() => { onChange(s); setShow(false) }}
              style={{
                padding: '10px 14px', cursor: 'pointer', color: T.white,
                fontSize: '14px', fontFamily: 'Georgia, serif',
                borderBottom: `1px solid ${T.tealBorder}`,
                transition: 'background 0.1s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.tealDim}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}