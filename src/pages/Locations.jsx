import React, { useState, useEffect } from 'react'
import { Plus, Warehouse, Pencil, Trash2, X, Search, RefreshCw } from 'lucide-react'
import { getLocations, addLocation, updateLocation, deleteLocation } from '../db/database'
import Pagination from '../components/Pagination'
import { fmtDate, ymdKey } from '../utils/date'

const EMPTY = { name: '', state: 'Rajasthan' }

export default function Locations() {
  const [locations, setLocations] = useState([])
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [saving, setSaving] = useState(false)     // blocks double-submit while a save is in flight
  const [deleting, setDeleting] = useState(false)  // blocks double-click on delete

  const loadLocations = async () => setLocations(await getLocations())
  useEffect(() => { loadLocations() }, [])

  const filtered = locations.filter(l =>
    [l.name, l.state].some(x => x?.toLowerCase().includes(search.toLowerCase()))
  )
  useEffect(() => { setPage(0) }, [search, rowsPerPage])
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  const resetForm = () => { setForm(EMPTY); setEditId(null) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return                       // ignore repeat clicks while saving
    if (!form.name.trim()) { showToast('Location name is required!', 'error'); return }
    setSaving(true)
    try {
      if (editId) {
        setLocations(await updateLocation(editId, { name: form.name.trim(), state: form.state.trim() || 'Rajasthan' }))
        showToast('✓ Location updated!')
      } else {
        setLocations(await addLocation(form.name.trim(), form.state.trim() || 'Rajasthan'))
        showToast(`✓ Location '${form.name}' added!`)
      }
      resetForm()
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setSaving(false) }
  }

  const startEdit = (l) => {
    setEditId(l.id)
    setForm({ name: l.name || '', state: l.state || '' })
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const doDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      setLocations(await deleteLocation(confirmDel.id))
      showToast('✓ Location deleted')
      if (editId === confirmDel.id) resetForm()
      setConfirmDel(null)
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setDeleting(false) }
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Locations</h1>
        <p className="text-xs text-slate-500 mt-0.5">Manage transport hubs and warehouse cities.</p>
      </div>

      {/* Add / Edit Form */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">
            {editId ? <><Pencil size={15} /> Edit Location</> : <><Plus size={15} /> Add Location</>}
          </span>
          {editId && (
            <button onClick={resetForm} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
              <X size={12} /> Cancel edit
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} className="p-5">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="form-label">City / Hub Name *</label>
              <input className="form-input" type="text" placeholder="e.g. Sanchore" required
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">State</label>
              <input className="form-input" type="text" placeholder="e.g. Rajasthan"
                value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary disabled:opacity-60 disabled:cursor-wait" disabled={saving}>{saving ? 'Saving…' : (editId ? 'Update Location' : 'Save Location')}</button>
            <button type="button" className="btn btn-outline" onClick={resetForm} disabled={saving}>Reset</button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Warehouse size={15} /> All Locations</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{filtered.length} locations</span>
            <button onClick={loadLocations} title="Refresh"
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Toolbar: search */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="form-input pl-8 w-60 py-2" placeholder="Search city, state..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Warehouse size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No locations added yet.</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['#','City / Hub','State','Added','Actions'].map(h => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((l, i) => (
                  <tr key={l.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3.5 py-2.5 text-slate-400">{page * rowsPerPage + i + 1}</td>
                    <td className="px-3.5 py-2.5 font-semibold text-slate-800">{l.name}</td>
                    <td className="px-3.5 py-2.5 text-slate-600">{l.state || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-400">{fmtDate(ymdKey(l.created_at))}</td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(l)} title="Edit"
                          className="p-1.5 rounded border border-slate-200 text-blue-600 hover:bg-blue-50 transition">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setConfirmDel(l)} title="Delete"
                          className="p-1.5 rounded border border-slate-200 text-red-500 hover:bg-red-50 transition">
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
      {confirmDel && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-5 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">Delete location?</h3>
            <p className="text-xs text-slate-500">
              "<span className="font-semibold text-slate-700">{confirmDel.name}</span>" will be permanently deleted. This cannot be undone.
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
