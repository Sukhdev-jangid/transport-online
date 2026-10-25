import React, { useState, useEffect } from 'react'
import { Plus, Truck, Pencil, Trash2, X, Search, RefreshCw } from 'lucide-react'
import { getVehicles, addVehicle, updateVehicle, deleteVehicle } from '../db/database'
import Pagination from '../components/Pagination'
import Select from '../components/Select'

const VEHICLE_TYPES = ['Truck', 'Mini Truck', 'Tempo', 'Container', 'Trailer']
// Ownership: whether the vehicle is our own, hired on rent, or previously
// owned and now sold.
const OWNERSHIP = ['Owned', 'On Rent', 'Sold']
const emptyForm = { vehicleNumber: '', vehicleType: 'Truck', model: '', capacity: '', ownership: 'Owned' }

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([])
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  // When true, the type is a custom value typed by the user (the "Other" option).
  const [typeIsOther, setTypeIsOther] = useState(false)
  // Same idea for ownership: allow a custom value beyond the presets.
  const [ownershipIsOther, setOwnershipIsOther] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [saving, setSaving] = useState(false)     // blocks double-submit while a save is in flight
  const [deleting, setDeleting] = useState(false)  // blocks double-click on delete

  const loadVehicles = async () => setVehicles(await getVehicles())
  useEffect(() => { loadVehicles() }, [])

  const filtered = vehicles.filter(v =>
    [v.vehicle_number, v.vehicle_type, v.model, v.capacity, v.ownership]
      .some(x => x?.toLowerCase().includes(search.toLowerCase()))
  )
  useEffect(() => { setPage(0) }, [search, rowsPerPage])
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  const resetForm = () => { setForm(emptyForm); setEditId(null); setTypeIsOther(false); setOwnershipIsOther(false) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return                       // ignore repeat clicks while saving
    if (!form.vehicleNumber.trim()) { showToast('Vehicle number is required!', 'error'); return }
    if (!form.vehicleType.trim()) { showToast('Please type the vehicle type!', 'error'); return }
    setSaving(true)
    try {
      if (editId) {
        setVehicles(await updateVehicle(editId, form))
        showToast('✓ Vehicle updated!')
      } else {
        setVehicles(await addVehicle(form))
        showToast('✓ Vehicle saved successfully!')
      }
      resetForm()
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setSaving(false) }
  }

  const handleEdit = (v) => {
    setEditId(v.id)
    const vType = v.vehicle_type || 'Truck'
    // A saved type that isn't a preset is a custom ("Other") value.
    setTypeIsOther(!VEHICLE_TYPES.includes(vType))
    const vOwn = v.ownership || 'Owned'
    setOwnershipIsOther(!OWNERSHIP.includes(vOwn))
    setForm({
      vehicleNumber: v.vehicle_number || '',
      vehicleType: vType,
      model: v.model || '',
      capacity: v.capacity || '',
      ownership: vOwn,
    })
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (id) => {
    if (deleting) return
    setDeleting(true)
    try {
      setVehicles(await deleteVehicle(id))
      showToast('✓ Vehicle deleted!')
      if (editId === id) resetForm()
      setConfirmId(null)
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setDeleting(false) }
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">All Vehicle List</h1>
        <p className="text-xs text-slate-500 mt-0.5">Vehicle details only. Assign drivers from Driver Assignments.</p>
      </div>

      {/* Form */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title"><Plus size={15} /> {editId ? 'Edit Vehicle' : 'Add New Vehicle'}</span>
          {editId && (
            <button onClick={resetForm} className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1">
              <X size={13} /> Cancel edit
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} className="p-5">
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="form-label">Vehicle Number *</label>
              <input className="form-input" type="text" placeholder="e.g. RJ-19-GA-1234" required
                value={form.vehicleNumber} onChange={e => setForm(f => ({ ...f, vehicleNumber: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Vehicle Type</label>
              <Select
                value={typeIsOther ? 'Other' : form.vehicleType}
                onChange={v => {
                  if (v === 'Other') {
                    setTypeIsOther(true)
                    setForm(f => ({ ...f, vehicleType: '' }))
                  } else {
                    setTypeIsOther(false)
                    setForm(f => ({ ...f, vehicleType: v }))
                  }
                }}
                options={[
                  ...VEHICLE_TYPES.map(t => ({ value: t, label: t })),
                  { value: 'Other', label: 'Other (type your own)' },
                ]}
              />
              {typeIsOther && (
                <input className="form-input mt-2" type="text" placeholder="Type custom vehicle type" autoFocus
                  value={form.vehicleType} onChange={e => setForm(f => ({ ...f, vehicleType: e.target.value }))} />
              )}
            </div>
            <div>
              <label className="form-label">Model</label>
              <input className="form-input" type="text" placeholder="e.g. Tata 1109"
                value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Capacity</label>
              <input className="form-input" type="text" placeholder="e.g. 9 Ton"
                value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Ownership</label>
              <Select
                value={ownershipIsOther ? 'Other' : form.ownership}
                onChange={v => {
                  if (v === 'Other') {
                    setOwnershipIsOther(true)
                    setForm(f => ({ ...f, ownership: '' }))
                  } else {
                    setOwnershipIsOther(false)
                    setForm(f => ({ ...f, ownership: v }))
                  }
                }}
                options={[
                  ...OWNERSHIP.map(o => ({ value: o, label: o })),
                  { value: 'Other', label: 'Other (type your own)' },
                ]}
              />
              {ownershipIsOther && (
                <input className="form-input mt-2" type="text" placeholder="Type custom ownership" autoFocus
                  value={form.ownership} onChange={e => setForm(f => ({ ...f, ownership: e.target.value }))} />
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary disabled:opacity-60 disabled:cursor-wait" disabled={saving}>{saving ? 'Saving…' : (editId ? 'Update Vehicle' : 'Save Vehicle')}</button>
            <button type="button" className="btn btn-outline" onClick={resetForm} disabled={saving}>Reset</button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Truck size={15} /> All Vehicles</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{filtered.length} vehicles</span>
            <button onClick={loadVehicles} title="Refresh"
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Toolbar: search */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="form-input pl-8 w-60 py-2" placeholder="Search number, type, model..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Truck size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No vehicles added yet.</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['#', 'Vehicle Number', 'Type', 'Model', 'Capacity', 'Ownership', 'Actions'].map(h => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((v, i) => (
                  <tr key={v.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3.5 py-2.5 text-slate-400">{page * rowsPerPage + i + 1}</td>
                    <td className="px-3.5 py-2.5 font-semibold text-blue-600">{v.vehicle_number}</td>
                    <td className="px-3.5 py-2.5"><span className="badge badge-blue">{v.vehicle_type}</span></td>
                    <td className="px-3.5 py-2.5 text-slate-700">{v.model || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-600">{v.capacity || '—'}</td>
                    <td className="px-3.5 py-2.5">
                      <span className={`badge ${v.ownership === 'Owned' ? 'badge-green' : v.ownership === 'On Rent' ? 'badge-yellow' : 'badge-gray'}`}>{v.ownership || 'Owned'}</span>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleEdit(v)} title="Edit"
                          className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setConfirmId(v.id)} title="Delete"
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
            <h3 className="text-sm font-bold text-slate-900 mb-1">Delete vehicle?</h3>
            <p className="text-xs text-slate-500 mb-4">This vehicle will be permanently deleted. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmId(null)} className="btn btn-outline" disabled={deleting}>Cancel</button>
              <button onClick={() => handleDelete(confirmId)} disabled={deleting} className="btn bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-wait">{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-5 left-5 px-4 py-2.5 rounded-lg text-white text-xs font-semibold shadow-lg toast-anim
          ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{toast.msg}
        </div>
      )}
    </div>
  )
}
