import React, { useEffect, useState } from 'react'
import {
  Building2, FileText, IndianRupee, Wallet, Users as UsersIcon,
  ClipboardList, CheckCircle2, Clock, BookUser
} from 'lucide-react'
import { getAllBranchesReport } from '../db/database'
import { useRole } from '../context/RoleContext'

const rupee = (v) => '₹' + Number(v || 0).toLocaleString('en-IN')

function StatCard({ label, value, icon: Icon, sub }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Icon size={20} className="text-slate-700" />
      </div>
      <div className="text-[1.65rem] font-bold text-slate-900 tracking-tight leading-none mb-1.5">{value}</div>
      {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
    </div>
  )
}

// Admin-only overview of EVERY branch at once. Lives outside <BranchGate> so it
// works precisely when the admin is on "All Branches". Each row is one branch;
// the last row is the combined grand total.
export default function AllBranchesReport() {
  const { switchBranch } = useRole()
  const [data, setData] = useState({ perBranch: [], total: null, branchCount: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getAllBranchesReport()
      .then(d => { if (active) setData(d) })
      .catch(() => { /* ignore — empty state shows */ })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const { perBranch, total } = data

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
      <div className="spinner" />
      <div className="text-slate-500 text-sm">Loading report…</div>
    </div>
  )

  return (
    <div className="p-6">
      {/* Title */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Building2 size={22} className="text-primary-600" /> All Branches Report
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Combined view across every branch. To work inside one branch, pick it from the switcher in the header.
        </p>
      </div>

      {/* Grand totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <StatCard label="Total Revenue" value={rupee(total?.totalRevenue)} icon={IndianRupee} sub="All branches" />
        <StatCard label="Paid Amount" value={rupee(total?.paidAmount)} icon={CheckCircle2} sub="Received" />
        <StatCard label="TBB Amount" value={rupee(total?.tbbAmount)} icon={BookUser} sub="To be billed" />
        <StatCard label="Balance Due" value={rupee(total?.balanceDue)} icon={Wallet} sub="Outstanding" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="All Orders (LR)" value={total?.totalLR || 0} icon={FileText} sub="Across branches" />
        <StatCard label="Challans" value={total?.totalChallans || 0} icon={ClipboardList} sub="All loading sheets" />
        <StatCard label="Customers" value={total?.totalCustomers || 0} icon={UsersIcon} sub="All parties" />
        <StatCard label="To Pay Orders" value={total?.toPayLR || 0} icon={Clock} sub="Pay at destination" />
      </div>

      {/* Per-branch breakdown */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Building2 size={15} /> Branch-wise Breakdown</span>
          <span className="text-xs text-slate-400">{perBranch.length} branches</span>
        </div>
        <div className="overflow-x-auto">
          {perBranch.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Building2 size={28} className="mx-auto mb-3 opacity-40" />
              <p className="text-xs">No branches yet.</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Branch', 'LR Orders', 'Revenue', 'Paid', 'TBB', 'Balance Due', 'Challans', 'Customers', ''].map(h => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perBranch.map(b => (
                  <tr key={b.branchId ?? 'none'} className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3.5 py-2.5">
                      <div className="font-semibold text-slate-800">{b.branchName}</div>
                      {b.branchCode && <div className="text-[10px] text-slate-400">{b.branchCode}</div>}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-700">{b.totalLR}</td>
                    <td className="px-3.5 py-2.5 font-semibold text-slate-800">{rupee(b.totalRevenue)}</td>
                    <td className="px-3.5 py-2.5 text-green-700">{rupee(b.paidAmount)}</td>
                    <td className="px-3.5 py-2.5 text-blue-700">{rupee(b.tbbAmount)}</td>
                    <td className="px-3.5 py-2.5 text-red-600 font-medium">{rupee(b.balanceDue)}</td>
                    <td className="px-3.5 py-2.5 text-slate-700">{b.totalChallans}</td>
                    <td className="px-3.5 py-2.5 text-slate-700">{b.totalCustomers}</td>
                    <td className="px-3.5 py-2.5">
                      {b.branchId != null && (
                        <button
                          onClick={() => switchBranch(b.branchId)}
                          className="btn btn-outline text-[11px] py-1 px-2.5">
                          Open
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {total && (
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-800">
                    <td className="px-3.5 py-2.5">Total</td>
                    <td className="px-3.5 py-2.5">{total.totalLR}</td>
                    <td className="px-3.5 py-2.5">{rupee(total.totalRevenue)}</td>
                    <td className="px-3.5 py-2.5 text-green-700">{rupee(total.paidAmount)}</td>
                    <td className="px-3.5 py-2.5 text-blue-700">{rupee(total.tbbAmount)}</td>
                    <td className="px-3.5 py-2.5 text-red-600">{rupee(total.balanceDue)}</td>
                    <td className="px-3.5 py-2.5">{total.totalChallans}</td>
                    <td className="px-3.5 py-2.5">{total.totalCustomers}</td>
                    <td className="px-3.5 py-2.5"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-400 mt-3">
        Tip: click <span className="font-semibold text-slate-500">Open</span> on a branch to switch into it and manage its bills, customers and challans.
      </p>
    </div>
  )
}
