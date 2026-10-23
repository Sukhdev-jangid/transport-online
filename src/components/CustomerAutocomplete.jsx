import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

// A styled autocomplete for picking a saved customer by name or phone. Replaces
// the native <datalist> so the suggestion list is fully styleable and can show
// richer info (name + phone + address). Shows up to 5 matches. The menu renders
// in a portal so it is never clipped by a parent card.
//
// Props:
//   value        current name text
//   onChange     (text) => void — user typed something (free text allowed)
//   onPick       (customer) => void — a suggestion was chosen
//   customers    [{ id, name, phone, address, city }]
//   placeholder
const MAX_RESULTS = 5

export default function CustomerAutocomplete({
  value,
  onChange,
  onPick,
  onNext,
  inputRef: externalInputRef,
  customers = [],
  placeholder = 'Search by name or phone',
  className = '',
  inputClassName = '',
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })
  const wrapRef = useRef(null)
  const localInputRef = useRef(null)
  const inputRef = externalInputRef || localInputRef
  const menuRef = useRef(null)

  // Filter by name or phone digits; cap at MAX_RESULTS.
  const q = (value || '').trim().toLowerCase()
  const digits = q.replace(/\D/g, '')
  const matches = customers.filter(c => {
    if (!q) return true
    const nameHit = c.name?.toLowerCase().includes(q)
    const phoneHit = digits && c.phone && c.phone.replace(/\D/g, '').includes(digits)
    return nameHit || phoneHit
  }).slice(0, MAX_RESULTS)

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

  const pick = (c) => {
    onPick(c)
    setOpen(false)
    setActiveIndex(0)
    if (onNext) setTimeout(() => onNext(c), 0)
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
        if (onNext) setTimeout(() => onNext(null), 0)
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
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />

      {open && matches.length > 0 && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width }}
          className="z-[9999] max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
        >
          {matches.map((c, idx) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c)}
              className={`flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors ${
                idx === activeIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50 text-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{c.name}</span>
                {c.phone && <span className="shrink-0 text-xs text-slate-500">+91 {c.phone}</span>}
              </div>
              {(c.address || c.city) && (
                <span className="truncate text-xs text-slate-400">
                  {[c.address, c.city].filter(Boolean).join(', ')}
                </span>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
