import React, { useState, useEffect, useMemo } from 'react'
import {
  FileSpreadsheet, Plus, Search, Printer, Download, Trash2,
  Calendar, User, Check, RefreshCw, X, Filter, FileText, CheckCircle2
} from 'lucide-react'
import {
  getLREntries, getCustomers, getStatements, addStatement, deleteStatement, reloadDatabase
} from '../db/database'
import { fmtDate } from '../utils/date'
import { downloadStatementPdf } from '../utils/statementPdf'
import { billTotal } from '../utils/billing'
import { playSound } from '../utils/sound'
import { packagesFromSummary, goodsFromSummary } from '../utils/items'
import StatementDocument from '../components/StatementDocument'
import StatementInvoiceModal from '../components/StatementInvoiceModal'
import Pagination from '../components/Pagination'
import DateFilter from '../components/DateFilter'
import Select from '../components/Select'

const num = (v) => Number(v) || 0

// Total packages in an LR entry — via the SHARED counter so the statement
// agrees with the bill and challan for the same bill.
const billPackages = (e) => packagesFromSummary(e?.items)

const PAYMENT_OPTIONS = [
  { value: 'all', label: 'All Payment Types' },
  { value: 'Paid', label: 'Paid Only' },
  { value: 'ToPay', label: 'To Pay Only' },
  { value: 'TBB', label: 'TBB Only' },
]

export default function Statements() {
  const [tab, setTab] = useState('generate') // 'generate' | 'history'
  const [entries, setEntries] = useState([])
  const [statements, setStatements] = useState([])
  const [toast, setToast] = useState(null)
  const [confirmId, setConfirmId] = useState(null)

  // ── Generator state ──
  const [partyRole, setPartyRole] = useState('consignor') // 'consignor' | 'consignee' | 'all'
  const [partyName, setPartyName] = useState('')
  const [selectedPartyId, setSelectedPartyId] = useState(null)
  const [dateRange, setDateRange] = useState(null) // { from, to, label } | null
  const [paymentType, setPaymentType] = useState('all') // 'all' | 'Paid' | 'ToPay' | 'TBB'
  const [biltySearch, setBiltySearch] = useState('')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [biltyPage, setBiltyPage] = useState(0)
  const [biltyRowsPerPage, setBiltyRowsPerPage] = useState(20)

  // Preview Drawer
  const [previewStmt, setPreviewStmt] = useState(null)

  // History tab search + paging
  const [historySearch, setHistorySearch] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)

  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)      // blocks double-submit on statement save
  const [deleting, setDeleting] = useState(false)  // blocks double-click on delete
  const [allCustomers, setAllCustomers] = useState([])
  const loadData = async () => {
    const [lrs, stmts, custs] = await Promise.all([
      getLREntries(), getStatements(), getCustomers(),
    ])
    setEntries(lrs)
    setStatements(stmts)
    setAllCustomers(custs)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Hard refresh: re-fetch this page's data from Supabase.
  const hardRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try { await reloadDatabase(); await loadData() }
    finally { setRefreshing(false) }
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Build unique Party options list based on role with ID & phone/city metadata
  const partySelectOptions = useMemo(() => {
    const map = new Map() // key: party name (lowercase) -> { value, label, id, phone, city }

    // First add all registered customers from master
    allCustomers.forEach(c => {
      if (c.name) {
        const key = c.name.trim().toLowerCase()
        const meta = [c.phone, c.city].filter(Boolean).join(' • ')
        map.set(key, {
          value: c.name,
          label: meta ? `${c.name} (${meta})` : c.name,
          id: c.id,
          phone: c.phone || '',
          city: c.city || '',
        })
      }
    })

    // Then add any unique parties from LR entries that may not be in customers master
    entries.forEach(e => {
      if (partyRole === 'consignor' || partyRole === 'all' || partyRole === 'both') {
        if (e.consignor) {
          const key = e.consignor.trim().toLowerCase()
          if (!map.has(key)) {
            map.set(key, {
              value: e.consignor,
              label: e.consignor,
              id: e.consignor_id || null,
              phone: e.consignor_phone || '',
              city: e.from_city || '',
            })
          }
        }
      }
      if (partyRole === 'consignee' || partyRole === 'all' || partyRole === 'both') {
        if (e.consignee) {
          const key = e.consignee.trim().toLowerCase()
          if (!map.has(key)) {
            map.set(key, {
              value: e.consignee,
              label: e.consignee,
              id: e.consignee_id || null,
              phone: e.consignee_phone || '',
              city: e.to_city || '',
            })
          }
        }
      }
    })

    const list = Array.from(map.values()).sort((a, b) => a.value.localeCompare(b.value))
    return [
      { value: '', label: 'All Parties (No Filter)', id: null },
      ...list
    ]
  }, [entries, allCustomers, partyRole])

  // Filter bilties matching generator criteria (ID + Name hybrid matching)
  const matchingBilties = useMemo(() => {
    return entries.filter(e => {
      // 1. Party filter with ID + Name matching
      if (partyName) {
        const targetName = partyName.trim().toLowerCase()
        const targetId = selectedPartyId

        const matchSender = Boolean(
          (targetId && e.consignor_id === targetId) ||
          (String(e.consignor || '').trim().toLowerCase() === targetName)
        )

        const matchReceiver = Boolean(
          (targetId && e.consignee_id === targetId) ||
          (String(e.consignee || '').trim().toLowerCase() === targetName)
        )

        if (partyRole === 'consignor') {
          if (!matchSender) return false
        } else if (partyRole === 'consignee') {
          if (!matchReceiver) return false
        } else if (partyRole === 'both') {
          // Both sender AND receiver must be this party
          if (!(matchSender && matchReceiver)) return false
        } else {
          // 'all': either sender OR receiver
          if (!(matchSender || matchReceiver)) return false
        }
      } else {
        // When no party is selected (All Parties)
        if (partyRole === 'both') {
          const sName = String(e.consignor || '').trim().toLowerCase()
          const rName = String(e.consignee || '').trim().toLowerCase()
          const sId = e.consignor_id
          const rId = e.consignee_id
          const isSame = (sId && rId && sId === rId) || (Boolean(sName) && sName === rName)
          if (!isSame) return false
        }
      }

      // 2. Payment type
      if (paymentType !== 'all') {
        if (paymentType === 'Paid' && e.payment_type !== 'Paid') return false
        if (paymentType === 'ToPay' && (e.payment_type !== 'ToPay' && e.payment_type !== 'To Pay')) return false
        if (paymentType === 'TBB' && e.payment_type !== 'TBB') return false
      }

      // 3. Date range filter
      if (dateRange?.from && e.date < dateRange.from) return false
      if (dateRange?.to && e.date > dateRange.to) return false

      // 4. Text search
      if (biltySearch.trim()) {
        const s = biltySearch.trim().toLowerCase()
        const has = (...vals) => vals.some(v => String(v || '').toLowerCase().includes(s))
        if (!has(e.lr_number, e.consignor, e.consignee, e.from_city, e.to_city, e.items)) return false
      }

      return true
    })
  }, [entries, partyRole, partyName, selectedPartyId, dateRange, paymentType, biltySearch])

  // Select all matching bilties by default when matching set changes, and reset page
  useEffect(() => {
    setSelectedIds(new Set(matchingBilties.map(b => b.id)))
    setBiltyPage(0)
  }, [matchingBilties])

  const pagedMatchingBilties = useMemo(() => {
    return matchingBilties.slice(biltyPage * biltyRowsPerPage, biltyPage * biltyRowsPerPage + biltyRowsPerPage)
  }, [matchingBilties, biltyPage, biltyRowsPerPage])

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === matchingBilties.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(matchingBilties.map(b => b.id)))
    }
  }

  // Selected bills objects sorted oldest-first for statement layout
  const selectedBills = useMemo(() => {
    const list = matchingBilties.filter(b => selectedIds.has(b.id))
    return list.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.lr_number || '').localeCompare(b.lr_number || ''))
  }, [matchingBilties, selectedIds])

  const totalPkgsSum = selectedBills.reduce((s, b) => s + billPackages(b), 0)
  const totalAmountSum = selectedBills.reduce((s, b) => s + billTotal(b), 0)

  // Period label for display on statement
  const getPeriodLabel = () => {
    if (dateRange?.label) return dateRange.label
    return 'All Time'
  }

  // Build document bills structure
  const buildDocBills = (billsList) => {
    return billsList.map((b, i) => ({
      srNo: i + 1,
      lrNumber: b.lr_number,
      date: b.date,
      goods: Array.isArray(b.items)
        ? b.items.map(it => it.name || it.item_name).filter(Boolean).join(', ')
        : goodsFromSummary(b.items),
      packages: billPackages(b),
      amount: billTotal(b)
    }))
  }

  // Save statement to database
  const handleSaveStatement = async () => {
    if (saving) return
    if (selectedBills.length === 0) {
      showToast('Select at least one bilty to generate statement.', 'error')
      return
    }
    setSaving(true)
    try {
      // await: addStatement persists to disk and throws on failure. On a disk
      // error the statement row is rolled back and we fall into catch, so we
      // never show "saved" for a statement that isn't in the database.
      const stmtNum = await addStatement({
        createdDate: new Date().toISOString().split('T')[0],
        partyName: partyName.trim() || (partyRole === 'consignor' ? 'All Consignors' : partyRole === 'consignee' ? 'All Consignees' : partyRole === 'both' ? 'All Both (Same Party)' : 'All Parties'),
        partyRole: partyRole,
        periodLabel: getPeriodLabel(),
        totalBills: selectedBills.length,
        totalPackages: totalPkgsSum,
        totalAmount: totalAmountSum,
        biltyIds: selectedBills.map(b => b.id),
        // Freeze the exact printed rows now, so this statement never changes if
        // a bill is later edited or deleted.
        billsSnapshot: buildDocBills(selectedBills),
      })
      showToast(`✓ Statement ${stmtNum} saved to database!`)
      playSound(true)
      loadData()
      setTab('history')
    } catch (err) {
      playSound(false)
      showToast('✗ STATEMENT NOT SAVED! Disk error: ' + err.message + ' — try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Open Preview Drawer
  const handlePreviewCurrent = () => {
    if (selectedBills.length === 0) {
      showToast('Select at least one bilty to preview statement.', 'error')
      return
    }
    setPreviewStmt({
      partyName: partyName.trim() || 'All Parties',
      partyRole: partyRole,
      periodLabel: getPeriodLabel(),
      bills: buildDocBills(selectedBills)
    })
  }

  // Direct Download PDF
  const handleDownloadCurrentPdf = async () => {
    if (selectedBills.length === 0) {
      showToast('Select at least one bilty to download statement PDF.', 'error')
      return
    }
    const data = {
      partyName: partyName.trim() || 'All Parties',
      partyRole: partyRole,
      periodLabel: getPeriodLabel(),
      bills: buildDocBills(selectedBills)
    }
    await downloadStatementPdf(data)
  }

  // Saved statements filtering
  const filteredHistory = statements.filter(s => {
    if (!historySearch.trim()) return true
    const q = historySearch.trim().toLowerCase()
    return [s.statement_number, s.party_name, s.period_label, s.party_role]
      .some(x => String(x || '').toLowerCase().includes(q))
  })

  const pagedHistory = filteredHistory.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  // bilty_ids comes back from Supabase as a jsonb array already, but older rows
  // (or the legacy SQLite export) stored it as a JSON string — handle both.
  const parseBiltyIds = (val) => {
    if (Array.isArray(val)) return val
    try { return JSON.parse(val || '[]') } catch (_) { return [] }
  }

  // A saved statement is a SNAPSHOT, not a live query. Reprint from the frozen
  // bills_snapshot taken at save time. Only older rows that have no snapshot
  // fall back to rebuilding from live bills (legacy behaviour).
  const savedBills = (stmt) => {
    const snap = stmt.bills_snapshot
    if (Array.isArray(snap) && snap.length > 0) return snap
    const ids = parseBiltyIds(stmt.bilty_ids)
    const linkedBills = entries.filter(e => ids.includes(e.id))
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.lr_number || '').localeCompare(b.lr_number || ''))
    return buildDocBills(linkedBills)
  }

  // Preview / Print saved statement from history
  const previewSavedStatement = (stmt) => {
    setPreviewStmt({
      statementNumber: stmt.statement_number,
      partyName: stmt.party_name,
      partyRole: stmt.party_role,
      periodLabel: stmt.period_label,
      bills: savedBills(stmt)
    })
  }

  const downloadSavedStatementPdf = async (stmt) => {
    await downloadStatementPdf({
      partyName: stmt.party_name,
      partyRole: stmt.party_role,
      periodLabel: stmt.period_label,
      bills: savedBills(stmt)
    })
  }

  const handleDeleteSaved = async (id) => {
    if (deleting) return
    setDeleting(true)
    try {
      await deleteStatement(id)
      showToast('Statement deleted successfully.')
      setConfirmId(null)
      loadData()
    } catch (err) {
      playSound(false)
      showToast('✗ NOT DELETED — disk error: ' + err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handlePartySelect = (val) => {
    setPartyName(val)
    const opt = partySelectOptions.find(o => o.value === val)
    setSelectedPartyId(opt?.id || null)
  }

  // Keyboard shortcut: Ctrl+S or Ctrl+Enter to save statement
  useEffect(() => {
    if (tab !== 'generate') return
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 's')) {
        e.preventDefault()
        handleSaveStatement()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tab, selectedBills, partyName, partyRole, dateRange, totalPkgsSum, totalAmountSum])

  return (
    <div className="p-6">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-5 left-5 z-[100] px-4 py-2.5 rounded-lg text-white text-xs font-semibold shadow-lg toast-anim ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="text-primary-600" size={24} /> Account Statements
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              Shortcuts: <kbd className="font-semibold text-slate-800">Ctrl+S</kbd> or <kbd className="font-semibold text-slate-800">Ctrl+Enter</kbd>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Create, filter, print, and track monthly party statement bills for Senders, Receivers, or custom date ranges.
          </p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setTab('generate')}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${tab === 'generate' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <Plus size={13} className="inline mr-1.5 -mt-0.5" /> Generate Statement
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${tab === 'history' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <FileText size={13} className="inline mr-1.5 -mt-0.5" /> Saved History ({statements.length})
          </button>
        </div>
      </div>

      {tab === 'generate' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column: Generator Filters */}
          <div className="lg:col-span-1 space-y-4">
            <div className="card p-4 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                <Filter size={14} className="text-primary-600" /> Filter Criteria
              </h3>

              {/* Target Role Selection */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Target Role</label>
                <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-center">
                  <button
                    type="button"
                    onClick={() => { setPartyRole('consignor'); setPartyName(''); setSelectedPartyId(null) }}
                    className={`py-1.5 text-[11px] font-semibold rounded-md transition-all ${partyRole === 'consignor' ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Sender
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPartyRole('consignee'); setPartyName(''); setSelectedPartyId(null) }}
                    className={`py-1.5 text-[11px] font-semibold rounded-md transition-all ${partyRole === 'consignee' ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Receiver
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPartyRole('both'); setPartyName(''); setSelectedPartyId(null) }}
                    className={`py-1.5 text-[11px] font-semibold rounded-md transition-all ${partyRole === 'both' ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    title="Sender aur Receiver dono same party hon"
                  >
                    Both/Same
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPartyRole('all'); setPartyName(''); setSelectedPartyId(null) }}
                    className={`py-1.5 text-[11px] font-semibold rounded-md transition-all ${partyRole === 'all' ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    title="Party chahe Sender ho ya Receiver (Sabhi)"
                  >
                    All
                  </button>
                </div>
              </div>

              {/* Party Name Select */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                  Select {partyRole === 'consignor' ? 'Sender (Consignor)' : partyRole === 'consignee' ? 'Receiver (Consignee)' : partyRole === 'both' ? 'Party (Both/Same)' : 'Party Name'}
                </label>
                <Select
                  value={partyName}
                  onChange={handlePartySelect}
                  options={partySelectOptions}
                  searchable
                  placeholder="Select or Search Party..."
                  className="w-full"
                />
              </div>

              {/* Period / Date Filter (Uses reusable DateFilter component) */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Period / Date Filter</label>
                <div className="flex">
                  <DateFilter
                    value={dateRange}
                    onChange={setDateRange}
                  />
                </div>
              </div>

              {/* Payment Status */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Payment Status</label>
                <Select
                  value={paymentType}
                  onChange={setPaymentType}
                  options={PAYMENT_OPTIONS}
                  className="w-full"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <button
                  onClick={handleSaveStatement}
                  disabled={selectedBills.length === 0 || saving}
                  className="btn btn-primary w-full justify-center text-xs py-2 disabled:opacity-50 disabled:cursor-wait"
                  title="Save Statement (Ctrl+S or Ctrl+Enter)"
                >
                  <CheckCircle2 size={14} /> {saving ? 'Saving…' : 'Save Statement (Ctrl+S)'}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handlePreviewCurrent}
                    disabled={selectedBills.length === 0}
                    className="btn btn-outline text-xs justify-center py-1.5 disabled:opacity-50"
                  >
                    <Printer size={13} /> Print Preview
                  </button>
                  <button
                    onClick={handleDownloadCurrentPdf}
                    disabled={selectedBills.length === 0}
                    className="btn btn-outline text-xs justify-center py-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    <Download size={13} /> Download PDF
                  </button>
                </div>
              </div>
            </div>

            {/* Metrics Card */}
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 text-primary-900 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-primary-700">Selected Summary</div>
              {/* Bills + Pkgs share a row; Freight gets its own full-width row so
                  a large amount like ₹4,60,778 never gets squeezed/clipped. */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-white/90 rounded-md p-2 border border-primary-100 shadow-sm">
                  <span className="block text-[10px] text-slate-500 font-semibold">Bills</span>
                  <span className="text-base font-black text-slate-800">{selectedBills.length}</span>
                </div>
                <div className="bg-white/90 rounded-md p-2 border border-primary-100 shadow-sm">
                  <span className="block text-[10px] text-slate-500 font-semibold">Pkgs</span>
                  <span className="text-base font-black text-slate-800">{totalPkgsSum}</span>
                </div>
              </div>
              <div className="bg-white/90 rounded-md px-3 py-2 border border-primary-100 shadow-sm flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider shrink-0">Freight</span>
                <span className="text-lg font-black text-primary-700 whitespace-nowrap tabular-nums">₹{totalAmountSum.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Matching Bilties Picker Table */}
          <div className="lg:col-span-3">
            <div className="card">
              <div className="card-header flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <span className="card-title">Matching Bilties</span>
                  <span className="badge badge-blue">{matchingBilties.length} matching</span>
                  <span className="text-xs font-semibold text-slate-500">
                    ({selectedBills.length} selected)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set(matchingBilties.map(b => b.id)))}
                    className="px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 rounded border border-blue-200 transition cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 rounded border border-slate-200 transition cursor-pointer"
                  >
                    Clear
                  </button>
                  <div className="relative w-56">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      className="form-input pl-8 w-full py-1 text-xs"
                      placeholder="Search LR no, party, city..."
                      value={biltySearch}
                      onChange={e => setBiltySearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                {matchingBilties.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <FileSpreadsheet size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No matching bilties found for the selected filters.</p>
                  </div>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-3.5 py-2.5 w-10 text-center">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                            checked={selectedIds.size === matchingBilties.length && matchingBilties.length > 0}
                            onChange={toggleAll}
                          />
                        </th>
                        {['LR No', 'Date', 'Sender (Consignor)', 'Receiver (Consignee)', 'Route', 'Pkgs', 'Freight Total', 'Payment'].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedMatchingBilties.map(b => {
                        const isPicked = selectedIds.has(b.id)
                        const total = billTotal(b)
                        const pkgs = billPackages(b)
                        return (
                          <tr
                            key={b.id}
                            onClick={() => toggleSelect(b.id)}
                            className={`border-b border-slate-50 hover:bg-blue-50/50 transition-colors cursor-pointer ${isPicked ? 'bg-blue-50/30' : ''}`}
                          >
                            <td className="px-3.5 py-2 text-center" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                checked={isPicked}
                                onChange={() => toggleSelect(b.id)}
                              />
                            </td>
                            <td className="px-3 py-2 font-bold text-primary-600">{b.lr_number}</td>
                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtDate(b.date)}</td>
                            <td className="px-3 py-2 text-slate-800 font-medium max-w-[140px] truncate">{b.consignor || '—'}</td>
                            <td className="px-3 py-2 text-slate-800 font-medium max-w-[140px] truncate">{b.consignee || '—'}</td>
                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{b.from_city} → {b.to_city}</td>
                            <td className="px-3 py-2 text-slate-700 font-semibold">{pkgs || '—'}</td>
                            <td className="px-3 py-2 font-bold text-slate-900 tabular-nums">₹{total.toLocaleString('en-IN')}</td>
                            <td className="px-3 py-2">
                              <span className={`badge ${b.payment_type === 'Paid' ? 'badge-green' : b.payment_type === 'TBB' ? 'badge-blue' : 'badge-yellow'}`}>
                                {b.payment_type === 'Paid' ? 'Paid' : b.payment_type === 'TBB' ? 'TBB' : 'To Pay'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {matchingBilties.length > 0 && (
                <Pagination
                  total={matchingBilties.length}
                  page={biltyPage}
                  rowsPerPage={biltyRowsPerPage}
                  onPageChange={setBiltyPage}
                  onRowsPerPageChange={setBiltyRowsPerPage}
                />
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Saved Statements History Tab */
        <div className="card">
          <div className="card-header flex flex-wrap items-center justify-between gap-3">
            <span className="card-title">Saved Statements History</span>
            <div className="flex items-center gap-2">
              <div className="relative w-72">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="form-input pl-8 w-full py-1 text-xs"
                  placeholder="Search statement no, party, period..."
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                />
              </div>
              <button onClick={hardRefresh} disabled={refreshing} title="Hard Refresh — reload from database file"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-wait shrink-0">
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredHistory.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <FileText size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No saved statements found.</p>
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Statement No', 'Created Date', 'Party Name', 'Target Role', 'Period', 'Bills Count', 'Total Amount', 'Actions'].map(h => (
                      <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedHistory.map(s => (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors">
                      <td className="px-3.5 py-2.5 font-bold text-primary-600">{s.statement_number}</td>
                      <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(s.created_date)}</td>
                      <td className="px-3.5 py-2.5 font-semibold text-slate-800">{s.party_name}</td>
                      <td className="px-3.5 py-2.5">
                        <span className="badge badge-blue uppercase text-[10px]">
                          {s.party_role === 'consignor' ? 'Sender' : s.party_role === 'consignee' ? 'Receiver' : s.party_role === 'both' ? 'Both/Same' : 'All'}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{s.period_label || '—'}</td>
                      <td className="px-3.5 py-2.5 font-semibold text-slate-700">{s.total_bills}</td>
                      <td className="px-3.5 py-2.5 font-bold text-slate-900 tabular-nums">₹{Number(s.total_amount || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => previewSavedStatement(s)}
                            title="Print preview"
                            className="p-1.5 rounded-md text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                          >
                            <Printer size={13} />
                          </button>
                          <button
                            onClick={() => downloadSavedStatementPdf(s)}
                            title="Download PDF"
                            className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          >
                            <Download size={13} />
                          </button>
                          <button
                            onClick={() => setConfirmId(s.id)}
                            title="Delete"
                            className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
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

          {filteredHistory.length > 0 && (
            <Pagination
              total={filteredHistory.length}
              page={page}
              rowsPerPage={rowsPerPage}
              onPageChange={setPage}
              onRowsPerPageChange={setRowsPerPage}
            />
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setConfirmId(null)}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Delete statement?</h3>
            <p className="text-xs text-slate-500 mb-4">This statement record will be permanently deleted. Linked bilties will not be affected.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmId(null)} className="btn btn-outline" disabled={deleting}>Cancel</button>
              <button onClick={() => handleDeleteSaved(confirmId)} disabled={deleting} className="btn bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-wait">{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Preview Drawer (Side Modal) */}
      {previewStmt && (
        <StatementInvoiceModal
          statement={previewStmt}
          onClose={() => setPreviewStmt(null)}
        />
      )}
    </div>
  )
}
