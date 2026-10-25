import React, { useState, useEffect } from 'react'
import { User, Mail, ShieldCheck, Building2, KeyRound, Eye, EyeOff } from 'lucide-react'
import { useRole } from '../context/RoleContext'
import { getEmail, changePassword } from '../db/auth'
import { getBranches } from '../db/admin'

const ROLE_LABELS = { admin: 'Admin', sub_admin: 'Sub-Admin', staff: 'Staff' }
const ROLE_BADGE = { admin: 'badge-green', sub_admin: 'badge-blue', staff: 'badge-gray' }

export default function Profile() {
  const { profile, role, branchId } = useRole()

  const [email, setEmail] = useState('')
  const [branchName, setBranchName] = useState('')
  const [toast, setToast] = useState(null)

  // Change-password form
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [nw2, setNw2] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const [em, branches] = await Promise.all([getEmail(), getBranches()])
      if (!active) return
      setEmail(em || '')
      const b = branches.find(x => x.id === branchId)
      setBranchName(b ? `${b.name}${b.code ? ` (${b.code})` : ''}` : '—')
    })().catch(() => {})
    return () => { active = false }
  }, [branchId])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (saving) return
    if (!cur) { showToast('Enter your current password.', 'error'); return }
    if (nw.length < 6) { showToast('New password must be at least 6 characters.', 'error'); return }
    if (nw !== nw2) { showToast('New passwords do not match.', 'error'); return }
    setSaving(true)
    try {
      const res = await changePassword(cur, nw)
      if (res.ok) {
        showToast('✓ Password changed!')
        setCur(''); setNw(''); setNw2('')
      } else {
        showToast(res.error || 'Could not change password', 'error')
      }
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setSaving(false) }
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">My Profile</h1>
        <p className="text-xs text-slate-500 mt-0.5">Your account details and password.</p>
      </div>

      {/* Account details */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title"><User size={15} /> Account Details</span>
        </div>
        <div className="p-5 grid grid-cols-2 gap-5">
          <Field icon={User} label="Full Name" value={profile?.full_name || '—'} />
          <Field icon={Mail} label="Email" value={email || '—'} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1.5">
              <ShieldCheck size={12} /> Role
            </p>
            <span className={`badge ${ROLE_BADGE[role] || 'badge-gray'} inline-flex items-center gap-1`}>
              {role === 'admin' && <ShieldCheck size={11} />}{ROLE_LABELS[role] || role || '—'}
            </span>
          </div>
          <Field icon={Building2} label="Branch" value={branchName} />
        </div>
      </div>

      {/* Change password */}
      <div className="card max-w-lg">
        <div className="card-header">
          <span className="card-title"><KeyRound size={15} /> Change Password</span>
        </div>
        <form onSubmit={handleChangePassword} className="p-5 space-y-3">
          <div>
            <label className="form-label">Current Password</label>
            <div className="relative">
              <input className="form-input pr-10" type={show ? 'text' : 'password'} value={cur}
                onChange={e => setCur(e.target.value)} placeholder="Current password" />
            </div>
          </div>
          <div>
            <label className="form-label">New Password</label>
            <input className="form-input" type={show ? 'text' : 'password'} value={nw}
              onChange={e => setNw(e.target.value)} placeholder="At least 6 characters" />
          </div>
          <div>
            <label className="form-label">Confirm New Password</label>
            <div className="relative">
              <input className="form-input pr-10" type={show ? 'text' : 'password'} value={nw2}
                onChange={e => setNw2(e.target.value)} placeholder="Re-type new password" />
              <button type="button" onClick={() => setShow(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-primary disabled:opacity-60 disabled:cursor-wait" disabled={saving}>
            {saving ? 'Saving…' : 'Change Password'}
          </button>
        </form>
      </div>

      {toast && (
        <div className={`fixed bottom-5 left-5 px-4 py-2.5 rounded-lg text-white text-xs font-semibold shadow-lg toast-anim
          ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{toast.msg}</div>
      )}
    </div>
  )
}

function Field({ icon: Icon, label, value }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1.5">
        <Icon size={12} /> {label}
      </p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}
