import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Wallet, RefreshCw, ArrowUpRight, ArrowDownLeft, Scale } from 'lucide-react'
import { getAllTransporterBalances } from '../db/database'
import Pagination from '../components/Pagination'

const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')

// Transporter Accounts: every transporter with their net balance in one view —
// who we owe (payable), who owes us (receivable), and the grand totals. The
// pending / outstanding report. Click a row to open the full ledger.
export default function TransporterAccounts() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)

  const load = async () => {
    setLoading(true)
    try { setRows(await getAllTransporterBalances()) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => rows.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.city?.toLowerCase().includes(search.toLowerCase())
  ), [rows, search])

  // Grand totals across all transporters in scope.
  const totals = useMemo(() => filtered.reduce((t, r) => {
    t.payable += r.summary.payable
    t.receivable += r.summary.receivable
    return t
  }, { payable: 0, receivable: 0 }), [filtered])

  useEffect(() => { setPage(0) }, [search, rowsPerPage])
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Transporter Accounts</h1>
        <p className="text-xs text-slate-500 mt-0.5">Net balance with every transporter. Click one to see its full ledger and record a payment.</p>
      </div>

      {/* Grand totals */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <SummaryCard label="We owe (Payable)" value={rupee(totals.payable)} tone="red" icon={<ArrowUpRight size={16} />} />
        <SummaryCard label="They owe us (Receivable)" value={rupee(totals.receivable)} tone="emerald" icon={<ArrowDownLeft size={16} />} />
        <SummaryCard label="Net Position" value={rupee(totals.receivable - totals.payable)}
          tone={totals.receivable - totals.payable >= 0 ? 'emerald' : 'red'} icon={<Scale size={16} />} />
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title"><Wallet size={15} /> All Accounts ({filtered.length})</span>
          <button onClick={load} title="Refresh" className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="form-input pl-8 w-60 py-2" placeholder="Search transporter, city..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">Loading accounts…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Wallet size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No transporters yet. Add one from the Transporters page.</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['#', 'Transporter', 'City', 'Crossings', 'Payable', 'Receivable', 'Net Balance'].map(h => (
                    <th key={h} className={`px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 ${['Payable', 'Receivable', 'Net Balance'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((t, i) => {
                  const s = t.summary
                  return (
                    <tr key={t.id} onClick={() => navigate(`/transporter-accounts/${t.id}`)}
                      className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors cursor-pointer">
                      <td className="px-3.5 py-2.5 text-slate-400">{page * rowsPerPage + i + 1}</td>
                      <td className="px-3.5 py-2.5 font-semibold text-blue-600">{t.name}</td>
                      <td className="px-3.5 py-2.5 text-slate-600">{t.city || '—'}</td>
                      <td className="px-3.5 py-2.5 text-slate-600">{s.crossingCount}</td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums text-red-600">{s.payable > 0 ? rupee(s.payable) : '—'}</td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums text-emerald-600">{s.receivable > 0 ? rupee(s.receivable) : '—'}</td>
                      <td className="px-3.5 py-2.5 text-right">
                        <span className={`font-bold tabular-nums ${s.net > 0 ? 'text-emerald-600' : s.net < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {s.net === 0 ? 'Settled' : rupee(Math.abs(s.net))}
                        </span>
                        {s.net !== 0 && <div className="text-[10px] text-slate-400">{s.netLabel}</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        {filtered.length > 0 && (
          <Pagination total={filtered.length} page={page} rowsPerPage={rowsPerPage}
            onPageChange={setPage} onRowsPerPageChange={setRowsPerPage} />
        )}
      </div>
    </div>
  )
}

const TONES = {
  red:     'bg-red-100 text-red-700',
  emerald: 'bg-emerald-100 text-emerald-700',
}

function SummaryCard({ label, value, tone, icon }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-md mb-2 ${TONES[tone]}`}>{icon}</div>
      <div className={`text-2xl font-bold leading-none ${tone === 'red' ? 'text-red-700' : 'text-emerald-700'}`}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mt-1.5">{label}</div>
    </div>
  )
}
