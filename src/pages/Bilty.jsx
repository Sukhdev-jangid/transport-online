import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Printer, Search, FileText, Eye, MessageCircle, Download, RefreshCw, CheckCircle, Pencil, X, Phone, Plus } from 'lucide-react'
import { getLREntries, getShipmentItems, markLRPaid, markLRsPaid, reloadDatabase } from '../db/database'
import BiltyInvoiceModal from '../components/BiltyInvoiceModal'
import ConfirmModal from '../components/ConfirmModal'
import Pagination from '../components/Pagination'
import DateFilter from '../components/DateFilter'
import { fmtDate, fmtTime } from '../utils/date'
import { sendBiltyWhatsApp } from '../utils/whatsapp'
import { downloadBiltyPdf } from '../utils/biltyPdf'
import { billTotal } from '../utils/billing'
import BiltyDocument from '../components/BiltyDocument'

// Payment filter tabs shown as pills above the table.
const PAYMENT_TABS = [
  { key: 'all', label: 'All' },
  { key: 'Paid', label: 'Paid' },
  { key: 'ToPay', label: 'To Pay' },
  { key: 'TBB', label: 'TBB' },
]

export default function Bilty() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState([])
  const [search, setSearch] = useState('')
  const [payFilter, setPayFilter] = useState('all')
  const [dateRange, setDateRange] = useState(null)   // { from, to, label } | null
  const [activeBilty, setActiveBilty] = useState(null)
  const [pdfLr, setPdfLr] = useState(null)   // bill rendered hidden, only to save its PDF
  const [selected, setSelected] = useState(() => new Set())   // ids picked for a statement
  const [confirmPay, setConfirmPay] = useState(null)   // the entry pending "Mark Paid" confirmation
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)

  const [toast, setToast] = useState(null)

  const [refreshing, setRefreshing] = useState(false)
  const loadEntries = async () => setEntries(await getLREntries())
  useEffect(() => { loadEntries() }, [])

  // Hard refresh: re-fetch the bill list from Supabase.
  const hardRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try { await reloadDatabase(); await loadEntries() }
    finally { setRefreshing(false) }
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // One-click: turn a To Pay / TBB bill into a fully Paid one. Opens a themed
  // confirm dialog first; the actual settle happens in confirmMarkPaid.
  const markPaid = (e) => setConfirmPay(e)

  const confirmMarkPaid = async () => {
    const e = confirmPay
    if (!e) return
    setEntries(await markLRPaid(e.id))
    setConfirmPay(null)
    showToast(`✓ ${e.lr_number} marked as Paid!`)
  }

  // Bulk "Mark Paid" for every selected bill (e.g. a party clears their month).
  // Opens a confirm dialog first; the settle happens in confirmMarkAllPaid.
  const [confirmPayAll, setConfirmPayAll] = useState(false)

  const confirmMarkAllPaid = async () => {
    const ids = [...selected]
    if (ids.length === 0) { setConfirmPayAll(false); return }
    setEntries(await markLRsPaid(ids))
    setConfirmPayAll(false)
    clearSelection()
    showToast(`✓ ${ids.length} bill${ids.length > 1 ? 's' : ''} marked as Paid!`)
  }

  const filtered = entries.filter(e => {
    const matchesText = [e.lr_number, e.consignor, e.consignee, e.from_city, e.to_city]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
    const matchesPay = payFilter === 'all' || (e.payment_type || 'ToPay') === payFilter
    const matchesDate = !dateRange || (e.date >= dateRange.from && e.date <= dateRange.to)
    return matchesText && matchesPay && matchesDate
  })

  // Reset to the first page whenever any filter changes the result set.
  useEffect(() => { setPage(0) }, [search, rowsPerPage, payFilter, dateRange])

  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  // Map a stored row to the shape both the printable Bilty and the message use.
  // Async because the per-item rows are fetched from Supabase.
  const toBilty = async (e) => ({
    lrNumber: e.lr_number, date: e.date, fromCity: e.from_city, toCity: e.to_city,
    consignor: e.consignor, consignorPhone: e.consignor_phone, consignorAddress: e.consignor_address,
    consignee: e.consignee, consigneePhone: e.consignee_phone, consigneeAddress: e.consignee_address,
    items: e.items, freight: e.freight,
    bCharge: e.b_charge, hamali: e.hamali, pickup: e.pickup, delivery: e.delivery,
    totalAmount: e.total_amount,
    advancePaid: e.advance_paid, balanceDue: e.balance_due, paymentType: e.payment_type,
    // Load the per-item rows (qty + rate) so the bill can show "qty X rate".
    itemsList: (await getShipmentItems(e.id)).map(it => ({
      itemName: it.item_name, quantity: it.quantity,
      rate: it.rate, totalAmount: it.total_amount,
    })),
  })

  const openBilty = async (e) => setActiveBilty(await toBilty(e))
  const viewDetail = (e) => navigate(`/bilty/${encodeURIComponent(e.lr_number)}`)
  const sendWhatsApp = async (e) => sendBiltyWhatsApp(await toBilty(e))
  // Download WITHOUT opening the drawer: render the printable bill hidden on the
  // page, then run the same printToPDF path as the Print/PDF button. No drawer,
  // no slide animation → no transform to shift the bill, so the PDF is correct.
  const downloadPdf = async (e) => setPdfLr(await toBilty(e))

  // Once the hidden bill is on the page and its logo image has loaded, save the
  // PDF, then clear it. Falls back to the html2canvas method in a plain browser.
  useEffect(() => {
    if (!pdfLr) return
    let cancelled = false
    const run = async () => {
      const imgs = Array.from(document.querySelectorAll('#printableBilty img'))
      await Promise.all(imgs.map(img =>
        (img.complete && img.naturalWidth > 0)
          ? img.decode?.().catch(() => {})
          : new Promise(res => { img.onload = res; img.onerror = res })
      ))
      if (cancelled) return
      try {
        if (window.electronAPI?.saveBiltyPdf) {
          await window.electronAPI.saveBiltyPdf(`Bilty-${pdfLr.lrNumber || 'receipt'}.pdf`)
        } else {
          await downloadBiltyPdf(pdfLr)
        }
      } finally {
        if (!cancelled) setPdfLr(null)
      }
    }
    const t = setTimeout(run, 60)   // let the hidden bill paint first
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfLr])

  // ── Statement selection ──────────────────────────────
  // Toggle one bill in/out of the selection (keyed by id, so it survives paging).
  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // Are ALL currently-filtered bills selected? (drives the header checkbox)
  const allFilteredSelected = filtered.length > 0 && filtered.every(e => selected.has(e.id))

  // Select-all toggles the WHOLE filtered set (across every page), not just the
  // visible page — so a month's 20-30 bills can be picked in one click.
  const toggleSelectAllFiltered = () => setSelected(prev => {
    const next = new Set(prev)
    if (allFilteredSelected) filtered.forEach(e => next.delete(e.id))
    else filtered.forEach(e => next.add(e.id))
    return next
  })

  const clearSelection = () => setSelected(new Set())

  // Show a friendly payment label + badge colour for the Payment column.
  const paymentLabel = (t) => (t === 'Paid' ? 'Paid' : t === 'TBB' ? 'TBB' : 'To Pay')
  const paymentBadge = (t) => (t === 'Paid' ? 'badge-green' : t === 'TBB' ? 'badge-blue' : 'badge-yellow')

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bilty Records</h1>
          <p className="text-xs text-slate-500 mt-0.5">View full details of any booked Lorry Receipt, or print its Bilty invoice.</p>
        </div>
        <button
          onClick={() => navigate('/lr-entry')}
          className="btn btn-primary flex items-center gap-1.5 px-4 py-2 text-xs font-semibold shadow-xs hover:shadow transition-all cursor-pointer"
        >
          <Plus size={15} /> New LR
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title"><FileText size={15} /> All Bilty Records</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{filtered.length} records</span>
            <button onClick={hardRefresh} disabled={refreshing} title="Hard Refresh — reload from database file"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-wait">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Toolbar: search + period filter + payment pills */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="form-input pl-8 w-80 py-2" placeholder="Search LR, name, city..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <DateFilter value={dateRange} onChange={setDateRange} />
          <div className="flex items-center gap-1.5 ml-auto">
            {PAYMENT_TABS.map(t => (
              <button key={t.key} onClick={() => setPayFilter(t.key)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors
                  ${payFilter === t.key
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Selection action bar — appears once one or more bills are ticked. */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border-b border-indigo-100">
            <span className="text-xs font-semibold text-indigo-800">{selected.size} selected</span>
            <button onClick={() => setConfirmPayAll(true)}
              className="flex items-center gap-1.5 rounded-md border border-green-600 text-green-700 hover:bg-green-600 hover:text-white px-3 py-1.5 text-xs font-semibold transition-colors">
              <CheckCircle size={14} /> Mark All Paid
            </button>
            <button onClick={clearSelection}
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors">
              <X size={13} /> Clear
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No Bilty records found. Book an LR first.</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-3.5 py-2.5 w-8">
                    <input type="checkbox" title="Select all (all pages)"
                      className="h-3.5 w-3.5 cursor-pointer accent-indigo-600 align-middle"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered} />
                  </th>
                  {['#', 'LR Number', 'Date', 'Route', 'Sender (Consignor)', 'Receiver (Consignee)', 'Total', 'Payment', 'Actions'].map(h => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((e, i) => {
                  const total = billTotal(e)
                  const isSel = selected.has(e.id)
                  return (
                    <tr
                      key={e.id}
                      onClick={() => viewDetail(e)}
                      className={`border-b border-slate-50 transition-colors cursor-pointer ${isSel ? 'bg-indigo-50/70' : 'hover:bg-blue-50/60'}`}
                    >
                      <td className="px-3.5 py-2.5" onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          className="h-3.5 w-3.5 cursor-pointer accent-indigo-600 align-middle"
                          checked={isSel}
                          onChange={() => toggleSelect(e.id)} />
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-400">{page * rowsPerPage + i + 1}</td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <span className="font-semibold text-blue-600 hover:underline hover:text-blue-800 transition-colors">
                          {e.lr_number}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">
                        <div>{fmtDate(e.date)}</div>
                        {e.created_at && <div className="text-[10px] text-slate-400">{fmtTime(e.created_at)}</div>}
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{e.from_city} → {e.to_city}</td>
                      <td className="px-3.5 py-2.5 text-slate-700">
                        <div className="font-semibold text-slate-800">{e.consignor}</div>
                        {e.consignor_phone && (
                          <div className="text-xs text-slate-500 font-mono font-medium flex items-center gap-1.5 mt-0.5">
                            <Phone size={12} className="text-slate-400 shrink-0" />
                            <span>{e.consignor_phone}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-700">
                        <div className="font-semibold text-slate-800">{e.consignee}</div>
                        {e.consignee_phone && (
                          <div className="text-xs text-slate-500 font-mono font-medium flex items-center gap-1.5 mt-0.5">
                            <Phone size={12} className="text-slate-400 shrink-0" />
                            <span>{e.consignee_phone}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 font-semibold text-slate-900">₹{total.toLocaleString('en-IN')}</td>
                      <td className="px-3.5 py-2.5">
                        <span className={`badge ${paymentBadge(e.payment_type)}`}>{paymentLabel(e.payment_type)}</span>
                      </td>
                      <td className="px-3.5 py-2.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button onClick={() => viewDetail(e)} title="View details"
                            className="p-1.5 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors">
                            <Eye size={14} />
                          </button>
                          <button onClick={() => navigate(`/lr-entry/${encodeURIComponent(e.lr_number)}`)} title="Edit bill"
                            className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => openBilty(e)} title="Print Bilty"
                            className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                            <Printer size={14} />
                          </button>
                          <button onClick={() => downloadPdf(e)} title="Download PDF"
                            className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                            <Download size={14} />
                          </button>
                          <button onClick={() => sendWhatsApp(e)} title="Send on WhatsApp"
                            className="p-1.5 rounded-md text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                            <MessageCircle size={14} />
                          </button>
                          {e.payment_type !== 'Paid' && (
                            <button onClick={() => markPaid(e)} title="Mark as Paid"
                              className="ml-1 flex items-center gap-1 rounded-md border border-green-600 text-green-700 hover:bg-green-600 hover:text-white px-2 py-1 text-[10px] font-semibold transition-colors whitespace-nowrap">
                              <CheckCircle size={12} /> Mark Paid
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
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

      {activeBilty && (
        <BiltyInvoiceModal lrData={activeBilty} onClose={() => setActiveBilty(null)} />
      )}

      {/* Hidden printable bill for the table's Download icon. Collapsed to zero
          height (NOT positioned/transformed) so print CSS can pin #printableBilty
          to the page's top-left correctly. printToPDF captures only this via the
          @media print rules; on screen it takes no space and isn't visible. */}
      {pdfLr && (
        <div aria-hidden="true" style={{ height: 0, overflow: 'hidden' }}>
          <BiltyDocument lrData={pdfLr} />
        </div>
      )}

      <ConfirmModal
        open={!!confirmPay}
        title="Mark as Paid?"
        message={confirmPay ? `Bill ${confirmPay.lr_number} will be settled in full — advance set to the grand total and balance due to ₹0.` : ''}
        confirmText="Mark Paid"
        cancelText="Cancel"
        onConfirm={confirmMarkPaid}
        onCancel={() => setConfirmPay(null)}
      />

      <ConfirmModal
        open={confirmPayAll}
        title="Mark all selected as Paid?"
        message={`${selected.size} selected bill${selected.size > 1 ? 's' : ''} will be settled in full — each one's advance set to its grand total and balance due to ₹0. This can't be undone in bulk.`}
        confirmText="Mark All Paid"
        cancelText="Cancel"
        onConfirm={confirmMarkAllPaid}
        onCancel={() => setConfirmPayAll(false)}
      />

      {toast && (
        <div className={`fixed bottom-5 left-5 px-4 py-2.5 rounded-lg text-white text-xs font-semibold shadow-lg toast-anim
          ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
