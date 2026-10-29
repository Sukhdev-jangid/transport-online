import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock } from 'lucide-react'
import { COMPANY } from '../config/company'
import { useRole } from '../context/RoleContext'

// Full-screen chrome for the admin-only management screens (Branches, Users,
// All Branches Report) when reached from Admin Home. No app header or sidebar —
// just a brand bar with a "Back" button to Admin Home and a sign-out button.
export default function AdminShell({ title, onLock, children }) {
  const navigate = useNavigate()
  const { profile } = useRole()

  return (
    <div className="h-screen overflow-y-auto bg-slate-100">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin-home')} title="Back to Admin Home"
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white
                         text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-primary-300 transition cursor-pointer">
              <ArrowLeft size={14} /> Back
            </button>
            <div className="flex items-center gap-2.5">
              {COMPANY.logoDataUrl ? (
                <img src={COMPANY.logoDataUrl} alt={COMPANY.short} className="w-8 h-8 rounded-lg object-contain shrink-0" />
              ) : (
                <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white shrink-0 font-black text-[10px] tracking-tighter">
                  {COMPANY.short}
                </div>
              )}
              <span className="text-sm font-bold text-slate-900 tracking-tight">{title}</span>
            </div>
          </div>
          {onLock && (
            <button onClick={onLock} title="Sign out"
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white
                         text-xs font-semibold text-slate-600 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition cursor-pointer">
              <Lock size={14} /> Sign out
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        {children}
      </div>
    </div>
  )
}
