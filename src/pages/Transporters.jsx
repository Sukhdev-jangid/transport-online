import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Truck, Pencil, Trash2, X, RefreshCw, Wallet } from 'lucide-react'
import { getTransporters, addTransporter, updateTransporter, deleteTransporter } from '../db/database'
import { isValidPhone } from '../utils/validation'
import { useRole } from '../context/RoleContext'
import Pagination from '../components/Pagination'
import PhoneInput from '../components/PhoneInput'

const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')
const EMPTY = { name: '', phone: '', city: '', address: '', gstin: '', openingBalance: '', openingType: 'none' }

const OPENING_TYPES = [
  { key: 'none',        label: 'No opening balance' },
  { key: 'payable',     label: 'We owe them (payable)' },
  { key: 'receivable',  label: 'They owe us (receivable)' },
]

// Transporter master: the other transport companies we cross goods to/from.
// Separate from vendors (whom we pay for fuel/tyres) and customers.
export default function Transporters() {
  const navigate = useNavigate()
  const { canDelete } = useRole()
  const [transporters, setTransporters] = useState([])
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = async () => setTransporters(await getTransporters())
  useEffect(() => { load() }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }
  const resetForm = () => { setForm(EMPTY); setEditId(null) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return
    if (!form.name.trim()) { showToast('Transporter name is required!', 'error'); return }
    if (!isValidPhone(form.phone)) { showToast('Phone must be exactly 10 digits!', 'error'); return }
    setSaving(true)
    try {
      if (editId) { setTransporters(await updateTransporter(editId, form)); showToast('✓ Transporter updated!') }
      else { setTransporters(await addTransporter(form)); showToast('✓ Transporter saved!') }
      resetForm()
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setSaving(false) }
  }

  const startEdit = (t) => {
    setEditId(t.id)
    setForm({
      name: t.name || '', phone: t.phone || '', city: t.city || '', address: t.address || '', gstin: t.gstin || '',
      openingBalance: t.opening_balance ? String(t.opening_balance) : '', openingType: t.opening_type || 'none',
    })
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const doDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      setTransporters(await deleteTransporter(confirmDel.id))
      showToast('✓ Transporter deleted')
      if (editId === confirmDel.id) resetForm()
      setConfirmDel(null)
    } catch (err) {
      showToast('Cannot delete — this transporter has crossings or payments. Remove those first.', 'error')
      setConfirmDel(null)
    } finally { setDeleting(false) }
  }

  const filtered = transporters.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.city?.toLowerCase().includes(search.toLowerCase()) ||
    t.phone?.includes(search)
  )
  useEffect(() => { setPage(0) }, [search, rowsPerPage])
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Transporters</h1>
        <p className="text-xs text-slate-500 mt-0.5">Other transport companies you cross goods to or from. Open one to see its account.</p>
      </div>

      {/* Add / Edit Form */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">
            {editId ? <><Pencil size={15} /> Edit Transporter</> : <><Plus size={15} /> Add Transporter</>}
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
              <label className="form-label">Transporter Name *</label>
              <input className="form-input" type="text" placeholder="e.g. Sharma Roadlines" required
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <PhoneInput value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
            </div>
            <div>
              <label className="form-label">City</label>
              <input className="form-input" type="text" placeholder="e.g. Ahmedabad"
                value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">GSTIN</label>
              <input className="form-input" type="text" placeholder="e.g. 24AAAAA0000A1Z5"
                value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="form-label">Address</label>
              <input className="form-input" type="text" placeholder="Full address"
                value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Opening Balance</label>
              <input className="form-input" type="number" min="0" step="0.01" placeholder="0"
                value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="form-label">Opening Balance Type</label>
              <select className="form-input" value={form.openingType}
                onChange={e => setForm(f => ({ ...f, openingType: e.target.value }))}>
                {OPENING_TYPES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mb-3">
            Opening balance is the old pending from before you started using the software. Leave it at "No opening balance" to start fresh.
          </p>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary disabled:opacity-60 disabled:cursor-wait" disabled={saving}>
              {saving ? 'Saving…' : (editId ? 'Update Transporter' : 'Save Transporter')}
            </button>
            <button type="button" className="btn btn-outline" onClick={resetForm} disabled={saving}>Reset</button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Truck size={15} /> All Transporters</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{filtered.length} transporters</span>
            <button onClick={load} title="Refresh" className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="form-input pl-8 w-60 py-2" placeholder="Search name, city, phone..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Truck size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No transporters yet. Add one above.</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['#', 'Name', 'Phone', 'City', 'GSTIN', 'Opening', 'Actions'].map(h => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((t, i) => (
                  <tr key={t.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors cursor-pointer"
                    onClick={() => navigate(`/transporter-accounts/${t.id}`)}>
                    <td className="px-3.5 py-2.5 text-slate-400">{page * rowsPerPage + i + 1}</td>
                    <td className="px-3.5 py-2.5 font-semibold text-blue-600">{t.name}</td>
                    <td className="px-3.5 py-2.5 text-slate-600">{t.phone || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-600">{t.city || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-500 font-mono text-[11px]">{t.gstin || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-500">
                      {t.opening_type && t.opening_type !== 'none' && Number(t.opening_balance) > 0
                        ? <span className={t.opening_type === 'payable' ? 'text-red-600' : 'text-emerald-600'}>
                            {rupee(t.opening_balance)} {t.opening_type === 'payable' ? 'Dr' : 'Cr'}
                          </span>
                        : '—'}
                    </td>
                    <td className="px-3.5 py-2.5" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button onClick={() => navigate(`/transporter-accounts/${t.id}`)} title="View account"
                          className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
                          <Wallet size={13} />
                        </button>
                        <button onClick={() => startEdit(t)} title="Edit"
                          className="p-1.5 rounded border border-slate-200 text-blue-600 hover:bg-blue-50 transition">
                          <Pencil size={13} />
                        </button>
                        {canDelete && (
                          <button onClick={() => setConfirmDel(t)} title="Delete"
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
            <h3 className="text-sm font-bold text-slate-900">Delete transporter?</h3>
            <p className="text-xs text-slate-500">
              "<span className="font-semibold text-slate-700">{confirmDel.name}</span>" will be permanently deleted. This cannot be undone, and it only works if the transporter has no crossings or payments.
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
