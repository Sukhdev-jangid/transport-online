import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, FileText, CheckCircle, Clock, FileClock, Pencil, MapPin, Package, User, Receipt } from 'lucide-react'
import { getLREntries, getShipmentItems, setLRPaymentType } from '../db/database'
import BiltyInvoiceModal from '../components/BiltyInvoiceModal'
import { fmtDate } from '../utils/date'
import { billTotal } from '../utils/billing'

const num = (v) => Number(v) || 0
const money = (v) => num(v).toLocaleString('en-IN')

// One labelled field in the details grid.
const Field = ({ label, value }) => (
  <div>
    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
    <div className="text-sm font-semibold text-slate-800 mt-0.5 break-words">{value || '—'}</div>
  </div>
)

// Map a stored DB row to the shape the printable Bilty expects.
const toBilty = (e) => ({
  lrNumber: e.lr_number, date: e.date, fromCity: e.from_city, toCity: e.to_city,
  consignor: e.consignor, consignorPhone: e.consignor_phone, consignorAddress: e.consignor_address,
  consignee: e.consignee, consigneePhone: e.consignee_phone, consigneeAddress: e.consignee_address,
  items: e.items, freight: e.freight,
  bCharge: e.b_charge, hamali: e.hamali, pickup: e.pickup, delivery: e.delivery,
  totalAmount: e.total_amount,
  advancePaid: e.advance_paid, balanceDue: e.balance_due, paymentType: e.payment_type,
  // Per-item rows (qty + rate) so the bill can show "qty X rate".
  itemsList: getShipmentItems(e.id).map(it => ({
    itemName: it.item_name, quantity: it.quantity,
    rate: it.rate, totalAmount: it.total_amount,
  })),
})

// The three payment states the user can switch between, with the icon + colour
// each button uses when it is the active state.
const PAYMENT_OPTIONS = [
  { key: 'Paid',  label: 'Paid',   icon: CheckCircle, active: 'border-green-600 bg-green-600 text-white' },
  { key: 'ToPay', label: 'To Pay', icon: Clock,       active: 'border-amber-500 bg-amber-500 text-white' },
  { key: 'TBB',   label: 'TBB',    icon: FileClock,   active: 'border-blue-600 bg-blue-600 text-white' },
]

export default function BillDetail() {
  const { lrNumber } = useParams()
  const navigate = useNavigate()
  const [entry, setEntry] = useState(undefined) // undefined = loading, null = not found
  const [showPrint, setShowPrint] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    const found = getLREntries().find(e => e.lr_number === lrNumber)
    setEntry(found || null)
  }, [lrNumber])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  // Change the bill's payment status and refresh the row shown on this page.
  const changePayment = (type) => {
    if (!entry || entry.payment_type === type) return
    const rows = setLRPaymentType(entry.id, type)
    const updated = rows.find(r => r.id === entry.id)
    if (updated) setEntry(updated)
    const label = PAYMENT_OPTIONS.find(o => o.key === type)?.label || type
    showToast(`✓ ${entry.lr_number} set to ${label}`)
  }

  if (entry === undefined) {
    return <div className="p-6 text-sm text-slate-400">Loading...</div>
  }

  if (entry === null) {
    return (
      <div className="p-6">
        <button onClick={() => navigate(-1)} className="btn btn-outline mb-4 flex items-center gap-1.5">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="card p-12 text-center text-slate-400">
          <FileText size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Bill <b>{lrNumber}</b> not found.</p>
        </div>
      </div>
    )
  }

  const current = entry.payment_type || 'ToPay'

  // Per-item rows and the charge breakdown for the details cards.
  const itemsList = getShipmentItems(entry.id)
  const charges = [
    ['Freight', entry.freight],
    ['B. Charge', entry.b_charge],
    ['Hamali', entry.hamali],
    ['Pick Up', entry.pickup],
    ['Delivery', entry.delivery],
  ].filter(([, v]) => num(v) > 0)
  const grandTotal = billTotal(entry)

  return (
    <div className="p-6">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/bilty')} title="Back to bills"
            className="p-2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Bill {entry.lr_number}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{entry.from_city} → {entry.to_city}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Payment status switch */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Payment</span>
            <div className="flex items-center gap-1.5">
              {PAYMENT_OPTIONS.map(opt => {
                const isActive = current === opt.key
                return (
                  <button key={opt.key} onClick={() => changePayment(opt.key)}
                    className={`flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors
                      ${isActive ? opt.active : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    <opt.icon size={13} /> {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          <button onClick={() => navigate(`/lr-entry/${encodeURIComponent(entry.lr_number)}`)}
            className="btn btn-outline flex items-center gap-1.5">
            <Pencil size={14} /> Edit
          </button>
          <button onClick={() => setShowPrint(true)}
            className="btn btn-primary bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5">
            <Printer size={14} /> Print Bilty
          </button>
        </div>
      </div>

      {/* Bill details in a clean UI layout (not the printable document). The full
          printable Bilty opens only on "Print Bilty". */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left column: shipment + parties */}
        <div className="lg:col-span-2 space-y-4">
          {/* Route & LR */}
          <div className="card">
            <div className="card-header"><span className="card-title"><MapPin size={15} /> Shipment</span></div>
            <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="LR No." value={entry.lr_number} />
              <Field label="Date" value={fmtDate(entry.date)} />
              <Field label="From" value={entry.from_city} />
              <Field label="To" value={entry.to_city} />
              <Field label="E-Way Bill" value={entry.eway_bill} />
            </div>
          </div>

          {/* Consignor / Consignee */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card">
              <div className="card-header"><span className="card-title"><User size={15} /> Sender (Consignor)</span></div>
              <div className="p-5 space-y-3">
                <Field label="Name" value={entry.consignor} />
                <Field label="Address" value={entry.consignor_address} />
                <Field label="Mobile" value={entry.consignor_phone} />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><span className="card-title"><User size={15} /> Receiver (Consignee)</span></div>
              <div className="p-5 space-y-3">
                <Field label="Name" value={entry.consignee} />
                <Field label="Address" value={entry.consignee_address} />
                <Field label="Mobile" value={entry.consignee_phone} />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="card">
            <div className="card-header"><span className="card-title"><Package size={15} /> Items</span></div>
            {itemsList.length === 0 ? (
              <div className="p-5 text-sm text-slate-400">No item rows recorded.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['#', 'Item', 'Qty', 'Rate', 'Amount'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itemsList.map((it, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{it.item_name}</td>
                        <td className="px-4 py-2.5 text-slate-600">{it.quantity || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-600">{it.rate ? `₹${money(it.rate)}` : '—'}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{it.total_amount ? `₹${money(it.total_amount)}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right column: charges summary */}
        <div className="space-y-4">
          <div className="card">
            <div className="card-header"><span className="card-title"><Receipt size={15} /> Charges</span></div>
            <div className="p-5">
              {charges.length === 0 ? (
                <p className="text-sm text-slate-400 mb-3">No individual charges recorded.</p>
              ) : (
                <div className="space-y-2.5 mb-3">
                  {charges.map(([label, val]) => (
                    <div key={label} className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">{label}</span>
                      <span className="font-semibold text-slate-800">₹{money(val)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-200 pt-3 mt-1">
                <span className="text-sm font-bold text-slate-700">Total</span>
                <span className="text-lg font-bold text-blue-700">₹{money(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showPrint && <BiltyInvoiceModal lrData={toBilty(entry)} onClose={() => setShowPrint(false)} />}

      {toast && (
        <div className="fixed bottom-5 left-5 px-4 py-2.5 rounded-lg bg-green-600 text-white text-xs font-semibold shadow-lg toast-anim">
          {toast}
        </div>
      )}
    </div>
  )
}
