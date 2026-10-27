import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Truck, Phone, MapPin, Plus, Trash2, X,
  ArrowUpRight, ArrowDownLeft, Scale, Wallet,
} from 'lucide-react'
import { getTransporterAccount, addCrossingPayment, deleteCrossingPayment } from '../db/database'
import { OUTWARD, INWARD, PAYMENT_MODES, dirLabel } from '../utils/crossing'
import { useRole } from '../context/RoleContext'
import { fmtDate } from '../utils/date'

const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')
const todayISO = () => new Date().toISOString().slice(0, 10)

// Full transporter ledger: opening balance, every crossing (debit/credit), every
// payment, running summary, and a Pay/Receive modal. Payments are gated to
// admin + sub_admin; staff can view but not settle.
export default function TransporterAccount() {
  const { id } = useParams()
  const navigate = useNavigate()
  const tid = Number(id)
  const { canManageUsers } = useRole()   // admin + sub_admin — the "manage money" roles
  const canPay = canManageUsers

  const [data, setData] = useState(undefined)   // undefined = loading, null = not found
  const [toast, setToast] = useState(null)
  const [payModal, setPayModal] = useState(null) // { direction, crossingId? } | null
  const [confirmDelPay, setConfirmDelPay] = useState(null)

  const load = async () => {
    const acct = await getTransporterAccount(tid)
    setData(acct.transporter ? acct : null)
  }
  useEffect(() => { load(); document.querySelector('main')?.scrollTo({ top: 0 }) }, [tid])

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  // A unified ledger: crossings and payments merged, sorted by date (newest
  // first), each carrying a signed effect on the balance for display.
  const ledger = useMemo(() => {
    if (!data) return []
    const rows = []
    for (const c of data.crossings) {
      rows.push({
        kind: 'crossing', id: 'c' + c.id, date: c.crossing_date,
        label: `${dirLabel(c.direction)} • ${c.crossing_no}`,
        detail: `${c.from_station || ''} → ${c.to_station || ''}${c.gr_no ? ` • GR ${c.gr_no}` : ''}`,
        direction: c.direction,
        payable: c.direction === OUTWARD ? Number(c.net_amount) || 0 : 0,
        receivable: c.direction === INWARD ? Number(c.net_amount) || 0 : 0,
      })
    }
    for (const p of data.payments) {
      rows.push({
        kind: 'payment', id: 'p' + p.id, rawId: p.id, date: p.pay_date,
        label: p.direction === 'receive' ? 'Payment received' : 'Payment paid',
        detail: `${p.mode || ''}${p.reference ? ` • ${p.reference}` : ''}`,
        // A payment reduces the matching side — show it as a reduction.
        payable: p.direction === 'pay' ? -(Number(p.amount) || 0) : 0,
        receivable: p.direction === 'receive' ? -(Number(p.amount) || 0) : 0,
      })
    }
    return rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id))
  }, [data])

  const doSavePayment = async (fields) => {
    try {
      await addCrossingPayment({ transporterId: tid, ...fields })
      setPayModal(null)
      await load()
      showToast('✓ Payment recorded')
    } catch (err) { showToast('Error: ' + err.message, 'error') }
  }

  const doDeletePayment = async () => {
    try {
      await deleteCrossingPayment(confirmDelPay.rawId)
      setConfirmDelPay(null)
      await load()
      showToast('✓ Payment removed')
    } catch (err) { showToast('Error: ' + err.message, 'error') }
  }

  if (data === undefined) return <div className="p-6"><div className="text-center py-16 text-slate-400">Loading account…</div></div>
  if (data === null) return (
    <div className="p-6">
      <button onClick={() => navigate('/transporter-accounts')} className="btn btn-outline flex items-center gap-1.5 mb-4">
        <ArrowLeft size={14} /> Back to Accounts
      </button>
      <div className="text-center py-16 text-slate-400">Transporter not found.</div>
    </div>
  )

  const t = data.transporter
  const s = data.summary

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <button onClick={() => navigate('/transporter-accounts')} title="Back"
          className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-primary-100 text-primary-700 shrink-0">
            <Truck size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight">{t.name}</h1>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
              {t.phone && <span className="flex items-center gap-1"><Phone size={12} /> +91 {t.phone}</span>}
              {t.city && <span className="flex items-center gap-1"><MapPin size={12} /> {t.city}</span>}
              {t.gstin && <span className="font-mono">{t.gstin}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <MoneyCard label="We owe (Payable)" value={rupee(s.payable)} tone="red" icon={<ArrowUpRight size={16} />} />
        <MoneyCard label="They owe us (Receivable)" value={rupee(s.receivable)} tone="emerald" icon={<ArrowDownLeft size={16} />} />
        <MoneyCard label="Net Balance" value={s.net === 0 ? 'Settled' : rupee(Math.abs(s.net))}
          sub={s.net !== 0 ? s.netLabel : ''} tone={s.net >= 0 ? 'emerald' : 'red'} icon={<Scale size={16} />} />
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col justify-center gap-2">
          {canPay ? (
            <>
              <button onClick={() => setPayModal({ direction: 'pay' })}
                className="btn py-1.5 text-xs bg-red-600 text-white hover:bg-red-700 flex items-center justify-center gap-1">
                <ArrowUpRight size={13} /> Pay transporter
              </button>
              <button onClick={() => setPayModal({ direction: 'receive' })}
                className="btn py-1.5 text-xs bg-emerald-600 text-white hover:bg-emerald-700 flex items-center justify-center gap-1">
                <ArrowDownLeft size={13} /> Receive payment
              </button>
            </>
          ) : (
            <p className="text-[11px] text-slate-400 text-center">Only admin / sub-admin can record payments.</p>
          )}
        </div>
      </div>

      {/* Opening balance note */}
      {t.opening_type && t.opening_type !== 'none' && Number(t.opening_balance) > 0 && (
        <div className="mb-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
          Opening balance: <span className="font-semibold">{rupee(t.opening_balance)}</span>{' '}
          {t.opening_type === 'payable' ? '(we owed them to start)' : '(they owed us to start)'} — included in the totals above.
        </div>
      )}

      {/* Ledger */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Wallet size={15} /> Ledger ({ledger.length})</span>
          <span className="text-xs text-slate-400">{s.crossingCount} crossings • {s.paymentCount} payments</span>
        </div>
        <div className="overflow-x-auto">
          {ledger.length === 0 ? (
            <div className="text-center py-14 text-slate-400">
              <Wallet size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No crossings or payments yet for this transporter.</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Date', 'Entry', 'Details', 'Payable', 'Receivable', ''].map(h => (
                    <th key={h} className={`px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 ${['Payable', 'Receivable'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.map(row => (
                  <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                    <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(row.date)}</td>
                    <td className="px-3.5 py-2.5">
                      <span className={`badge ${row.kind === 'payment' ? 'badge-blue' : row.direction === OUTWARD ? 'badge-red' : 'badge-green'}`}>{row.label}</span>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-500">{row.detail || '—'}</td>
                    <td className={`px-3.5 py-2.5 text-right tabular-nums ${row.payable < 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {row.payable ? rupee(row.payable) : '—'}
                    </td>
                    <td className={`px-3.5 py-2.5 text-right tabular-nums ${row.receivable < 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                      {row.receivable ? rupee(row.receivable) : '—'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      {row.kind === 'payment' && canPay && (
                        <button onClick={() => setConfirmDelPay(row)} title="Remove payment"
                          className="p-1 rounded border border-slate-200 text-red-500 hover:bg-red-50 transition">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {payModal && <PaymentModal modal={payModal} onClose={() => setPayModal(null)} onSave={doSavePayment} />}

      {confirmDelPay && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-5 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">Remove payment?</h3>
            <p className="text-xs text-slate-500">This payment entry will be deleted and the balance recalculated. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelPay(null)} className="btn btn-outline py-1 px-3">Cancel</button>
              <button onClick={doDeletePayment} className="btn py-1 px-3 bg-red-600 text-white hover:bg-red-700">Remove</button>
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

// Pay / Receive modal. direction 'pay' = money we give an outward transporter;
// 'receive' = money an inward transporter gives us.
function PaymentModal({ modal, onClose, onSave }) {
  const isPay = modal.direction === 'pay'
  const [amount, setAmount] = useState('')
  const [payDate, setPayDate] = useState(todayISO())
  const [mode, setMode] = useState('Cash')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (saving) return
    const amt = Math.max(0, Number(amount) || 0)
    if (amt <= 0) return
    setSaving(true)
    await onSave({ direction: modal.direction, amount: amt, payDate, mode, reference })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-sm w-full shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className={`text-sm font-bold ${isPay ? 'text-red-700' : 'text-emerald-700'}`}>
            {isPay ? 'Pay transporter' : 'Receive payment'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div>
            <label className="form-label">Amount *</label>
            <input className="form-input" type="number" min="0" step="0.01" autoFocus
              value={amount} onChange={e => setAmount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Mode</label>
              <select className="form-input" value={mode} onChange={e => setMode(e.target.value)}>
                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Reference / Note</label>
            <input className="form-input" type="text" placeholder="UPI ref, cheque no, note…"
              value={reference} onChange={e => setReference(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn btn-outline py-1.5 px-3" disabled={saving}>Cancel</button>
            <button type="submit" disabled={saving}
              className={`btn py-1.5 px-4 text-white disabled:opacity-60 ${isPay ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const CARD_TONES = { red: 'bg-red-100 text-red-700', emerald: 'bg-emerald-100 text-emerald-700' }

function MoneyCard({ label, value, sub, tone, icon }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-md mb-2 ${CARD_TONES[tone]}`}>{icon}</div>
      <div className={`text-2xl font-bold leading-none ${tone === 'red' ? 'text-red-700' : 'text-emerald-700'}`}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mt-1.5">{label}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}
