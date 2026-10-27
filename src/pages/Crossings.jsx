import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Search, ArrowLeftRight, Pencil, Trash2, X, RefreshCw, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import {
  getCrossings, addCrossing, updateCrossing, deleteCrossing,
  getTransporters, peekNextCrossingNumber, getChallans,
} from '../db/database'
import {
  OUTWARD, INWARD, DIRECTIONS, FREIGHT_BASIS, CHARGE_FIELDS,
  crossingNet, validateCrossing, dirLabel,
} from '../utils/crossing'
import { useRole } from '../context/RoleContext'
import DateFilter from '../components/DateFilter'
import Pagination from '../components/Pagination'
import PhoneInput from '../components/PhoneInput'
import { fmtDate } from '../utils/date'

const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')
const todayISO = () => new Date().toISOString().slice(0, 10)

const EMPTY = {
  direction: OUTWARD, crossingDate: todayISO(), grNo: '', grDate: '', challanNo: '', challanId: '',
  transporterId: '', consignor: '', consignee: '', fromStation: '', toStation: '', viaStation: '',
  pvtMarka: '', packages: '', weight: '', goods: '',
  freightBasis: 'topay', lorryNo: '', driverName: '', driverPhone: '',
  crossingFreight: '', hamali: '', labour: '', commission: '', mamul: '', biltyCharge: '', otherCharges: '', otherNote: '',
  kata: '', remarks: '',
}

const DIR_TABS = [{ key: 'all', label: 'All' }, { key: OUTWARD, label: 'Outward' }, { key: INWARD, label: 'Inward' }]

// Crossing Entry: book a crossing (outward = we pay another transporter, inward
// = they pay us) and see every crossing. One form, a direction toggle flips the
// labels and which side of the transporter ledger it hits.
export default function Crossings() {
  const { canDelete } = useRole()
  const [crossings, setCrossings] = useState([])
  const [transporters, setTransporters] = useState([])
  const [challans, setChallans] = useState([])
  const [nextNo, setNextNo] = useState({ [OUTWARD]: '', [INWARD]: '' })
  const [search, setSearch] = useState('')
  const [dirFilter, setDirFilter] = useState('all')
  const [dateRange, setDateRange] = useState(null)
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    const [cr, tr, ch] = await Promise.all([getCrossings(), getTransporters(), getChallans()])
    setCrossings(cr)
    setTransporters(tr)
    setChallans(ch)
  }
  useEffect(() => { load() }, [])

  // Preview the next OUT-/IN- number for the active direction.
  useEffect(() => {
    let active = true
    if (!showForm || editId) return
    peekNextCrossingNumber(form.direction)
      .then(no => { if (active) setNextNo(s => ({ ...s, [form.direction]: no })) })
      .catch(() => {})
    return () => { active = false }
  }, [showForm, editId, form.direction])

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }
  const openNew = () => { setForm(EMPTY); setEditId(null); setShowForm(true) }
  const closeForm = () => { setForm(EMPTY); setEditId(null); setShowForm(false) }

  const net = useMemo(() => crossingNet(form), [form])

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))
  // Money inputs: allow empty while typing, else clamp to a non-negative number.
  const setMoney = (k, v) => setForm(f => ({ ...f, [k]: v === '' ? '' : Math.max(0, Number(v) || 0) }))
  const setCount = (k, v) => setForm(f => ({ ...f, [k]: v === '' ? '' : Math.max(0, Math.floor(Number(v) || 0)) }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return
    const errors = validateCrossing(form)
    if (errors.length) { showToast(errors[0], 'error'); return }
    setSaving(true)
    try {
      if (editId) { setCrossings(await updateCrossing(editId, form)); showToast('✓ Crossing updated!') }
      else { setCrossings(await addCrossing(form)); showToast('✓ Crossing saved!') }
      closeForm()
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setSaving(false) }
  }

  const startEdit = (c) => {
    setEditId(c.id)
    setForm({
      direction: c.direction === INWARD ? INWARD : OUTWARD,
      crossingDate: c.crossing_date || todayISO(), grNo: c.gr_no || '', grDate: c.gr_date || '', challanNo: c.challan_no || '',
      challanId: c.challan_id ? String(c.challan_id) : '',
      transporterId: c.transporter_id ? String(c.transporter_id) : '',
      consignor: c.consignor || '', consignee: c.consignee || '',
      fromStation: c.from_station || '', toStation: c.to_station || '', viaStation: c.via_station || '',
      pvtMarka: c.pvt_marka || '', packages: c.packages ?? '', weight: c.weight ?? '', goods: c.goods || '',
      freightBasis: c.freight_basis || 'topay', lorryNo: c.lorry_no || '', driverName: c.driver_name || '', driverPhone: c.driver_phone || '',
      crossingFreight: c.crossing_freight ?? '', hamali: c.hamali ?? '', labour: c.labour ?? '', commission: c.commission ?? '',
      mamul: c.mamul ?? '', biltyCharge: c.bilty_charge ?? '', otherCharges: c.other_charges ?? '', otherNote: c.other_note || '',
      kata: c.kata ?? '', remarks: c.remarks || '',
    })
    setShowForm(true)
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const doDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      setCrossings(await deleteCrossing(confirmDel.id))
      showToast('✓ Crossing deleted')
      if (editId === confirmDel.id) closeForm()
      setConfirmDel(null)
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setDeleting(false) }
  }

  const filtered = useMemo(() => crossings.filter(c => {
    const matchesDir = dirFilter === 'all' || c.direction === dirFilter
    const matchesDate = !dateRange || (c.crossing_date >= dateRange.from && c.crossing_date <= dateRange.to)
    const q = search.toLowerCase()
    const matchesSearch = !q ||
      c.crossing_no?.toLowerCase().includes(q) ||
      c.gr_no?.toLowerCase().includes(q) ||
      c.pvt_marka?.toLowerCase().includes(q) ||
      c.transporters?.name?.toLowerCase().includes(q) ||
      c.from_station?.toLowerCase().includes(q) ||
      c.to_station?.toLowerCase().includes(q)
    return matchesDir && matchesDate && matchesSearch
  }), [crossings, dirFilter, dateRange, search])

  useEffect(() => { setPage(0) }, [search, dirFilter, dateRange, rowsPerPage])
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  const isOut = form.direction === OUTWARD

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Crossings</h1>
          <p className="text-xs text-slate-500 mt-0.5">Goods handed to or received from another transporter. Outward = you pay, Inward = you receive.</p>
        </div>
        {!showForm && (
          <button onClick={openNew} className="btn btn-primary flex items-center gap-1.5"><Plus size={15} /> New Crossing</button>
        )}
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="card mb-4">
          <div className="card-header">
            <span className="card-title">
              {editId ? <><Pencil size={15} /> Edit Crossing</> : <><Plus size={15} /> New Crossing</>}
              {!editId && nextNo[form.direction] && <span className="ml-2 badge badge-blue">{nextNo[form.direction]}</span>}
            </span>
            <button onClick={closeForm} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
              <X size={12} /> Close
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-5">
            {/* Direction toggle */}
            <div className="flex gap-2">
              {DIRECTIONS.map(d => (
                <button key={d.key} type="button" onClick={() => setField('direction', d.key)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors
                    ${form.direction === d.key
                      ? (d.key === OUTWARD ? 'bg-red-50 border-red-300 text-red-700' : 'bg-emerald-50 border-emerald-300 text-emerald-700')
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                  {d.key === OUTWARD ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />} {d.label}
                </button>
              ))}
            </div>

            {/* Header fields */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="form-label">Crossing Date *</label>
                <input className="form-input" type="date" value={form.crossingDate} onChange={e => setField('crossingDate', e.target.value)} />
              </div>
              <div>
                <label className="form-label">{isOut ? 'Transporter (we pay) *' : 'Transporter (we receive from) *'}</label>
                <select className="form-input" value={form.transporterId} onChange={e => setField('transporterId', e.target.value)}>
                  <option value="">Select transporter…</option>
                  {transporters.map(t => <option key={t.id} value={t.id}>{t.name}{t.city ? ` — ${t.city}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">GR / Bilty No.</label>
                <input className="form-input" type="text" value={form.grNo} onChange={e => setField('grNo', e.target.value)} />
              </div>
              <div>
                <label className="form-label">GR Date</label>
                <input className="form-input" type="date" value={form.grDate} onChange={e => setField('grDate', e.target.value)} />
              </div>
            </div>

            {/* Consignment */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="form-label">From Station *</label>
                <input className="form-input" type="text" value={form.fromStation} onChange={e => setField('fromStation', e.target.value)} />
              </div>
              <div>
                <label className="form-label">To Station *</label>
                <input className="form-input" type="text" value={form.toStation} onChange={e => setField('toStation', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Via / Crossing Point</label>
                <input className="form-input" type="text" value={form.viaStation} onChange={e => setField('viaStation', e.target.value)} />
              </div>
              <div>
                <label className="form-label">PVT Marka</label>
                <input className="form-input" type="text" placeholder="Private marking" value={form.pvtMarka} onChange={e => setField('pvtMarka', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Consignor</label>
                <input className="form-input" type="text" value={form.consignor} onChange={e => setField('consignor', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Consignee</label>
                <input className="form-input" type="text" value={form.consignee} onChange={e => setField('consignee', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Packages</label>
                <input className="form-input" type="number" min="0" step="1" value={form.packages} onChange={e => setCount('packages', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Weight (kg)</label>
                <input className="form-input" type="number" min="0" step="0.01" value={form.weight} onChange={e => setMoney('weight', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="form-label">Goods Description</label>
                <input className="form-input" type="text" value={form.goods} onChange={e => setField('goods', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Challan No.</label>
                <input className="form-input" type="text" value={form.challanNo} onChange={e => setField('challanNo', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Freight Basis</label>
                <select className="form-input" value={form.freightBasis} onChange={e => setField('freightBasis', e.target.value)}>
                  {FREIGHT_BASIS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
              </div>
            </div>

            {/* Goods vehicle: own gaadi (link a challan) vs the other transporter's */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Goods vehicle</div>
              <div className="flex gap-2 mb-3">
                <button type="button" onClick={() => setField('challanId', '')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors
                    ${!form.challanId ? 'bg-slate-800 border-slate-800 text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                  Other transporter's vehicle
                </button>
                <button type="button" onClick={() => setField('challanId', form.challanId || '__pick')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors
                    ${form.challanId ? 'bg-slate-800 border-slate-800 text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                  Our own gaadi (link challan)
                </button>
              </div>
              {form.challanId ? (
                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-2">
                    <label className="form-label">Challan (our trip) *</label>
                    <select className="form-input" value={form.challanId === '__pick' ? '' : form.challanId}
                      onChange={e => setField('challanId', e.target.value)}>
                      <option value="">Select a challan…</option>
                      {challans.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.challan_number} — {c.vehicle_number || 'no vehicle'}{c.to_centre ? ` → ${c.to_centre}` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">Pick the challan this crossed goods travels on. It will show on that challan's print.</p>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Lorry */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="form-label">Lorry No.</label>
                <input className="form-input" type="text" value={form.lorryNo} onChange={e => setField('lorryNo', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Driver Name</label>
                <input className="form-input" type="text" value={form.driverName} onChange={e => setField('driverName', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Driver Phone</label>
                <PhoneInput value={form.driverPhone} onChange={v => setField('driverPhone', v)} />
              </div>
            </div>

            {/* Money lines */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Charges</div>
              <div className="grid grid-cols-4 gap-4">
                {CHARGE_FIELDS.map(cf => (
                  <div key={cf.key}>
                    <label className="form-label" title={cf.hint}>{cf.label}{cf.key === 'crossingFreight' ? ' *' : ''}</label>
                    <input className="form-input" type="number" min="0" step="0.01"
                      value={form[cf.key]} onChange={e => setMoney(cf.key, e.target.value)} />
                  </div>
                ))}
                <div>
                  <label className="form-label text-red-600" title="Deduction / cut from the net">Kata (deduction)</label>
                  <input className="form-input" type="number" min="0" step="0.01"
                    value={form.kata} onChange={e => setMoney('kata', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 mt-4">
                <div className="col-span-2">
                  <label className="form-label">Other Charge Note</label>
                  <input className="form-input" type="text" value={form.otherNote} onChange={e => setField('otherNote', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="form-label">Remarks</label>
                  <input className="form-input" type="text" value={form.remarks} onChange={e => setField('remarks', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Net preview */}
            <div className={`flex items-center justify-between rounded-lg px-4 py-3 ${isOut ? 'bg-red-50' : 'bg-emerald-50'}`}>
              <span className={`text-sm font-semibold ${isOut ? 'text-red-700' : 'text-emerald-700'}`}>
                Net {isOut ? 'payable (we pay)' : 'receivable (we receive)'}
              </span>
              <span className={`text-xl font-bold tabular-nums ${isOut ? 'text-red-700' : 'text-emerald-700'}`}>{rupee(net)}</span>
            </div>

            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary disabled:opacity-60 disabled:cursor-wait" disabled={saving}>
                {saving ? 'Saving…' : (editId ? 'Update Crossing' : 'Save Crossing')}
              </button>
              <button type="button" className="btn btn-outline" onClick={closeForm} disabled={saving}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      <div className="card">
        <div className="card-header flex-wrap gap-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="card-title"><ArrowLeftRight size={15} /> Crossings ({filtered.length})</span>
            <DateFilter value={dateRange} onChange={setDateRange} />
            <div className="flex items-center gap-1">
              {DIR_TABS.map(tab => (
                <button key={tab.key} onClick={() => setDirFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
                    ${dirFilter === tab.key ? 'bg-primary-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={load} title="Refresh" className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="form-input pl-8 w-72 py-2" placeholder="Search crossing no, GR, marka, transporter, station..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ArrowLeftRight size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No crossings found.</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['No', 'Date', 'Dir', 'Transporter', 'GR No', 'Route', 'Marka', 'Pkgs', 'Net', 'Actions'].map(h => (
                    <th key={h} className={`px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 ${h === 'Net' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map(c => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3.5 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{c.crossing_no}</td>
                    <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(c.crossing_date)}</td>
                    <td className="px-3.5 py-2.5">
                      <span className={`badge ${c.direction === OUTWARD ? 'badge-red' : 'badge-green'}`}>{dirLabel(c.direction)}</span>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-700 font-medium">
                      {c.transporters?.name || '—'}
                      {c.challan_id && <span className="ml-1.5 badge badge-blue text-[9px]" title="Travels on our own challan">Our gaadi</span>}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600">{c.gr_no || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{c.from_station} → {c.to_station}</td>
                    <td className="px-3.5 py-2.5 text-slate-500 max-w-[120px] truncate">{c.pvt_marka || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-600">{c.packages || '—'}</td>
                    <td className={`px-3.5 py-2.5 text-right font-bold tabular-nums whitespace-nowrap ${c.direction === OUTWARD ? 'text-red-600' : 'text-emerald-600'}`}>
                      {rupee(c.net_amount)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(c)} title="Edit"
                          className="p-1.5 rounded border border-slate-200 text-blue-600 hover:bg-blue-50 transition">
                          <Pencil size={13} />
                        </button>
                        {canDelete && (
                          <button onClick={() => setConfirmDel(c)} title="Delete"
                            className="p-1.5 rounded border border-slate-200 text-red-500 hover:bg-red-50 transition">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {filtered.length > 0 && (
          <Pagination total={filtered.length} page={page} rowsPerPage={rowsPerPage}
            onPageChange={setPage} onRowsPerPageChange={setRowsPerPage} />
        )}
      </div>

      {confirmDel && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-5 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">Delete crossing?</h3>
            <p className="text-xs text-slate-500">
              Crossing "<span className="font-semibold text-slate-700">{confirmDel.crossing_no}</span>" and its payments will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDel(null)} className="btn btn-outline py-1 px-3" disabled={deleting}>Cancel</button>
              <button onClick={doDelete} disabled={deleting} className="btn py-1 px-3 bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-wait">{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-5 left-5 px-4 py-2.5 rounded-lg text-white text-xs font-semibold shadow-lg toast-anim
          ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{toast.msg}</div>
      )}
    </div>
  )
}
