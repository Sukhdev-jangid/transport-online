import React, { useState, useEffect } from 'react'
import { Plus, Tag, Pencil, Trash2, X, RefreshCw, Search } from 'lucide-react'
import { getItemsMaster, addItemMaster, updateItemMaster, deleteItemMaster, reloadDatabase } from '../db/database'
import Pagination from '../components/Pagination'
import Select from '../components/Select'
import { playSound } from '../utils/sound'

const EMPTY = { itemName: '', defaultRate: '', rateType: 'unit', category: 'General' }

export default function ItemRates() {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)

  const [refreshing, setRefreshing] = useState(false)
  const loadItems = () => setItems(getItemsMaster())
  useEffect(() => { loadItems() }, [])

  // Hard refresh: re-read transport.db from disk, then reload this page's data
  // from it — no window reload, so the app never logs out.
  const hardRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try { await reloadDatabase(); loadItems() }
    finally { setRefreshing(false) }
  }

  const filtered = items.filter(item => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      (item.item_name || '').toLowerCase().includes(q) ||
      (item.category || '').toLowerCase().includes(q) ||
      (item.rate_type === 'unit' ? 'per unit piece' : 'per kg').toLowerCase().includes(q) ||
      String(item.default_rate ?? '').includes(q)
    )
  })

  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
  useEffect(() => { setPage(0) }, [search, rowsPerPage])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const resetForm = () => { setForm(EMPTY); setEditId(null) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        itemName: form.itemName,
        defaultRate: Number(form.defaultRate) || 0,
        rateType: form.rateType,
        category: form.category,
      }
      // await: these persist to disk and throw on failure, so the success
      // message only shows after the item is actually saved to the database.
      if (editId) {
        setItems(await updateItemMaster(editId, payload))
        showToast(`✓ Item '${form.itemName}' updated — saved to database!`)
      } else {
        setItems(await addItemMaster(payload))
        showToast(`✓ Item '${form.itemName}' added with rate ₹${form.defaultRate} — saved to database!`)
      }
      playSound(true)
      resetForm()
    } catch (err) {
      playSound(false)
      showToast('✗ ITEM NOT SAVED! Disk error: ' + err.message + ' — try again.', 'error')
    }
  }

  const startEdit = (item) => {
    setEditId(item.id)
    setForm({
      itemName: item.item_name || '',
      defaultRate: String(item.default_rate ?? ''),
      rateType: item.rate_type || 'unit',
      category: item.category || 'General',
    })
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const doDelete = async () => {
    try {
      setItems(await deleteItemMaster(confirmDel.id))
      showToast('✓ Item deleted')
      if (editId === confirmDel.id) resetForm()
    } catch (err) {
      playSound(false)
      showToast('✗ NOT DELETED — disk error: ' + err.message, 'error')
    }
    setConfirmDel(null)
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Item Rate Master</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure default item rates. Prices will auto-fill during LR booking.
        </p>
      </div>

      {/* Add / Edit Form */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">
            {editId ? <><Pencil size={15} /> Edit Item Rate</> : <><Plus size={15} /> Add New Item Rate</>}
          </span>
          {editId && (
            <button onClick={resetForm} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
              <X size={12} /> Cancel edit
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} className="p-5">
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="form-label">Item Name *</label>
              <input className="form-input" type="text" placeholder="e.g. Gas Tank, Kirana Box" required
                value={form.itemName} onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Default Rate (₹) *</label>
              <input className="form-input" type="number" placeholder="e.g. 1500" required min="0"
                value={form.defaultRate} onChange={e => setForm(f => ({ ...f, defaultRate: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Rate Type</label>
              <Select
                value={form.rateType}
                onChange={v => setForm(f => ({ ...f, rateType: v }))}
                options={[
                  { value: 'unit', label: 'Per Unit / Piece' },
                  { value: 'kg', label: 'Per KG' },
                ]}
              />
            </div>
            <div>
              <label className="form-label">Category</label>
              <input className="form-input" type="text" placeholder="e.g. Industrial, General"
                value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">{editId ? 'Update Item Rate' : 'Save Item Rate'}</button>
            <button type="button" className="btn btn-outline" onClick={resetForm}>Reset</button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Tag size={15} /> Item Rates Directory</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              {filtered.length === items.length
                ? `${items.length} items configured`
                : `${filtered.length} of ${items.length} items`}
            </span>
            <button onClick={hardRefresh} disabled={refreshing} title="Hard Refresh — reload from database file"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-wait">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Toolbar: search */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="form-input pl-8 pr-8 w-80 py-2"
              placeholder="Search items, category, rate..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {search && (
            <span className="text-xs text-slate-500">
              Found {filtered.length} matching {filtered.length === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Tag size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {search ? `No items found matching "${search}".` : 'No item rates configured yet.'}
              </p>
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="mt-2 text-xs text-blue-600 hover:underline font-semibold"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">#</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Item Name</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Category</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Rate Type</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Default Rate</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((item, idx) => (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3 text-slate-400">{page * rowsPerPage + idx + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{item.item_name}</td>
                    <td className="px-4 py-3 text-slate-500">{item.category || 'General'}</td>
                    <td className="px-4 py-3">
                      <span className="badge badge-gray">{item.rate_type === 'unit' ? 'Per Unit' : 'Per KG'}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700 text-sm">
                      ₹{Number(item.default_rate).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(item)} title="Edit"
                          className="p-1.5 rounded border border-slate-200 text-blue-600 hover:bg-blue-50 transition">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setConfirmDel(item)} title="Delete"
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
            <h3 className="text-sm font-bold text-slate-900">Delete item rate?</h3>
            <p className="text-xs text-slate-500">
              "<span className="font-semibold text-slate-700">{confirmDel.item_name}</span>" will be permanently deleted. This cannot be undone.
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
          ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
