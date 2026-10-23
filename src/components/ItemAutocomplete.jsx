import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

// A styled autocomplete for the item-name field in the LR items table. Replaces
// the native <datalist> so suggestions are fully styleable and show the saved
// rate. Free typing is allowed (custom items with a manual rate); picking a
// suggestion fills the name and its default rate. Shows up to 5 matches. The
// menu renders in a portal so it is never clipped by the table/card.
//
// Props:
//   value           current item name text
//   onChange        (text) => void — user typed (free text allowed)
//   onPick          (item) => void — a suggestion was chosen
//   items           [{ id, item_name, default_rate, rate_type }]
//   inputClassName  extra classes for the input (table cells use compact sizing)
//   placeholder
const MAX_RESULTS = 5

export default function ItemAutocomplete({
  value,
  onChange,
  onPick,
  onNext,
  inputRef: externalInputRef,
  items = [],
  inputClassName = '',
  placeholder = 'Type or pick an item',
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })
  const wrapRef = useRef(null)
  const domInputRef = useRef(null)
  const menuRef = useRef(null)

  const handleRef = (el) => {
    domInputRef.current = el
    if (typeof externalInputRef === 'function') {
      externalInputRef(el)
    } else if (externalInputRef && typeof externalInputRef === 'object') {
      externalInputRef.current = el
    }
  }

  const q = (value || '').trim().toLowerCase()
  const matches = items.filter(i => {
    if (!q) return true
    const name = (i.item_name || '').toLowerCase()
    if (name.includes(q)) return true
    const words = q.split(/\s+/)
    if (words.every(w => name.includes(w))) return true
    if (q.length >= 3) {
      let qIdx = 0
      for (let char of name) {
        if (char === q[qIdx]) qIdx++
        if (qIdx === q.length) return true
      }
    }
    return false
  }).sort((a, b) => {
    if (!q) return 0
    const aName = (a.item_name || '').toLowerCase()
    const bName = (b.item_name || '').toLowerCase()
    const aStarts = aName.startsWith(q)
    const bStarts = bName.startsWith(q)
    if (aStarts && !bStarts) return -1
    if (!aStarts && bStarts) return 1
    return aName.localeCompare(bName)
  }).slice(0, 8)

  useEffect(() => {
    setActiveIndex(0)
  }, [value, open])

  const place = () => {
    const el = domInputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width > 0) {
      setCoords({
        top: r.bottom + 4,
        left: r.left,
        width: Math.max(r.width, 240)
      })
    }
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

  const pick = (i) => {
    onPick(i)
    setOpen(false)
    setActiveIndex(0)
    if (onNext) setTimeout(() => onNext(i), 0)
  }

  const openMenu = () => {
    place()
    setOpen(true)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      if (!open) {
        openMenu()
      } else if (matches.length > 0) {
        e.preventDefault()
        setActiveIndex(idx => (idx + 1) % matches.length)
      }
    } else if (e.key === 'ArrowUp') {
      if (open && matches.length > 0) {
        e.preventDefault()
        setActiveIndex(idx => (idx - 1 + matches.length) % matches.length)
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
    <div ref={wrapRef}>
      <input
        ref={handleRef}
        className={`form-input ${inputClassName}`}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); openMenu() }}
        onFocus={openMenu}
        onClick={openMenu}
        onKeyDown={handleKeyDown}
      />

      {open && matches.length > 0 && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            minWidth: coords.width > 0 ? `${coords.width}px` : '240px',
            width: coords.width > 0 ? `${coords.width}px` : 'auto',
          }}
          className="z-[9999] max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
        >
          {matches.map((i, idx) => (
            <button
              key={i.id}
              type="button"
              onClick={() => pick(i)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left transition-colors ${
                idx === activeIndex ? 'bg-blue-50 text-blue-900 font-semibold' : 'hover:bg-slate-50 text-slate-800'
              }`}
            >
              <span className="truncate text-sm font-medium">{i.item_name}</span>
              <span className="shrink-0 text-xs text-slate-500">
                ₹{i.default_rate} / {i.rate_type}
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
