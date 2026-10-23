import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronDown, X } from 'lucide-react'

// A reusable "Select Period" date filter: quick presets plus a custom range.
// Uses createPortal to document.body so the popover is NEVER clipped by parent
// overflow-hidden or z-index stacking contexts.
const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function presetRange(key) {
  const today = new Date()
  const start = new Date(today)
  switch (key) {
    case 'today':
      return { from: iso(today), to: iso(today), label: 'Today' }
    case 'yesterday': {
      start.setDate(today.getDate() - 1)
      return { from: iso(start), to: iso(start), label: 'Yesterday' }
    }
    case 'week':
      start.setDate(today.getDate() - 6)
      return { from: iso(start), to: iso(today), label: 'Last 7 Days' }
    case 'month':
      start.setMonth(today.getMonth() - 1)
      return { from: iso(start), to: iso(today), label: 'Last Month' }
    case 'year':
      start.setFullYear(today.getFullYear() - 1)
      return { from: iso(start), to: iso(today), label: 'Last Year' }
    default:
      return null
  }
}

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'Last Week' },
  { key: 'month', label: 'Last Month' },
  { key: 'year', label: 'Last Year' },
]

export default function DateFilter({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(value?.from || '')
  const [to, setTo] = useState(value?.to || '')
  const [coords, setCoords] = useState({ top: null, bottom: null, left: 0 })
  const btnRef = useRef(null)
  const popoverRef = useRef(null)

  useEffect(() => { setFrom(value?.from || ''); setTo(value?.to || '') }, [value])

  const place = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 8
    const estHeight = 260
    const spaceBelow = window.innerHeight - r.bottom - margin
    const spaceAbove = r.top - margin
    const dropUp = spaceBelow < estHeight && spaceAbove > spaceBelow

    let left = r.left
    if (left + 420 > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - 420 - 16)
    }

    if (dropUp) {
      setCoords({
        top: null,
        bottom: window.innerHeight - r.top + 4,
        left,
      })
    } else {
      setCoords({
        top: r.bottom + 4,
        bottom: null,
        left,
      })
    }
  }

  useLayoutEffect(() => {
    if (open) place()
  }, [open])

  useEffect(() => {
    if (!open) return
    const reposition = () => place()
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target) || popoverRef.current?.contains(e.target)) return
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

  const pickPreset = (key) => {
    onChange(presetRange(key))
    setOpen(false)
  }

  const applyCustom = () => {
    if (!from && !to) { onChange(null); setOpen(false); return }
    let a = from || to
    let b = to || from
    if (a > b) { const t = a; a = b; b = t }
    onChange({ from: a, to: b, label: a === b ? a : `${a} → ${b}` })
    setOpen(false)
  }

  const clear = (e) => {
    e.stopPropagation()
    onChange(null)
    setFrom(''); setTo('')
  }

  const active = !!value
  const btnLabel = active ? value.label : 'Select Period'

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors
          ${active ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50 bg-white'}`}
      >
        <Calendar size={13} />
        <span className="max-w-[160px] truncate">{btnLabel}</span>
        {active
          ? <X size={13} className="hover:text-blue-900" onClick={clear} />
          : <ChevronDown size={13} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />}
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: coords.top !== null ? coords.top : undefined,
            bottom: coords.bottom !== null ? coords.bottom : undefined,
            left: coords.left,
            zIndex: 9999,
          }}
          className="flex w-[420px] max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white shadow-2xl overflow-hidden"
        >
          {/* Presets */}
          <div className="w-40 border-r border-slate-100 py-2 shrink-0 bg-slate-50/50">
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Presets</div>
            {PRESETS.map(p => (
              <button key={p.key} type="button" onClick={() => pickPreset(p.key)}
                className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                {p.label}
              </button>
            ))}
          </div>
          {/* Custom range */}
          <div className="flex-1 p-3.5 bg-white">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Custom Range</div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1">From</label>
            <input type="date" className="form-input py-1.5 text-xs mb-3 w-full" value={from}
              onChange={e => setFrom(e.target.value)} />
            <label className="block text-[10px] font-semibold text-slate-500 mb-1">To</label>
            <input type="date" className="form-input py-1.5 text-xs mb-3 w-full" value={to}
              onChange={e => setTo(e.target.value)} />
            <button type="button" onClick={applyCustom}
              className="w-full rounded-md bg-primary-600 py-2 text-xs font-semibold text-white hover:bg-primary-700 transition-colors shadow-sm">
              Done
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
