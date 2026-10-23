import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

// A styled autocomplete for the From/To city fields on the LR form. Unlike a
// plain <select>, this allows FREE TYPING: the operator can book to a city that
// is not yet saved in Locations without adding it first. Typing filters the
// saved locations and shows up to MAX_RESULTS suggestions; picking one fills the
// field, but any typed value is accepted as-is. The menu renders in a portal so
// it is never clipped by the surrounding card.
//
// Props:
//   value        current city text (free text allowed)
//   onChange     (text) => void — user typed or picked a city
//   locations    [{ id, name, state }]
//   placeholder
const MAX_RESULTS = 7

export default function CityAutocomplete({
  value,
  onChange,
  onNext,
  inputRef: externalInputRef,
  locations = [],
  placeholder = 'Type or select city',
  className = '',
  inputClassName = '',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })
  const wrapRef = useRef(null)
  const localInputRef = useRef(null)
  const inputRef = externalInputRef || localInputRef
  const menuRef = useRef(null)

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const q = (value || '').trim().toLowerCase()
  // Match anywhere in the name, but rank cities that START WITH the typed text first
  const matches = locations
    .filter(loc => !q || loc.name?.toLowerCase().includes(q))
    .sort((a, b) => {
      if (!q) return 0
      const aStarts = a.name?.toLowerCase().startsWith(q)
      const bStarts = b.name?.toLowerCase().startsWith(q)
      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1
      return 0
    })
    .slice(0, MAX_RESULTS)

  useEffect(() => {
    setActiveIndex(0)
  }, [value, open])

  const place = () => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setCoords({ top: r.bottom + 4, left: r.left, width: r.width })
  }

  useLayoutEffect(() => { if (open) place() }, [open, value])

  useEffect(() => {
    if (!open) return
    const reposition = () => place()
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (loc) => {
    onChange(loc.name)
    setOpen(false)
    setActiveIndex(0)
    if (onNext) setTimeout(() => onNext(), 0)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      if (!open) {
        setOpen(true)
      } else if (matches.length > 0) {
        e.preventDefault()
        setActiveIndex(i => (i + 1) % matches.length)
      }
    } else if (e.key === 'ArrowUp') {
      if (open && matches.length > 0) {
        e.preventDefault()
        setActiveIndex(i => (i - 1 + matches.length) % matches.length)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && matches.length > 0 && activeIndex >= 0 && activeIndex < matches.length) {
        pick(matches[activeIndex])
      } else {
        setOpen(false)
        if (onNext) setTimeout(() => onNext(), 0)
      }
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className={className}>
      <input
        ref={inputRef}
        className={`form-input ${inputClassName}`}
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={e => { if (!disabled) { onChange(e.target.value); setOpen(true) } }}
        onFocus={() => { if (!disabled) setOpen(true) }}
        onClick={() => { if (!disabled) setOpen(true) }}
        onKeyDown={handleKeyDown}
      />

      {open && matches.length > 0 && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width }}
          className="z-[9999] max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
        >
          {matches.map((loc, idx) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => pick(loc)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left transition-colors ${
                idx === activeIndex ? 'bg-blue-50 text-blue-900 font-semibold' : 'hover:bg-slate-50 text-slate-800'
              }`}
            >
              <span className="truncate text-sm font-medium">{loc.name}</span>
              {loc.state && <span className="shrink-0 text-xs text-slate-400">{loc.state}</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
