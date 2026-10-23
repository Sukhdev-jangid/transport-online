import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, Search } from 'lucide-react'

// A custom dropdown that replaces the native <select>. Unlike a native select,
// the open menu is fully styleable (rounded highlight, spacing, brand colors).
// The menu is rendered in a portal to document.body so it is never clipped by a
// parent card's `overflow-hidden`.
//
// Props:
//   value        current value (string/number)
//   onChange     (value) => void
//   options      [{ value, label }]
//   placeholder  shown when no value matches
//   className    extra classes on the trigger button
//   disabled
export default function Select({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  className = '',
  disabled = false,
  // When true, a search box appears at the top of the menu and only the first
  // `maxVisible` matching options are shown (rest are reachable by typing). Use
  // for long lists like vehicles; leave off for short fixed lists.
  searchable = false,
  maxVisible = 8,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [coords, setCoords] = useState({ top: null, bottom: null, left: 0, width: 0, maxHeight: 264 })
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const searchRef = useRef(null)

  const selected = options.find(o => String(o.value) === String(value))

  // Filtered + capped list shown in the menu. Only applies when searchable.
  const q = query.trim().toLowerCase()
  const matched = searchable && q
    ? options.filter(o => String(o.label).toLowerCase().includes(q))
    : options
  const visible = searchable ? matched.slice(0, maxVisible) : matched
  const hiddenCount = matched.length - visible.length

  // Measure the trigger and place the menu (fixed positioning). If there isn't
  // enough room below (e.g. a "Rows per page" select near the page bottom), flip
  // the menu above the trigger so it never gets clipped by the viewport edge.
  const place = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 8
    const rowCount = searchable ? visible.length : options.length
    const searchBar = searchable ? 44 : 0
    const estHeight = Math.min(320, rowCount * 40 + 8 + searchBar)   // rough menu height
    const spaceBelow = window.innerHeight - r.bottom - margin
    const spaceAbove = r.top - margin

    // Drop up only when there's not enough space below AND more space above.
    const dropUp = spaceBelow < estHeight && spaceAbove > spaceBelow

    if (dropUp) {
      setCoords({
        top: null,
        bottom: window.innerHeight - r.top + 4,   // anchor to bottom → grows upward
        left: r.left,
        width: r.width,
        maxHeight: Math.max(120, spaceAbove),
      })
    } else {
      setCoords({
        top: r.bottom + 4,
        bottom: null,
        left: r.left,
        width: r.width,
        maxHeight: Math.max(120, spaceBelow),
      })
    }
  }

  useLayoutEffect(() => { if (open) place() }, [open, visible.length])

  // Reset the search box each time the menu opens, and focus it so the user can
  // type a vehicle number immediately.
  useEffect(() => {
    if (open) {
      setQuery('')
      if (searchable) requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open, searchable])

  // Reposition on scroll/resize; close on outside click.
  useEffect(() => {
    if (!open) return
    const reposition = () => place()
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
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

  const pick = (v) => { onChange(v); setOpen(false) }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white
          pl-3 pr-2.5 py-2 text-sm text-left outline-none transition-all
          focus:border-primary-600 focus:ring-2 focus:ring-primary-600/10
          disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
          ${open ? 'border-primary-600 ring-2 ring-primary-600/10' : ''} ${className}`}
      >
        <span className={`truncate ${selected ? 'text-slate-900' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.top ?? undefined,
            bottom: coords.bottom ?? undefined,
            left: coords.left,
            width: coords.width,
            maxHeight: coords.maxHeight,
          }}
          className="z-[9999] flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
        >
          {searchable && (
            <div className="p-1.5 border-b border-slate-100">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Type to search..."
                  className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-2.5 py-1.5 text-sm outline-none
                    focus:border-primary-600 focus:ring-2 focus:ring-primary-600/10 placeholder:text-slate-400"
                />
              </div>
            </div>
          )}

          <div className="overflow-y-auto p-1">
            {visible.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-400">
                {options.length === 0 ? 'No options' : 'No matches'}
              </div>
            )}
            {visible.map(o => {
              const isSel = String(o.value) === String(value)
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => pick(o.value)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors
                    ${isSel
                      ? 'bg-primary-50 text-primary-700 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <span className="truncate">{o.label}</span>
                  {isSel && <Check size={14} className="shrink-0 text-primary-600" />}
                </button>
              )
            })}
            {hiddenCount > 0 && (
              <div className="px-3 py-1.5 text-[11px] text-slate-400">
                +{hiddenCount} more — keep typing to narrow
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
