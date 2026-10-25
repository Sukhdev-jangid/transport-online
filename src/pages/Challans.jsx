import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import {
  Plus, ClipboardList, Pencil, Trash2, X, Search, RefreshCw,
  Printer, ArrowLeft, Check, Download, ShieldAlert, CheckCircle2
} from 'lucide-react'
import {
  getChallans, addChallan, updateChallan, deleteChallan, peekNextChallanNumber,
  getLREntries, getVehicles, getDrivers, getLocations, reloadDatabase,
} from '../db/database'
import { COMPANY } from '../config/company'
import { fmtDate } from '../utils/date'
import { toPayTotal } from '../utils/billing'
import { downloadChallanPdf } from '../utils/challanPdf'
import { playSound } from '../utils/sound'
import ChallanDocument from '../components/ChallanDocument'
import ChallanInvoiceModal from '../components/ChallanInvoiceModal'
import Pagination from '../components/Pagination'
import DateFilter from '../components/DateFilter'
import CityAutocomplete from '../components/CityAutocomplete'
import CustomerAutocomplete from '../components/CustomerAutocomplete'
import VehicleAutocomplete from '../components/VehicleAutocomplete'

// Payment filter pills for the bilty picker (same as the Bilty page).
const PAYMENT_TABS = [
  { key: 'all', label: 'All' },
  { key: 'Paid', label: 'Paid' },
  { key: 'ToPay', label: 'To Pay' },
  { key: 'TBB', label: 'TBB' },
]

const todayISO = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const emptyForm = () => ({
  manifestDate: todayISO(),
  vehicleNumber: '',
  driverName: '',
  driverPhone: '',
  fromCentre: COMPANY.defaultFrom || '',
  toCentre: '',
})

export default function Challans() {
  const location = useLocation()
  const [challans, setChallans] = useState([])
  const [entries, setEntries] = useState([])       // all bilties, for the picker
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [locations, setLocations] = useState([])
  const [toast, setToast] = useState(null)
  const [confirmId, setConfirmId] = useState(null)

  // View: 'list' or 'form'
  const [view, setView] = useState('list')
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [selected, setSelected] = useState(() => new Set())  // lr_entry ids on this challan
  const [nextNo, setNextNo] = useState('')

  // List search + paging
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)

  // Picker search + filters + paging
  const [pickSearch, setPickSearch] = useState('')
  const [pickPay, setPickPay] = useState('all')            // all | Paid | ToPay | TBB
  const [pickDateRange, setPickDateRange] = useState(null) // { from, to, label } | null
  const [pickPage, setPickPage] = useState(0)
  const [pickRows, setPickRows] = useState(20)

  // Hidden render → direct download PDF (no drawer)
  const [printData, setPrintData] = useState(null)
  // Challan shown in the right-side preview/print drawer
  const [previewChallan, setPreviewChallan] = useState(null)

  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)      // blocks double-submit on challan save
  const [deleting, setDeleting] = useState(false)  // blocks double-click on delete
  const loadAll = async () => {
    const [ch, en, ve, dr, lo] = await Promise.all([
      getChallans(), getLREntries(), getVehicles(), getDrivers(), getLocations(),
    ])
    setChallans(ch)
    setEntries(en)
    setVehicles(ve)
    setDrivers(dr)
    setLocations(lo)
  }
  useEffect(() => { loadAll() }, [])

  // Hard refresh: re-fetch this page's data from Supabase.
  const hardRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try { await reloadDatabase(); await loadAll() }
    finally { setRefreshing(false) }
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  // ── List filtering ──
  const filtered = challans.filter(c =>
    [c.challan_number, c.vehicle_number, c.driver_name, c.from_centre, c.to_centre]
      .some(x => String(x || '').toLowerCase().includes(search.toLowerCase()))
  )
  useEffect(() => { setPage(0) }, [search, rowsPerPage])
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  // ── Form helpers ──
  const openNew = () => {
    loadAll()              // refresh bilties so newly-created bills appear in the picker
    setEditId(null)
    setForm(emptyForm())
    setSelected(new Set())
    peekNextChallanNumber().then(setNextNo)
    setPickSearch(''); setPickPay('all'); setPickDateRange(null)
    setView('form')
  }

  useEffect(() => {
    if (location.state?.openNew) {
      openNew()
    }
  }, [location.state])

  const openEdit = (c) => {
    setEditId(c.id)
    setForm({
      manifestDate: c.manifest_date || todayISO(),
      vehicleNumber: c.vehicle_number || '',
      driverName: c.driver_name || '',
      driverPhone: c.driver_phone || '',
      fromCentre: c.from_centre || '',
      toCentre: c.to_centre || '',
    })
    setSelected(new Set((c.bilties || []).map(b => b.id)))
    setNextNo(c.challan_number)
    setPickSearch(''); setPickPay('all'); setPickDateRange(null)
    setView('form')
  }

  const backToList = () => { setView('list'); setEditId(null) }

  // When a vehicle is picked, auto-fill the driver assigned to it (if any).
  const onVehicleChange = (vno) => {
    setForm(f => {
      const next = { ...f, vehicleNumber: vno }
      const drv = drivers.find(d => (d.vehicle_number || '') === vno)
      if (drv) { next.driverName = drv.name || ''; next.driverPhone = drv.phone || '' }
      return next
    })
  }

  const toggleBilty = (id) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  // Picker list: bilties matching search + payment pill + date range. Already-
  // selected bilties are always kept visible so a filter change never hides a
  // pick (you can still see and un-tick it).
  const pickerList = entries.filter(e => {
    if (selected.has(e.id)) return true
    const q = pickSearch.toLowerCase()
    const matchesText = !q || [e.lr_number, e.consignor, e.consignee, e.to_city, e.items]
      .some(x => String(x || '').toLowerCase().includes(q))
    const matchesPay = pickPay === 'all' || (e.payment_type || 'ToPay') === pickPay
    const matchesDate = !pickDateRange || (e.date >= pickDateRange.from && e.date <= pickDateRange.to)
    return matchesText && matchesPay && matchesDate
  })
  const selectedBilties = entries.filter(e => selected.has(e.id))
  const selectedToPay = selectedBilties.reduce((s, e) => s + toPayTotal(e), 0)

  // Reset the picker to page 1 whenever a filter changes the result set.
  useEffect(() => { setPickPage(0) }, [pickSearch, pickPay, pickDateRange, pickRows])
  const pickPaged = pickerList.slice(pickPage * pickRows, pickPage * pickRows + pickRows)

  // Select-all toggles EVERY filtered bilty (across all pages), not just the
  // current page — the same way the Bilty page's statement select-all works.
  const allFilteredSelected = pickerList.length > 0 && pickerList.every(e => selected.has(e.id))
  const toggleSelectAllFiltered = () => {
    setSelected(prev => {
      const n = new Set(prev)
      if (allFilteredSelected) pickerList.forEach(e => n.delete(e.id))
      else pickerList.forEach(e => n.add(e.id))
      return n
    })
  }

  const handleSave = async () => {
    if (saving) return
    if (!form.manifestDate) {
      showToast('Please select a Manifest Date.', 'error')
      return
    }
    if (!form.vehicleNumber?.trim()) {
      showToast('Gadi No. (Vehicle Number) is required!', 'error')
      return
    }
    if (!form.driverName?.trim()) {
      showToast('Driver Name is required!', 'error')
      return
    }
    if (!form.fromCentre?.trim()) {
      showToast('From Centre (Origin) is required!', 'error')
      return
    }
    if (!form.toCentre?.trim()) {
      showToast('To Centre (Destination City) is required!', 'error')
      return
    }
    if (selected.size === 0) {
      showToast('Please select at least one bilty/bill for this challan.', 'error')
      return
    }
    // Preserve the order bilties appear in the master list (newest→oldest id).
    const lrIds = entries.filter(e => selected.has(e.id)).map(e => e.id)
    const payload = { ...form, lrIds }
    setSaving(true)
    try {
      // await: these persist to disk and throw on failure. On a disk error the
      // challan is rolled back (not saved) and we fall into catch — so we never
      // show "created" for a challan that isn't actually in the database.
      if (editId) {
        setChallans(await updateChallan(editId, payload))
        showToast('✓ Challan updated — saved to database!')
      } else {
        setChallans(await addChallan(payload))
        showToast('✓ Challan created — saved to database!')
      }
      playSound(true)
      loadAll()
      backToList()
    } catch (err) {
      playSound(false)
      showToast('✗ CHALLAN NOT SAVED! Disk error: ' + err.message + ' — try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (deleting) return
    setDeleting(true)
    try {
      setChallans(await deleteChallan(id))
      showToast('✓ Challan deleted!')
      setConfirmId(null)
    } catch (err) {
      playSound(false)
      showToast('✗ NOT DELETED — disk error: ' + err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  // ── Challan PDF actions ──
  // Download: render the challan hidden and save it straight to a PDF (no drawer).
  const downloadChallan = (c) => setPrintData(c)
  // Preview / Print: open the right-side drawer with a live preview + Print/Download.
  const openPreview = (c) => setPreviewChallan(c)

  useEffect(() => {
    if (!printData) return
    let cancelled = false
    const run = async () => {
      document.body.classList.add('printing-challan')
      try {
        // Wait for the logo image inside the hidden challan to load.
        const imgs = Array.from(document.querySelectorAll('#printableChallan img'))
        await Promise.all(imgs.map(img => (img.complete && img.naturalWidth > 0)
          ? Promise.resolve()
          : new Promise(res => { img.onload = res; img.onerror = res })))
        const safeNo = String(printData.challan_number || 'challan').replace(/[^\w\-]+/g, '-').slice(0, 40)
        if (window.electronAPI?.saveChallanPdf) {
          await window.electronAPI.saveChallanPdf(`Challan-${safeNo}.pdf`)
        } else {
          await downloadChallanPdf(printData)
        }
      } finally {
        document.body.classList.remove('printing-challan')
        if (!cancelled) setPrintData(null)
      }
    }
    const t = setTimeout(run, 60)
    return () => { cancelled = true; clearTimeout(t); document.body.classList.remove('printing-challan') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printData])

  // Keyboard shortcut: Ctrl+S or Ctrl+Enter to save challan
  useEffect(() => {
    if (view !== 'form') return
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 's')) {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [view, selected, form, editId, entries])

  // ══════════════════════════ FORM VIEW ══════════════════════════
  if (view === 'form') {
    return (
      <div className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={backToList} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50">
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {editId ? `Edit Challan #${nextNo}` : `New Challan #${nextNo}`}
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  Shortcuts: <kbd className="font-semibold text-slate-800">Ctrl+S</kbd> or <kbd className="font-semibold text-slate-800">Ctrl+Enter</kbd>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Loading sheet for one truck trip — pick the bilties loaded on it.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={backToList} className="btn btn-outline" disabled={saving}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary disabled:opacity-60 disabled:cursor-wait">
              {saving ? 'Saving…' : (editId ? 'Update Challan (Ctrl+S)' : 'Create Challan (Ctrl+S)')}
            </button>
          </div>
        </div>

        {/* Trip details */}
        <div className="card mb-4">
          <div className="card-header"><span className="card-title"><ClipboardList size={15} /> Trip Details</span></div>
          <div className="p-5 grid grid-cols-3 gap-4">
            <div>
              <label className="form-label font-semibold text-xs">
                Manifest Date <span className="text-red-500">*</span>
              </label>
              <input className="form-input" type="date"
                value={form.manifestDate} onChange={e => setForm(f => ({ ...f, manifestDate: e.target.value }))} />
            </div>
            <div>
              <label className="form-label font-semibold text-xs">
                Gadi No. (Vehicle) <span className="text-red-500">*</span>
              </label>
              {/* Same styled vehicle picker as the All Drivers page — "number —
                  Type" suggestions; picking one also auto-fills its driver. */}
              <VehicleAutocomplete
                value={form.vehicleNumber}
                onChange={onVehicleChange}
                options={vehicles.map(v => ({
                  value: v.vehicle_number,
                  label: `${v.vehicle_number}${v.vehicle_type ? ` — ${v.vehicle_type}` : ''}`,
                }))}
                placeholder={vehicles.length ? 'Type or select vehicle' : 'No vehicles yet'}
              />
            </div>
            <div>
              <label className="form-label font-semibold text-xs">
                Driver Name <span className="text-red-500">*</span>
              </label>
              {/* Suggests saved drivers by name/phone; picking one auto-fills the
                  number. Free typing still allowed for a one-off driver. */}
              <CustomerAutocomplete
                value={form.driverName}
                onChange={v => setForm(f => ({ ...f, driverName: v }))}
                onPick={d => setForm(f => ({ ...f, driverName: d.name || '', driverPhone: d.phone || '' }))}
                customers={drivers}
                placeholder="Type or pick a driver"
              />
            </div>
            <div>
              <label className="form-label font-semibold text-xs">Driver Number</label>
              <input className="form-input" type="text" placeholder="10-digit number"
                value={form.driverPhone} onChange={e => setForm(f => ({ ...f, driverPhone: e.target.value }))} />
            </div>
            <div>
              <label className="form-label font-semibold text-xs">
                From Centre (Origin) <span className="text-red-500">*</span>
              </label>
              <CityAutocomplete
                value={form.fromCentre}
                onChange={v => setForm(f => ({ ...f, fromCentre: v }))}
                locations={locations}
                placeholder="Type or select from centre"
              />
            </div>
            <div>
              <label className="form-label font-semibold text-xs">
                To Centre (Destination) <span className="text-red-500">*</span>
              </label>
              <CityAutocomplete
                value={form.toCentre}
                onChange={v => setForm(f => ({ ...f, toCentre: v }))}
                locations={locations}
                placeholder="Type or select to centre"
              />
            </div>
          </div>
        </div>

        {/* Bilty picker */}
        <div className="card mb-4">
          <div className="card-header">
            <span className="card-title"><Check size={15} /> Select Bilties ({selected.size} selected)</span>
            <span className="text-xs text-slate-500">To Pay total: <span className="font-bold text-slate-800">₹{selectedToPay.toLocaleString('en-IN')}</span></span>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="form-input pl-8 w-80 py-2" placeholder="Search LR no, sender, receiver, city, goods..."
                value={pickSearch} onChange={e => setPickSearch(e.target.value)} />
            </div>
            <DateFilter value={pickDateRange} onChange={setPickDateRange} />
            {/* Payment pills */}
            <div className="flex items-center gap-1 ml-auto">
              {PAYMENT_TABS.map(tab => (
                <button key={tab.key} onClick={() => setPickPay(tab.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
                    ${pickPay === tab.key
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-500 hover:bg-slate-100'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            {pickerList.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">No bilties found.</div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-3 py-2.5">
                      <input type="checkbox" title="Select all filtered"
                        checked={allFilteredSelected} onChange={toggleSelectAllFiltered} />
                    </th>
                    {['LR No', 'Date', 'Goods', 'Sender (Consignor)', 'Receiver (Consignee)', 'Route', 'Payment'].map((h, i) => (
                      <th key={i} className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pickPaged.map(e => {
                    const on = selected.has(e.id)
                    return (
                      <tr key={e.id} onClick={() => toggleBilty(e.id)}
                        className={`border-b border-slate-50 cursor-pointer transition-colors ${on ? 'bg-indigo-50/60' : 'hover:bg-blue-50/40'}`}>
                        <td className="px-3 py-2.5">
                          <input type="checkbox" checked={on} readOnly className="pointer-events-none" />
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-blue-600">{e.lr_number}</td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(e.date)}</td>
                        <td className="px-3 py-2.5 text-slate-700 max-w-[180px] truncate">{e.items || '—'}</td>
                        <td className="px-3 py-2.5 text-slate-700">{e.consignor || '—'}</td>
                        <td className="px-3 py-2.5 text-slate-700">{e.consignee || '—'}</td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{(e.from_city || '—')} → {(e.to_city || '—')}</td>
                        <td className="px-3 py-2.5">
                          <span className={`badge ${e.payment_type === 'Paid' ? 'badge-green' : e.payment_type === 'TBB' ? 'badge-blue' : 'badge-yellow'}`}>
                            {e.payment_type === 'Paid' ? 'Paid' : e.payment_type === 'TBB' ? 'TBB' : 'To Pay'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          {pickerList.length > 0 && (
            <Pagination
              total={pickerList.length}
              page={pickPage}
              rowsPerPage={pickRows}
              onPageChange={setPickPage}
              onRowsPerPageChange={setPickRows}
            />
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving} className="btn btn-primary disabled:opacity-60 disabled:cursor-wait">{saving ? 'Saving…' : (editId ? 'Update Challan (Ctrl+S)' : 'Create Challan (Ctrl+S)')}</button>
          <button onClick={backToList} className="btn btn-outline">Cancel</button>
        </div>

        {/* Toast Notification */}
        {toast && (
          <div className={`fixed bottom-5 right-5 px-4 py-2.5 rounded-lg text-white text-xs font-semibold shadow-2xl toast-anim flex items-center gap-2 z-[9999] ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
          }`}>
            {toast.type === 'error' ? <ShieldAlert size={16} /> : <CheckCircle2 size={16} />}
            <span>{toast.msg}</span>
          </div>
        )}
      </div>
    )
  }

  // ══════════════════════════ LIST VIEW ══════════════════════════
  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Challans</h1>
          <p className="text-xs text-slate-500 mt-0.5">Loading sheets (manifests) — one per truck trip, listing the bilties on board.</p>
        </div>
        <button onClick={openNew} className="btn btn-primary flex items-center gap-1.5">
          <Plus size={15} /> New Challan
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title"><ClipboardList size={15} /> All Challans</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{filtered.length} challans</span>
            <button onClick={hardRefresh} disabled={refreshing} title="Hard Refresh — reload from database file"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-wait">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="form-input pl-8 w-80 py-2" placeholder="Search challan no, vehicle, driver, route..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ClipboardList size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No challans yet. Click "New Challan" to create one.</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Challan No', 'Date', 'Vehicle', 'Driver', 'Route', 'Bilties', 'Actions'].map(h => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map(c => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3.5 py-2.5 font-bold text-red-700">{c.challan_number}</td>
                    <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(c.manifest_date)}</td>
                    <td className="px-3.5 py-2.5 font-semibold text-blue-600">{c.vehicle_number || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-700">{c.driver_name || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{(c.from_centre || '—')} → {(c.to_centre || '—')}</td>
                    <td className="px-3.5 py-2.5"><span className="badge badge-blue">{(c.bilties || []).length}</span></td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openPreview(c)} title="Print (preview)"
                          className="p-1.5 rounded-md text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                          <Printer size={13} />
                        </button>
                        <button onClick={() => downloadChallan(c)} title="Download PDF"
                          className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                          <Download size={13} />
                        </button>
                        <button onClick={() => openEdit(c)} title="Edit"
                          className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setConfirmId(c.id)} title="Delete"
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {filtered.length > 0 && (
          <Pagination
            total={filtered.length}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={setPage}
            onRowsPerPageChange={setRowsPerPage}
          />
        )}
      </div>

      {/* Delete confirm */}
      {confirmId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setConfirmId(null)}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Delete challan?</h3>
            <p className="text-xs text-slate-500 mb-4">This challan will be permanently deleted. The bilties themselves are not affected.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmId(null)} className="btn btn-outline" disabled={deleting}>Cancel</button>
              <button onClick={() => handleDelete(confirmId)} disabled={deleting} className="btn bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-wait">{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-5 right-5 px-4 py-2.5 rounded-lg text-white text-xs font-semibold shadow-2xl toast-anim flex items-center gap-2 z-[9999] ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
        }`}>
          {toast.type === 'error' ? <ShieldAlert size={16} /> : <CheckCircle2 size={16} />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Hidden A5-portrait challan for PDF, rendered via a portal into <body> so
          print CSS can pin #printableChallan to the page top-left (same technique
          as the statement). Fully separate from bilty/statement print paths. */}
      {printData && createPortal(
        <div aria-hidden="true" style={{ height: 0, overflow: 'hidden' }}>
          <ChallanDocument challan={printData} />
        </div>,
        document.body
      )}

      {/* Right-side preview/print drawer (like the bilty invoice drawer). Its own
          live <ChallanDocument id="printableChallan"> is what print/download
          captures — so the hidden portal above is only used for direct Download
          from the list. */}
      {previewChallan && (
        <ChallanInvoiceModal challan={previewChallan} onClose={() => setPreviewChallan(null)} />
      )}
    </div>
  )
}
