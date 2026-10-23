import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

// An inline autocomplete for the vehicle field — same free-typing behaviour as
// the From/To city fields: the operator types a vehicle number directly and
// matching saved vehicles suggest below. ANY typed value is accepted as-is
// (a vehicle not yet in the master can still be entered); picking a suggestion
// just fills it in. The stored value is the raw text (the vehicle number).
//
// Props:
//   value        current vehicle number text (free text allowed)
//   onChange     (text) => void — user typed or picked
//   options      [{ value, label }] — saved vehicles to suggest
//   placeholder
const MAX_RESULTS = 8

export default function VehicleAutocomplete({
  value,
  onChange,
  options = [],
  placeholder = 'Type or select vehicle',
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const menuRef = useRef(null)

  // Free-text field: the visible text IS the value (like the city field). We
  // don't force it onto an option's label, so custom numbers stay as typed.
  const q = (value || '').trim().toLowerCase()

  // Suggest matching vehicles. With a query, rank prefix matches first and hide
  // an option that already equals the typed value exactly (nothing to pick).
  // Skip the empty ("Not assigned") option from the type-ahead list.
  const matches = options
    .filter(o => o.value !== '' && (!q || String(o.label).toLowerCase().includes(q)))
    .filter(o => String(o.value).toLowerCase() !== q)
    .sort((a, b) => {
      if (!q) return 0
      const aS = String(a.label).toLowerCase().startsWith(q)
      const bS = String(b.label).toLowerCase().startsWith(q)
      if (aS && !bS) return -1
      if (!aS && bS) return 1
      return 0
    })
    .slice(0, MAX_RESULTS)

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

  // Pick a suggestion → store its value (the vehicle number, not the "— Truck"
  // label) so the field holds a clean number.
  const pick = (o) => {
    onChange(o.value)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && matches.length > 0) {
      e.preventDefault()
      pick(matches[0])
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        className="form-input pr-8"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <ChevronDown
        size={16}
        className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
      />

      {open && matches.length > 0 && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width }}
          className="z-[9999] max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
        >
          {matches.map(o => (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => pick(o)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-primary-50"
            >
              <span className="truncate">{o.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
