import React, { useState, useEffect } from 'react'
import { Plus, Building2, Pencil, Trash2, X, RefreshCw } from 'lucide-react'
import { getBranches, addBranch, updateBranch, deleteBranch } from '../db/admin'
import PhoneInput from '../components/PhoneInput'

const EMPTY = { name: '', code: '', phone: '', address: '' }

export default function Branches() {
  const [branches, setBranches] = useState([])
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = async () => setBranches(await getBranches())
  useEffect(() => { load() }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }
  const resetForm = () => { setForm(EMPTY); setEditId(null) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return
    if (!form.name.trim()) { showToast('Branch name is required!', 'error'); return }
    setSaving(true)
    try {
      if (editId) {
        setBranches(await updateBranch(editId, form))
        showToast('✓ Branch updated!')
      } else {
        setBranches(await addBranch(form))
        showToast('✓ Branch created!')
      }
      resetForm()
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setSaving(false) }
  }

  const startEdit = (b) => {
    setEditId(b.id)
    setForm({ name: b.name || '', code: b.code || '', phone: b.phone || '', address: b.address || '' })
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const doDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      setBranches(await deleteBranch(confirmDel.id))
      showToast('✓ Branch deleted')
      if (editId === confirmDel.id) resetForm()
      setConfirmDel(null)
    } catch (err) {
      showToast('Cannot delete: branch still has data or users linked to it.', 'error')
    } finally { setDeleting(false) }
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Branches</h1>
        <p className="text-xs text-slate-500 mt-0.5">Each branch keeps its own LR numbers, settings, and data. One shared account across all branches.</p>
      </div>

      {/* Add / Edit Form */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">
            {editId ? <><Pencil size={15} /> Edit Branch</> : <><Plus size={15} /> Add Branch</>}
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
              <label className="form-label">Branch Name *</label>
              <input className="form-input" type="text" placeholder="e.g. Jodhpur Head Office" required
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Short Code</label>
              <input className="form-input" type="text" placeholder="e.g. JDH"
                value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <PhoneInput value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
            </div>
            <div className="col-span-3">
              <label className="form-label">Address</label>
              <input className="form-input" type="text" placeholder="Full branch address"
                value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary disabled:opacity-60 disabled:cursor-wait" disabled={saving}>{saving ? 'Saving…' : (editId ? 'Update Branch' : 'Create Branch')}</button>
            <button type="button" className="btn btn-outline" onClick={resetForm} disabled={saving}>Reset</button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Building2 size={15} /> All Branches</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{branches.length} branches</span>
            <button onClick={load} title="Refresh"
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {branches.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Building2 size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No branches yet.</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['#','Name','Code','Phone','Address','Status','Actions'].map(h => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {branches.map((b, i) => (
                  <tr key={b.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3.5 py-2.5 text-slate-400">{i + 1}</td>
                    <td className="px-3.5 py-2.5 font-semibold text-slate-800">{b.name}</td>
                    <td className="px-3.5 py-2.5"><span className="badge badge-gray">{b.code || '—'}</span></td>
                    <td className="px-3.5 py-2.5 text-slate-600">{b.phone || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-500">{b.address || '—'}</td>
                    <td className="px-3.5 py-2.5">
                      <span className={`badge ${b.is_active ? 'badge-green' : 'badge-gray'}`}>{b.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(b)} title="Edit"
                          className="p-1.5 rounded border border-slate-200 text-blue-600 hover:bg-blue-50 transition">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setConfirmDel(b)} title="Delete"
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
      </div>

      {/* Delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-5 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">Delete branch?</h3>
            <p className="text-xs text-slate-500">
              "<span className="font-semibold text-slate-700">{confirmDel.name}</span>" will be deleted. This only works if no data or users are still linked to it.
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
