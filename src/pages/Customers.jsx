import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Users, Pencil, Trash2, X, Copy, RefreshCw, Wallet } from 'lucide-react'
import { getCustomers, addCustomer, updateCustomer, deleteCustomer, reloadDatabase } from '../db/database'
import { isValidPhone } from '../utils/validation'
import { copyToClipboard, buildShareText } from '../utils/clipboard'
import PhoneInput from '../components/PhoneInput'
import Pagination from '../components/Pagination'
import DateFilter from '../components/DateFilter'
import { fmtDate, ymdKey } from '../utils/date'
import { playSound } from '../utils/sound'

const EMPTY = { name:'', phone:'', city:'', address:'' }

export default function Customers() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [dateRange, setDateRange] = useState(null)   // { from, to, label } | null

  const [refreshing, setRefreshing] = useState(false)
  const loadCustomers = async () => setCustomers(await getCustomers())
  useEffect(() => { loadCustomers() }, [])

  // Hard refresh: re-fetch the customer list from Supabase.
  const hardRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try { await reloadDatabase(); await loadCustomers() }
    finally { setRefreshing(false) }
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  const resetForm = () => { setForm(EMPTY); setEditId(null) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isValidPhone(form.phone)) { showToast('Phone must be exactly 10 digits!', 'error'); return }
    try {
      if (editId) {
        setCustomers(await updateCustomer(editId, form))
        showToast('✓ Customer updated — saved to database!')
      } else {
        setCustomers(await addCustomer(form))
        showToast('✓ Customer saved to database!')
      }
      playSound(true)
      resetForm()
    } catch(err) {
      playSound(false)
      showToast('✗ CUSTOMER NOT SAVED! Disk error: ' + err.message + ' — try again.', 'error')
    }
  }

  const startEdit = (c) => {
    setEditId(c.id)
    setForm({ name: c.name || '', phone: c.phone || '', city: c.city || '', address: c.address || '' })
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const doDelete = async () => {
    try {
      setCustomers(await deleteCustomer(confirmDel.id))
      showToast('✓ Customer deleted')
      if (editId === confirmDel.id) resetForm()
    } catch(err) {
      playSound(false)
      showToast('✗ NOT DELETED — disk error: ' + err.message, 'error')
    }
    setConfirmDel(null)
  }

  const handleCopy = async (c) => {
    const text = buildShareText('Customer Details', [
      ['Name', c.name],
      ['Phone', c.phone ? `+91 ${c.phone}` : ''],
      ['City', c.city],
      ['Address', c.address],
    ])
    const ok = await copyToClipboard(text)
    showToast(ok ? '✓ Customer details copied!' : 'Could not copy', ok ? 'success' : 'error')
  }

  const filtered = customers.filter(c => {
    const matchesText =
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.city?.toLowerCase().includes(search.toLowerCase())
    // created_at is a SQLite UTC timestamp ("YYYY-MM-DD HH:MM:SS"); compare on
    // the LOCAL calendar day so the range bounds (local dates) match correctly.
    const day = ymdKey(c.created_at)
    const matchesDate = !dateRange || (day >= dateRange.from && day <= dateRange.to)
    return matchesText && matchesDate
  })

  // Reset to first page whenever the search, page size or date filter changes.
  useEffect(() => { setPage(0) }, [search, rowsPerPage, dateRange])

  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Customers</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage your customers (parties who send/receive goods)</p>
        </div>
      </div>

      {/* Add / Edit Form */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">
            {editId ? <><Pencil size={15} /> Edit Customer</> : <><Plus size={15} /> Add New Customer</>}
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
              <label className="form-label">Name / Company *</label>
              <input className="form-input" type="text" placeholder="Customer name or company" required
                value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
            </div>
            <div>
              <label className="form-label">Phone Number</label>
              <PhoneInput value={form.phone} onChange={v => setForm(f => ({...f, phone: v}))} />
            </div>
            <div>
              <label className="form-label">City</label>
              <input className="form-input" type="text" placeholder="e.g. Jodhpur"
                value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} />
            </div>
            <div className="col-span-3">
              <label className="form-label">Address</label>
              <input className="form-input" type="text" placeholder="Full address"
                value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">{editId ? 'Update Customer' : 'Save Customer'}</button>
            <button type="button" className="btn btn-outline" onClick={resetForm}>Reset</button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Users size={15} /> All Customers</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{filtered.length} customers</span>
            <button onClick={hardRefresh} disabled={refreshing} title="Hard Refresh — reload from database file"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-wait">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Toolbar: search + period filter */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="form-input pl-8 w-80 py-2" placeholder="Search by name, city..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <DateFilter value={dateRange} onChange={setDateRange} />
        </div>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No customers found.</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['#','Name','Phone','City','Address','Joined','Actions'].map(h => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((c, i) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3.5 py-2.5 text-slate-400">{page * rowsPerPage + i + 1}</td>
                    <td className="px-3.5 py-2.5">
                      <button onClick={() => navigate(`/customers/${c.id}`)}
                        className="font-semibold text-slate-800 hover:text-primary-600 hover:underline transition-colors">
                        {c.name}
                      </button>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600">{c.phone || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-600">{c.city || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-500">{c.address || '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-400">{fmtDate(ymdKey(c.created_at))}</td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => navigate(`/customers/${c.id}`)} title="View account / bill history"
                          className="p-1.5 rounded border border-slate-200 text-violet-600 hover:bg-violet-50 transition">
                          <Wallet size={13} />
                        </button>
                        <button onClick={() => handleCopy(c)} title="Copy details to share"
                          className="p-1.5 rounded border border-slate-200 text-green-600 hover:bg-green-50 transition">
                          <Copy size={13} />
                        </button>
                        <button onClick={() => startEdit(c)} title="Edit"
                          className="p-1.5 rounded border border-slate-200 text-blue-600 hover:bg-blue-50 transition">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setConfirmDel(c)} title="Delete"
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
            <h3 className="text-sm font-bold text-slate-900">Delete customer?</h3>
            <p className="text-xs text-slate-500">
              "<span className="font-semibold text-slate-700">{confirmDel.name}</span>" will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDel(null)} className="btn btn-outline py-1 px-3">Cancel</button>
              <button onClick={doDelete} className="btn py-1 px-3 bg-red-600 text-white hover:bg-red-700">Delete</button>
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
