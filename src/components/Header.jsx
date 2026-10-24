import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Settings, Lock, FileText, User, Truck, ClipboardList } from 'lucide-react'
import { COMPANY } from '../config/company'
import { getLREntries, getCustomers, getVehicles } from '../db/database'

const MAX_PER_GROUP = 5

// Build a flat list of search hits across LR bills, customers and vehicles.
// Filters an already-loaded dataset (fetched once from Supabase) so typing is
// instant and does not hit the network on every keystroke.
function searchAll(q, data) {
  const s = q.trim().toLowerCase()
  if (!s) return []
  const has = (...vals) => vals.some(v => String(v || '').toLowerCase().includes(s))
  const hits = []

  data.lrs
    .filter(e => has(e.lr_number, e.consignor, e.consignee, e.from_city, e.to_city))
    .slice(0, MAX_PER_GROUP)
    .forEach(e => hits.push({
      type: 'LR', icon: FileText,
      title: `LR ${e.lr_number}`,
      sub: `${e.consignor || '—'} → ${e.consignee || '—'} · ${e.from_city}→${e.to_city}`,
      to: `/bilty/${encodeURIComponent(e.lr_number)}`,
    }))

  data.customers
    .filter(c => has(c.name, c.phone, c.city))
    .slice(0, MAX_PER_GROUP)
    .forEach(c => hits.push({
      type: 'Customer', icon: User,
      title: c.name,
      sub: [c.phone, c.city].filter(Boolean).join(' · ') || '—',
      to: '/customers',
    }))

  data.vehicles
    .filter(v => has(v.vehicle_number, v.model, v.vehicle_type))
    .slice(0, MAX_PER_GROUP)
    .forEach(v => hits.push({
      type: 'Vehicle', icon: Truck,
      title: v.vehicle_number,
      sub: [v.vehicle_type, v.model].filter(Boolean).join(' · ') || '—',
      to: '/vehicles',
    }))

  return hits
}

export default function Header({ onLock }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [data, setData] = useState({ lrs: [], customers: [], vehicles: [] })
  const boxRef = useRef(null)

  const results = query ? searchAll(query, data) : []

  // Load the searchable datasets once from Supabase.
  useEffect(() => {
    Promise.all([getLREntries(), getCustomers(), getVehicles()])
      .then(([lrs, customers, vehicles]) => setData({ lrs, customers, vehicles }))
      .catch(() => { /* network/not signed in — search just stays empty */ })
  }, [])

  // Close the dropdown when clicking outside the search box.
  useEffect(() => {
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const go = (to) => {
    navigate(to)
    setQuery('')
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false) }
    else if (e.key === 'Enter' && results.length > 0) { go(results[0].to) }
  }

  return (
    <header className="col-span-2 flex items-center h-14 bg-white border-b border-slate-200 z-50">
      {/* Brand */}
      <div className="w-[240px] flex items-center gap-3 px-4 border-r border-slate-200 h-full shrink-0">
        {COMPANY.logoDataUrl ? (
          <img src={COMPANY.logoDataUrl} alt={COMPANY.short}
            className="w-9 h-9 rounded-lg object-contain shrink-0" />
        ) : (
          <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center text-white shrink-0 font-black text-xs tracking-tighter">
            {COMPANY.short}
          </div>
        )}
        <div className="flex flex-col leading-tight">
          <span className="text-[14px] font-bold text-slate-900 tracking-tight">Hariom Transport</span>
          <span className="text-[11px] font-semibold text-slate-400 tracking-wide">and Cargo</span>
        </div>
      </div>

      {/* Search */}
      <div className="flex-1 px-5">
        <div className="relative max-w-sm" ref={boxRef}>
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search LR, customers, vehicles..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5
                       text-xs text-slate-700 outline-none transition
                       focus:border-primary-600 focus:bg-white placeholder:text-slate-400"
          />

          {/* Results dropdown */}
          {open && query.trim() && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden z-50">
              {results.length === 0 ? (
                <div className="px-3 py-3 text-xs text-slate-400 text-center">
                  No results for "{query.trim()}"
                </div>
              ) : (
                <ul className="max-h-80 overflow-y-auto py-1">
                  {results.map((r, i) => (
                    <li key={i}>
                      <button
                        onClick={() => go(r.to)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 transition">
                        <span className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                          <r.icon size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-slate-800 truncate">{r.title}</span>
                          <span className="block text-[10px] text-slate-400 truncate">{r.sub}</span>
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-300 shrink-0">{r.type}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Actions — functional shortcuts */}
      <div className="flex items-center gap-1.5 px-4">
        <button
          onClick={() => navigate('/lr-entry')}
          title="New LR Bilty"
          className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center
                     text-slate-600 hover:bg-slate-50 hover:text-primary-600 transition cursor-pointer"
        >
          <Plus size={14} />
        </button>

        <button
          onClick={() => navigate('/challans', { state: { openNew: true } })}
          title="New Challan"
          className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center
                     text-slate-600 hover:bg-slate-50 hover:text-primary-600 transition cursor-pointer"
        >
          <ClipboardList size={14} />
        </button>

        <button
          onClick={() => navigate('/settings')}
          title="Company Settings"
          className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center
                     text-slate-500 hover:bg-slate-50 hover:text-primary-600 transition cursor-pointer"
        >
          <Settings size={14} />
        </button>

        {onLock && (
          <button
            onClick={onLock}
            title="Lock app"
            className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center
                       text-slate-500 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition cursor-pointer"
          >
            <Lock size={14} />
          </button>
        )}

        {/* Company badge */}
        <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center
                        text-white text-[11px] font-bold cursor-default border-2 border-slate-200 ml-1"
          title={COMPANY.name}>
          {COMPANY.short}
        </div>
      </div>

    </header>
  )
}
