import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ArrowRight, UserCog, BarChart3, Plus, Lock } from 'lucide-react'
import { useRole } from '../context/RoleContext'
import { COMPANY } from '../config/company'

// Admin landing page (shown instead of the dashboard right after an admin logs
// in). Two parts: every branch as a card to "enter" (which sets the active
// branch and opens that branch's dashboard), and an Administration block that
// links to the manage-branches / manage-users / all-branches screens.
//
// Not wrapped in <BranchGate> — this is the page an admin sees *before* picking
// a branch, so it must render on "All Branches".
export default function AdminHome({ onLock }) {
  const navigate = useNavigate()
  const { branches, switchBranch, profile } = useRole()

  // Enter a branch: make it the active branch, then open its dashboard.
  const enterBranch = async (id) => {
    await switchBranch(id)
    navigate('/dashboard')
  }

  const adminLinks = [
    { to: '/branches',     icon: Building2, label: 'Manage Branches', desc: 'Create, edit or remove branches' },
    { to: '/users',        icon: UserCog,   label: 'Manage Users',    desc: 'Add admins, sub-admins and staff' },
    { to: '/all-branches', icon: BarChart3, label: 'All Branches Report', desc: 'Combined overview of every branch' },
  ]

  return (
    <div className="h-screen overflow-y-auto bg-slate-100">
      {/* Standalone top bar — no app header/sidebar on this screen. */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 h-14">
          <div className="flex items-center gap-3">
            {COMPANY.logoDataUrl ? (
              <img src={COMPANY.logoDataUrl} alt={COMPANY.short} className="w-9 h-9 rounded-lg object-contain shrink-0" />
            ) : (
              <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center text-white shrink-0 font-black text-xs tracking-tighter">
                {COMPANY.short}
              </div>
            )}
            <div className="flex flex-col leading-tight">
              <span className="text-[14px] font-bold text-slate-900 tracking-tight">Hariom Transport</span>
              <span className="text-[11px] font-semibold text-slate-400 tracking-wide">
                {profile?.full_name ? `Signed in as ${profile.full_name}` : 'Admin control center'}
              </span>
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

      <div className="p-6 max-w-5xl mx-auto">
      {/* Branches */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Your Branches</h1>
            <p className="text-xs text-slate-500 mt-0.5">Open a branch to work in it. You can switch any time from the header.</p>
          </div>
          <button onClick={() => navigate('/branches')} className="btn btn-primary flex items-center gap-1.5">
            <Plus size={15} /> New Branch
          </button>
        </div>

        {branches.length === 0 ? (
          <div className="card text-center py-14 text-slate-400">
            <Building2 size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No branches yet.</p>
            <button onClick={() => navigate('/branches')} className="btn btn-outline mt-3">Create your first branch</button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {branches.map(b => (
              <button key={b.id} onClick={() => enterBranch(b.id)}
                className="group text-left bg-white border border-slate-200 rounded-xl p-4 shadow-sm
                           hover:border-primary-300 hover:shadow-md transition-all">
                <div className="flex items-start justify-between">
                  <div className="w-11 h-11 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center font-bold text-sm shrink-0">
                    {(b.code || b.name || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <ArrowRight size={16} className="text-slate-300 group-hover:text-primary-600 transition-colors mt-1" />
                </div>
                <div className="mt-3">
                  <div className="font-bold text-slate-900 leading-tight">{b.name}</div>
                  {b.code && <div className="text-[11px] font-semibold text-slate-400 mt-0.5">{b.code}</div>}
                  {b.address && <div className="text-xs text-slate-500 mt-1 line-clamp-2">{b.address}</div>}
                </div>
                {b.is_active === false && (
                  <span className="inline-block mt-2 badge badge-gray">Inactive</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Administration */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 tracking-tight mb-1">Administration</h2>
        <p className="text-xs text-slate-500 mb-4">Manage the whole company from here.</p>
        <div className="grid grid-cols-3 gap-4">
          {adminLinks.map(l => (
            <button key={l.to} onClick={() => navigate(l.to)}
              className="group text-left bg-white border border-slate-200 rounded-xl p-4 shadow-sm
                         hover:border-primary-300 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center
                              group-hover:bg-primary-50 group-hover:text-primary-600 transition-colors">
                <l.icon size={18} />
              </div>
              <div className="mt-3 font-bold text-slate-900 leading-tight">{l.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{l.desc}</div>
            </button>
          ))}
        </div>
      </div>
      </div>
    </div>
  )
}
