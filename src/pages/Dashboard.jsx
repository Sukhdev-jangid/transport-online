import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Truck, Plus, FileText, Users, BookUser,
  CheckCircle2, Clock, IndianRupee, Wallet, UserCheck, ClipboardList, FileSpreadsheet
} from 'lucide-react'
import { getDashboardStats, getLREntries } from '../db/database'
import { fmtDate } from '../utils/date'
import { billTotal } from '../utils/billing'

function StatCard({ label, value, icon: Icon, iconBg, iconColor, sub }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm
                    transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Icon size={20} className="text-slate-700" />
      </div>
      <div className="text-[1.65rem] font-bold text-slate-900 tracking-tight leading-none mb-1.5">{value}</div>
      {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalLR: 0, paidLR: 0, toPayLR: 0, tbbLR: 0,
    totalRevenue: 0, paidAmount: 0, tbbAmount: 0, balanceDue: 0,
  })
  const [recentLR, setRecentLR] = useState([])

  useEffect(() => {
    getDashboardStats().then(setStats)
    getLREntries().then(rows => setRecentLR(rows.slice(0, 10)))
  }, [])

  const quickActions = [
    { label: 'Create LR', sub: 'Add a new LR entry', icon: FileText, bg: '#eff6ff', color: '#2563eb', to: '/lr-entry' },
    { label: 'Create Challan', sub: 'New loading sheet', icon: ClipboardList, bg: '#fef2f2', color: '#dc2626', to: '/challans', state: { openNew: true } },
    { label: 'Statements', sub: 'Party bills ledger', icon: FileSpreadsheet, bg: '#f5f3ff', color: '#7c3aed', to: '/statements' },
    { label: 'Bilty Records', sub: 'View & print bills', icon: FileText, bg: '#f0fdf4', color: '#16a34a', to: '/bilty' },
    { label: 'Add Customer', sub: 'Register a client', icon: Users, bg: '#fff7ed', color: '#ea580c', to: '/customers' },
    { label: 'All Vehicles', sub: 'Vehicle list', icon: Truck, bg: '#fdf4ff', color: '#9333ea', to: '/vehicles' },
  ]

  return (
    <div className="p-6">
      {/* Title Bar */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">Hariom Transport and Cargo — here's what's happening with your logistics operations.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/lr-entry" className="btn btn-primary"><Plus size={13} /> New LR Entry</Link>
          <Link to="/challans" state={{ openNew: true }} className="btn btn-outline bg-white"><Plus size={13} /> New Challan</Link>
        </div>
      </div>

      {/* Stats Row 1 — money totals */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <StatCard label="Total Revenue"
          value={'₹' + Number(stats.totalRevenue).toLocaleString('en-IN')}
          icon={IndianRupee} iconBg="#f0fdf4" iconColor="#16a34a" sub="Across all orders" />
        <StatCard label="Total Paid Amount"
          value={'₹' + Number(stats.paidAmount).toLocaleString('en-IN')}
          icon={CheckCircle2} iconBg="#f0fdf4" iconColor="#16a34a" sub="Payment received" />
        <StatCard label="Total TBB Amount"
          value={'₹' + Number(stats.tbbAmount).toLocaleString('en-IN')}
          icon={IndianRupee} iconBg="#eff6ff" iconColor="#2563eb" sub="To be billed" />
        <StatCard label="Total Balance Due"
          value={'₹' + Number(stats.balanceDue).toLocaleString('en-IN')}
          icon={Wallet} iconBg="#fef2f2" iconColor="#dc2626" sub="Outstanding to collect" />
      </div>

      {/* Stats Row 2 — order counts by payment type */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <StatCard label="All Orders (LR)" value={stats.totalLR} icon={FileText} iconBg="#eff6ff" iconColor="#2563eb" sub="All booked receipts" />
        <StatCard label="Paid Orders" value={stats.paidLR} icon={CheckCircle2} iconBg="#f0fdf4" iconColor="#16a34a" sub="Payment received" />
        <StatCard label="To Pay Orders" value={stats.toPayLR} icon={Clock} iconBg="#fefce8" iconColor="#ca8a04" sub="Pay at destination" />
        <StatCard label="TBB Orders" value={stats.tbbLR} icon={BookUser} iconBg="#f5f3ff" iconColor="#7c3aed" sub="To be billed" />
      </div>

      {/* Quick Actions */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Quick Actions</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 divide-x divide-slate-100">
          {quickActions.map(qa => (
            <Link key={qa.label} to={qa.to} state={qa.state}
              className="flex flex-col items-center gap-2 py-5 px-3 hover:bg-slate-50
                         transition-colors no-underline cursor-pointer">
              <qa.icon size={22} className="text-slate-700" />
              <span className="text-[12px] font-semibold text-slate-700 text-center">{qa.label}</span>
              <span className="text-[10px] text-slate-400 text-center -mt-1.5">{qa.sub}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent LR (full width) */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><FileText size={15} /> Recent LR Entries</span>
          <Link to="/lr-entry" className="btn btn-outline text-[11px] py-1 px-2.5">View All</Link>
        </div>
        <div className="overflow-x-auto">
          {recentLR.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <FileText size={28} className="mx-auto mb-3 opacity-40" />
              <p className="text-xs">No LR entries yet. <Link to="/lr-entry" className="text-blue-600">Create first LR →</Link></p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['LR No.', 'Date', 'Route', 'Sender (Consignor)', 'Receiver (Consignee)', 'Total', 'Payment'].map(h => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentLR.map(lr => (
                  <tr key={lr.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3.5 py-2.5 font-semibold text-blue-600 whitespace-nowrap">{lr.lr_number}</td>
                    <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(lr.date)}</td>
                    <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{lr.from_city} → {lr.to_city}</td>
                    <td className="px-3.5 py-2.5 text-slate-700">{lr.consignor}</td>
                    <td className="px-3.5 py-2.5 text-slate-700">{lr.consignee}</td>
                    <td className="px-3.5 py-2.5 font-semibold text-slate-800">₹{billTotal(lr).toLocaleString('en-IN')}</td>
                    <td className="px-3.5 py-2.5">
                      <span className={`badge ${lr.payment_type === 'Paid' ? 'badge-green' : lr.payment_type === 'TBB' ? 'badge-blue' : 'badge-yellow'}`}>
                        {lr.payment_type === 'Paid' ? 'Paid' : lr.payment_type === 'TBB' ? 'TBB' : 'To Pay'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
