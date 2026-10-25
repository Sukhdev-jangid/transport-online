import React, { useState, useEffect } from 'react'
import { Plus, Users, Pencil, Trash2, X, Copy, Search, RefreshCw } from 'lucide-react'
import { getDrivers, addDriver, updateDriver, deleteDriver, getVehicles } from '../db/database'
import { isValidPhone } from '../utils/validation'
import { copyToClipboard, buildShareText } from '../utils/clipboard'
import PhoneInput from '../components/PhoneInput'
import VehicleAutocomplete from '../components/VehicleAutocomplete'
import Pagination from '../components/Pagination'

const emptyForm = { name: '', phone: '', address: '', vehicleNumber: '' }

export default function AllDrivers() {
  const [drivers, setDrivers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [saving, setSaving] = useState(false)     // blocks double-submit while a save is in flight
  const [deleting, setDeleting] = useState(false)  // blocks double-click on delete

  const loadDrivers = async () => setDrivers(await getDrivers())
  useEffect(() => {
    loadDrivers()
    getVehicles().then(setVehicles)
  }, [])

  const filtered = drivers.filter(d =>
    [d.name, d.phone, d.address].some(x => x?.toLowerCase().includes(search.toLowerCase()))
  )
  useEffect(() => { setPage(0) }, [search, rowsPerPage])
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  const resetForm = () => { setForm(emptyForm); setEditId(null) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return                       // ignore repeat clicks while saving
    if (!form.name.trim()) { showToast('Driver name is required!', 'error'); return }
    if (!isValidPhone(form.phone)) { showToast('Phone must be exactly 10 digits!', 'error'); return }
    setSaving(true)
    try {
      if (editId) {
        setDrivers(await updateDriver(editId, form))
        showToast('✓ Driver updated!')
      } else {
        setDrivers(await addDriver(form))
        showToast('✓ Driver added!')
      }
      resetForm()
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setSaving(false) }
  }

  const handleEdit = (d) => {
    setEditId(d.id)
    setForm({ name: d.name || '', phone: d.phone || '', address: d.address || '', vehicleNumber: d.vehicle_number || '' })
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (id) => {
    if (deleting) return
    setDeleting(true)
    try {
      setDrivers(await deleteDriver(id))
      showToast('✓ Driver deleted!')
      if (editId === id) resetForm()
      setConfirmId(null)
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setDeleting(false) }
  }

  const handleCopy = async (d) => {
    const text = buildShareText('Driver Details', [
      ['Name', d.name],
      ['Phone', d.phone ? `+91 ${d.phone}` : ''],
      ['Vehicle', d.vehicle_number],
      ['Address', d.address],
    ])
    const ok = await copyToClipboard(text)
    showToast(ok ? '✓ Driver details copied!' : 'Could not copy', ok ? 'success' : 'error')
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">All Drivers</h1>
        <p className="text-xs text-slate-500 mt-0.5">Driver details and the vehicle each one is assigned to.</p>
      </div>

      {/* Form */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title"><Plus size={15} /> {editId ? 'Edit Driver' : 'Add New Driver'}</span>
          {editId && (
            <button onClick={resetForm} className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1">
              <X size={13} /> Cancel edit
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} className="p-5">
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="form-label">Driver Name *</label>
              <input className="form-input" type="text" placeholder="Driver's full name" required
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <PhoneInput value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
            </div>
            <div>
              <label className="form-label">Vehicle</label>
              <VehicleAutocomplete
                value={form.vehicleNumber}
                onChange={v => setForm(f => ({ ...f, vehicleNumber: v }))}
                options={[
                  { value: '', label: 'Not assigned' },
                  ...vehicles.map(v => ({ value: v.vehicle_number, label: `${v.vehicle_number}${v.vehicle_type ? ` — ${v.vehicle_type}` : ''}` })),
                ]}
                placeholder={vehicles.length ? 'Type or select vehicle' : 'No vehicles yet'}
              />
            </div>
            <div>
              <label className="form-label">Address</label>
              <input className="form-input" type="text" placeholder="Village / City / Area"
                value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary disabled:opacity-60 disabled:cursor-wait" disabled={saving}>{saving ? 'Saving…' : (editId ? 'Update Driver' : 'Save Driver')}</button>
            <button type="button" className="btn btn-outline" onClick={resetForm} disabled={saving}>Reset</button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Users size={15} /> Driver Directory</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{filtered.length} drivers</span>
            <button onClick={loadDrivers} title="Refresh"
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Toolbar: search */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="form-input pl-8 w-60 py-2" placeholder="Search name, phone, address..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No drivers yet. Add your first driver above.</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['#', 'Driver Name', 'Phone', 'Vehicle', 'Address', 'Actions'].map(h => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((d, i) => (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3.5 py-2.5 text-slate-400">{page * rowsPerPage + i + 1}</td>
                    <td className="px-3.5 py-2.5 font-semibold text-slate-800">{d.name}</td>
                    <td className="px-3.5 py-2.5 text-slate-600">{d.phone ? `+91 ${d.phone}` : '—'}</td>
                    <td className="px-3.5 py-2.5">
                      {d.vehicle_number
                        ? <span className="font-semibold text-blue-600">{d.vehicle_number}</span>
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600">{d.address || '—'}</td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleCopy(d)} title="Copy details to share"
                          className="p-1.5 rounded-md text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                          <Copy size={13} />
                        </button>
                        <button onClick={() => handleEdit(d)} title="Edit"
                          className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setConfirmId(d.id)} title="Delete"
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
            <h3 className="text-sm font-bold text-slate-900 mb-1">Delete driver?</h3>
            <p className="text-xs text-slate-500 mb-4">This driver will be permanently deleted. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmId(null)} className="btn btn-outline" disabled={deleting}>Cancel</button>
              <button onClick={() => handleDelete(confirmId)} disabled={deleting} className="btn bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-wait">{deleting ? 'Deleting…' : 'Delete'}</button>
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
