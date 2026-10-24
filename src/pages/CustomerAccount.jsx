import React, { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, FileText, User, Phone, MapPin, Wallet } from 'lucide-react'
import { getCustomers, getCustomerAccount } from '../db/database'
import DateFilter from '../components/DateFilter'
import Pagination from '../components/Pagination'
import { fmtDate } from '../utils/date'

const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')
const num = (v) => Number(v) || 0

// Payment scope pills (same set as the Bilty / Challan pages).
const PAYMENT_TABS = [
  { key: 'all', label: 'All' },
  { key: 'Paid', label: 'Paid' },
  { key: 'ToPay', label: 'To Pay' },
  { key: 'TBB', label: 'TBB' },
]

// Recompute the account cards from any subset of bills (each already carries
// `role` and `amount` from getCustomerAccount), so the totals reflect the active
// period + payment scope — not the whole history.
function summarize(bills) {
  let asSender = 0, asReceiver = 0, asBoth = 0
  let totalAmount = 0, senderAmount = 0, receiverAmount = 0, toPay = 0
  for (const b of bills) {
    const sender = b.role === 'Sender' || b.role === 'Both'
    const receiver = b.role === 'Receiver' || b.role === 'Both'
    if (b.role === 'Both') asBoth++
    if (sender) asSender++
    if (receiver) asReceiver++
    totalAmount += b.amount
    if (sender) senderAmount += b.amount
    if (receiver && b.role !== 'Both') receiverAmount += b.amount
    if (b.payment_type !== 'Paid') toPay += num(b.balance_due) || b.amount
  }
  return { totalBills: bills.length, asSender, asReceiver, asBoth, totalAmount, senderAmount, receiverAmount, toPay }
}

// Full-page customer ACCOUNT / LEDGER: how many bills this customer appears on,
// split by role (sender / receiver / both), money totals, and the list of every
// linked bill. Bills link by customer id — only bills booked after picking this
// customer from the list (or added via the inline "Add Customer") are counted;
// older typed-in names won't have an id link.
export default function CustomerAccount() {
  const { id } = useParams()
  const navigate = useNavigate()
  const custId = Number(id)

  const [roleFilter, setRoleFilter] = useState('all')  // all | Sender | Receiver
  const [payFilter, setPayFilter] = useState('all')    // all | Paid | ToPay | TBB
  const [dateRange, setDateRange] = useState(null)      // { from, to, label } | null
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)

  const EMPTY_ACCT = { bills: [], totalBills: 0, asSender: 0, asReceiver: 0, asBoth: 0, totalAmount: 0, senderAmount: 0, receiverAmount: 0, toPay: 0 }
  const [customer, setCustomer] = useState(undefined)   // undefined = loading, null = not found
  const [acct, setAcct] = useState(EMPTY_ACCT)

  useEffect(() => {
    let active = true
    getCustomers().then(list => { if (active) setCustomer(list.find(c => c.id === custId) || null) })
    getCustomerAccount(custId).then(a => { if (active) setAcct(a) })
    return () => { active = false }
  }, [custId])

  // Period + payment define the page SCOPE — the cards count only bills inside
  // this scope, so picking a month shows that month's totals. Role (All/Sent/
  // Received) then filters the list within that scope.
  const scopedBills = useMemo(() => acct.bills.filter(b => {
    const matchesPay = payFilter === 'all' || (b.payment_type || 'ToPay') === payFilter
    const matchesDate = !dateRange || (b.date >= dateRange.from && b.date <= dateRange.to)
    return matchesPay && matchesDate
  }), [acct.bills, payFilter, dateRange])

  const summary = useMemo(() => summarize(scopedBills), [scopedBills])

  // Clicking a bill opens its detail page.
  const openBill = (lr) => navigate(`/bilty/${encodeURIComponent(lr)}`)

  useEffect(() => { document.querySelector('main')?.scrollTo({ top: 0 }) }, [custId])
  // Reset to the first page whenever a filter or page size changes the result set.
  useEffect(() => { setPage(0) }, [custId, roleFilter, payFilter, dateRange, rowsPerPage])

  if (customer === undefined) {
    return (
      <div className="p-6">
        <div className="text-center py-16 text-slate-400">Loading account…</div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="p-6">
        <button onClick={() => navigate('/customers')} className="btn btn-outline flex items-center gap-1.5 mb-4">
          <ArrowLeft size={14} /> Back to Customers
        </button>
        <div className="text-center py-16 text-slate-400">Customer not found.</div>
      </div>
    )
  }

  const bills = scopedBills.filter(b =>
    roleFilter === 'all' ? true
      : roleFilter === 'Sender' ? (b.role === 'Sender' || b.role === 'Both')
      : (b.role === 'Receiver' || b.role === 'Both')
  )
  const pagedBills = bills.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <button onClick={() => navigate('/customers')} title="Back to Customers"
          className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-primary-100 text-primary-700 shrink-0">
            <User size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight">{customer.name}</h1>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
              {customer.phone && <span className="flex items-center gap-1"><Phone size={12} /> +91 {customer.phone}</span>}
              {customer.city && <span className="flex items-center gap-1"><MapPin size={12} /> {customer.city}</span>}
              {customer.address && <span className="truncate max-w-xs">{customer.address}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards (reflect the active period + payment scope) */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <StatCard label="Total Bills" value={summary.totalBills} tone="slate" icon={<FileText size={16} />} />
        <StatCard label="As Sender" value={summary.asSender} tone="blue" icon={<ArrowUpRight size={16} />} />
        <StatCard label="As Receiver" value={summary.asReceiver} tone="emerald" icon={<ArrowDownLeft size={16} />} />
        <StatCard label="Both Roles" value={summary.asBoth} tone="violet" icon={<User size={16} />} />
      </div>

      {/* Money summary (reflect the active period + payment scope) */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <MoneyCard label="Total Business" value={rupee(summary.totalAmount)} tone="slate" />
        <MoneyCard label="As Sender (₹)" value={rupee(summary.senderAmount)} tone="blue" />
        <MoneyCard label="Outstanding (To Pay)" value={rupee(summary.toPay)} tone="amber" />
      </div>

      {/* Bill list */}
      <div className="card">
        <div className="card-header flex-wrap gap-y-2">
          {/* Left: title + period + payment (these define the page scope — cards + list) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="card-title"><FileText size={15} /> Bills ({bills.length})</span>
            <DateFilter value={dateRange} onChange={setDateRange} />
            <div className="flex items-center gap-1">
              {PAYMENT_TABS.map(tab => (
                <button key={tab.key} onClick={() => setPayFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
                    ${payFilter === tab.key ? 'bg-primary-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          {/* Right: role tabs — filter the list within the scope above */}
          <div className="flex items-center gap-1">
            {[['all', 'All'], ['Sender', 'Sent'], ['Receiver', 'Received']].map(([k, lbl]) => (
              <button key={k} onClick={() => setRoleFilter(k)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
                  ${roleFilter === k ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          {bills.length === 0 ? (
            <div className="text-center py-14 text-slate-400">
              <Wallet size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {acct.totalBills === 0
                  ? 'No linked bills yet. Bills created by picking this customer from the list will appear here.'
                  : 'No bills match this filter. Try changing the period, payment or role.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['LR No', 'Date', 'Route', 'Role', 'Goods', 'Payment', 'Amount'].map(h => (
                    <th key={h} className={`px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedBills.map(b => (
                  <tr key={b.id} onClick={() => openBill(b.lr_number)}
                    className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors cursor-pointer">
                    <td className="px-3.5 py-2.5 font-semibold text-blue-600 whitespace-nowrap">{b.lr_number}</td>
                    <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(b.date)}</td>
                    <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{b.from_city} → {b.to_city}</td>
                    <td className="px-3.5 py-2.5">
                      <span className={`badge ${b.role === 'Sender' ? 'badge-blue' : b.role === 'Receiver' ? 'badge-green' : 'badge-gray'}`}>
                        {b.role}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-500 max-w-[200px] truncate">{b.items || '—'}</td>
                    <td className="px-3.5 py-2.5">
                      <span className={`badge ${b.payment_type === 'Paid' ? 'badge-green' : b.payment_type === 'TBB' ? 'badge-blue' : 'badge-yellow'}`}>
                        {b.payment_type === 'Paid' ? 'Paid' : b.payment_type === 'TBB' ? 'TBB' : 'To Pay'}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">{rupee(b.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {bills.length > 0 && (
          <Pagination
            total={bills.length}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={setPage}
            onRowsPerPageChange={setRowsPerPage}
          />
        )}
      </div>
    </div>
  )
}

const TONES = {
  slate:   'bg-slate-100 text-slate-700',
  blue:    'bg-blue-100 text-blue-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  violet:  'bg-violet-100 text-violet-700',
  amber:   'bg-amber-100 text-amber-700',
}

function StatCard({ label, value, tone, icon }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-md mb-2 ${TONES[tone]}`}>{icon}</div>
      <div className="text-3xl font-bold text-slate-900 leading-none">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mt-1.5">{label}</div>
    </div>
  )
}

function MoneyCard({ label, value, tone }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-xl font-bold mt-1.5 leading-none ${tone === 'amber' ? 'text-amber-600' : tone === 'blue' ? 'text-blue-700' : 'text-slate-900'}`}>{value}</div>
    </div>
  )
}
