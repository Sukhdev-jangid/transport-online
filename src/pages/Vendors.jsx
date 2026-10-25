import React, { useState, useEffect } from 'react'
import { Plus, Search, BookUser, Pencil, Trash2, X, Copy, RefreshCw } from 'lucide-react'
import { getVendors, addVendor, updateVendor, deleteVendor } from '../db/database'
import { isValidPhone } from '../utils/validation'
import { copyToClipboard, buildShareText } from '../utils/clipboard'
import PhoneInput from '../components/PhoneInput'
import Pagination from '../components/Pagination'

const EMPTY = { name: '', serviceType: '', phone: '', city: '', address: '', gstin: '' }

export default function Vendors() {
  const [vendors, setVendors] = useState([])
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [saving, setSaving] = useState(false)     // blocks double-submit while a save is in flight
  const [deleting, setDeleting] = useState(false)  // blocks double-click on delete

  const loadVendors = async () => setVendors(await getVendors())
  useEffect(() => { loadVendors() }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  const resetForm = () => { setForm(EMPTY); setEditId(null) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return                       // ignore repeat clicks while saving
    if (!form.name.trim()) { showToast('Vendor name is required!', 'error'); return }
    if (!isValidPhone(form.phone)) { showToast('Phone must be exactly 10 digits!', 'error'); return }
    setSaving(true)
    try {
      if (editId) {
        setVendors(await updateVendor(editId, form))
        showToast('✓ Vendor updated!')
      } else {
        setVendors(await addVendor(form))
        showToast('✓ Vendor saved!')
      }
      resetForm()
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setSaving(false) }
  }

  const startEdit = (v) => {
    setEditId(v.id)
    setForm({ name: v.name || '', serviceType: v.service_type || '', phone: v.phone || '', city: v.city || '', address: v.address || '', gstin: v.gstin || '' })
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const doDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      setVendors(await deleteVendor(confirmDel.id))
      showToast('✓ Vendor deleted')
      if (editId === confirmDel.id) resetForm()
      setConfirmDel(null)
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setDeleting(false) }
  }

  const handleCopy = async (v) => {
    const text = buildShareText('Vendor Details', [
      ['Name', v.name],
      ['Service Type', v.service_type],
      ['Phone', v.phone ? `+91 ${v.phone}` : ''],
      ['City', v.city],
      ['Address', v.address],
      ['GSTIN', v.gstin],
    ])
    const ok = await copyToClipboard(text)
    showToast(ok ? '✓ Vendor details copied!' : 'Could not copy', ok ? 'success' : 'error')
  }

  const filtered = vendors.filter(v =>
    v.name?.toLowerCase().includes(search.toLowerCase()) ||
    v.service_type?.toLowerCase().includes(search.toLowerCase()) ||
    v.city?.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => { setPage(0) }, [search, rowsPerPage])
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Vendor Directory</h1>
        <p className="text-xs text-slate-500 mt-0.5">Suppliers and service providers (fuel, tyres, repairs) you pay for.</p>
      </div>

      {/* Add / Edit Form */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">
            {editId ? <><Pencil size={15} /> Edit Vendor</> : <><Plus size={15} /> Add Vendor</>}
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
              <label className="form-label">Vendor Name *</label>
              <input className="form-input" type="text" placeholder="e.g. Sharma Tyre Works" required
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Service Type</label>
              <input className="form-input" type="text" placeholder="e.g. Tyres, Fuel"
                value={form.serviceType} onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <PhoneInput value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
            </div>
            <div>
              <label className="form-label">City</label>
              <input className="form-input" type="text" placeholder="e.g. Jodhpur"
                value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">GSTIN</label>
              <input className="form-input" type="text" placeholder="e.g. 08AAAAA0000A1Z5"
                value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} />
            </div>
            <div className="col-span-3">
              <label className="form-label">Address</label>
              <input className="form-input" type="text" placeholder="Full address"
                value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary disabled:opacity-60 disabled:cursor-wait" disabled={saving}>{saving ? 'Saving…' : (editId ? 'Update Vendor' : 'Save Vendor')}</button>
            <button type="button" className="btn btn-outline" onClick={resetForm} disabled={saving}>Reset</button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><BookUser size={15} /> All Vendors</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{filtered.length} vendors</span>
            <button onClick={loadVendors} title="Refresh"
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Toolbar: search */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="form-input pl-8 w-60 py-2" placeholder="Search vendor, service, city..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <BookUser size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No vendors found.</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['#','Name','Service','Phone','City','Address','GSTIN','Actions'].map(h => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((v, i) => (
                  <tr key={v.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3.5 py-2.5 text-slate-400">{page * rowsPerPage + i + 1}</td>
                    <td className="px-3.5 py-2.5 font-semibold text-slate-800">{v.name}</td>
                    <td className="px-3.5 py-2.5"><span className="badge badge-gray">{v.service_type || '—'}</span></td>
                    <td className="px-3.5 py-2.5 text-slate-600">{v.phone || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-600">{v.city || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-500">{v.address || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-500 font-mono text-[11px]">{v.gstin || '—'}</td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => handleCopy(v)} title="Copy details to share"
                          className="p-1.5 rounded border border-slate-200 text-green-600 hover:bg-green-50 transition">
                          <Copy size={13} />
                        </button>
                        <button onClick={() => startEdit(v)} title="Edit"
                          className="p-1.5 rounded border border-slate-200 text-blue-600 hover:bg-blue-50 transition">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setConfirmDel(v)} title="Delete"
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
            <h3 className="text-sm font-bold text-slate-900">Delete vendor?</h3>
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
