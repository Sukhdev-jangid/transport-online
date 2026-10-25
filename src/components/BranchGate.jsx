// src/components/BranchGate.jsx
// Wraps branch-specific pages (bill list, customer list, vendors, dashboard,
// etc.). An admin owns every branch, so until they pick ONE from the header
// switcher there is no branch to show data for or to save new records into.
// While they are on "All Branches" this shows a prompt instead of the page.
//
// Non-admins are always locked to their single home branch, so the gate is a
// no-op for them and the page renders straight through.
import React from 'react'
import { Building2 } from 'lucide-react'
import { useRole } from '../context/RoleContext'

export default function BranchGate({ children }) {
  const { isAdmin, activeBranch } = useRole()

  const needsBranch = isAdmin && activeBranch == null
  if (!needsBranch) return children

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center text-primary-600 mb-4">
        <Building2 size={26} />
      </div>
      <h2 className="text-lg font-bold text-slate-800">Select a branch</h2>
      <p className="text-sm text-slate-500 mt-1.5 max-w-sm">
        You are viewing <span className="font-semibold text-slate-700">All Branches</span>.
        Choose a branch from the switcher in the header to view its data and create records.
      </p>
      <p className="text-xs text-slate-400 mt-3">
        Branch switcher is at the top of the screen.
      </p>
    </div>
  )
}
