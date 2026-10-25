import React, { useState, useEffect } from 'react'
import { Plus, UserCog, Pencil, Trash2, X, RefreshCw, ShieldCheck } from 'lucide-react'
import { getUsers, createUser, updateUser, deleteUser, getBranches } from '../db/admin'
import { useRole } from '../context/RoleContext'

const ROLE_LABELS = { admin: 'Admin', sub_admin: 'Sub-Admin', staff: 'Staff' }
const ROLE_BADGE = { admin: 'badge-green', sub_admin: 'badge-blue', staff: 'badge-gray' }

const emptyForm = () => ({ email: '', password: '', fullName: '', role: 'staff', branchId: '' })

export default function UsersPage() {
  const { isAdmin, isSubAdmin, branchId: myBranchId, profile } = useRole()

  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [editId, setEditId] = useState(null)      // profile id being edited (null = create mode)
  const [confirmDel, setConfirmDel] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Roles this user is allowed to assign. Sub-admin → staff only.
  const assignableRoles = isAdmin ? ['admin', 'sub_admin', 'staff'] : ['staff']

  const load = async () => {
    const [u, b] = await Promise.all([getUsers(), isAdmin ? getBranches() : Promise.resolve([])])
    setUsers(u)
    setBranches(b)
  }
  useEffect(() => { load() }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }
  const resetForm = () => { setForm(emptyForm()); setEditId(null) }

  const branchName = (id) => branches.find(b => b.id === id)?.name
    || users.find(u => u.branch_id === id)?.branch_name || '—'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return
    if (!form.fullName.trim()) { showToast('Full name is required!', 'error'); return }

    if (editId) {
      // Edit: name / role / branch / active (no password change here).
      setSaving(true)
      try {
        const updated = await updateUser(editId, {
          fullName: form.fullName,
          role: form.role,
          branchId: isAdmin ? Number(form.branchId) || null : myBranchId,
        })
        setUsers(updated)
        showToast('✓ User updated!')
        resetForm()
      } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setSaving(false) }
      return
    }

    // Create: email + password required.
    if (!form.email.trim()) { showToast('Email is required!', 'error'); return }
    if ((form.password || '').length < 6) { showToast('Password must be at least 6 characters!', 'error'); return }
    if (isAdmin && !form.branchId) { showToast('Please select a branch!', 'error'); return }

    setSaving(true)
    try {
      await createUser({
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        role: form.role,
        branchId: isAdmin ? Number(form.branchId) : myBranchId,
      })
      await load()
      showToast('✓ User created! They can log in with that email and password.')
      resetForm()
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setSaving(false) }
  }

  const startEdit = (u) => {
    setEditId(u.id)
    setForm({
      email: '', password: '',
      fullName: u.full_name || '',
      role: u.role,
      branchId: u.branch_id ? String(u.branch_id) : '',
    })
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const doDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      setUsers(await deleteUser(confirmDel.id))
      showToast('✓ User removed')
      if (editId === confirmDel.id) resetForm()
      setConfirmDel(null)
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setDeleting(false) }
  }

  const isSelf = (u) => u.id === profile?.id

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">User Management</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {isAdmin
            ? 'Create and manage admins, sub-admins, and staff across all branches.'
            : 'Create and manage staff for your branch.'}
        </p>
      </div>

      {/* Add / Edit Form */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">
            {editId ? <><Pencil size={15} /> Edit User</> : <><Plus size={15} /> Add User</>}
          </span>
          {editId && (
            <button onClick={resetForm} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
              <X size={12} /> Cancel edit
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} className="p-5">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="form-label">Full Name *</label>
              <input className="form-input" type="text" placeholder="e.g. Ramesh Kumar" required
                value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
            </div>

            {!editId && (
              <>
                <div>
                  <label className="form-label">Email *</label>
                  <input className="form-input" type="email" placeholder="user@example.com" required
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Password *</label>
                  <input className="form-input" type="text" placeholder="At least 6 characters" required
                    value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              </>
            )}

            <div>
              <label className="form-label">Role *</label>
              <select className="form-input" value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                disabled={assignableRoles.length === 1}>
                {assignableRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              {isSubAdmin && <p className="text-[10px] text-slate-400 mt-1">Sub-admins can only create staff.</p>}
            </div>

            {isAdmin && (
              <div>
                <label className="form-label">Branch *</label>
                <select className="form-input" value={form.branchId}
                  onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))}>
                  <option value="">Select branch…</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary disabled:opacity-60 disabled:cursor-wait" disabled={saving}>
              {saving ? 'Saving…' : (editId ? 'Update User' : 'Create User')}
            </button>
            <button type="button" className="btn btn-outline" onClick={resetForm} disabled={saving}>Reset</button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><UserCog size={15} /> All Users</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{users.length} users</span>
            <button onClick={load} title="Refresh"
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {users.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <UserCog size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No users yet.</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['#','Name','Role','Branch','Status','Actions'].map(h => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3.5 py-2.5 text-slate-400">{i + 1}</td>
                    <td className="px-3.5 py-2.5 font-semibold text-slate-800">
                      {u.full_name || '—'}
                      {isSelf(u) && <span className="ml-1.5 text-[10px] text-slate-400">(you)</span>}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className={`badge ${ROLE_BADGE[u.role] || 'badge-gray'} inline-flex items-center gap-1`}>
                        {u.role === 'admin' && <ShieldCheck size={11} />}{ROLE_LABELS[u.role] || u.role}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600">{u.branch_name || branchName(u.branch_id)}</td>
                    <td className="px-3.5 py-2.5">
                      <span className={`badge ${u.is_active ? 'badge-green' : 'badge-gray'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(u)} title="Edit"
                          className="p-1.5 rounded border border-slate-200 text-blue-600 hover:bg-blue-50 transition">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setConfirmDel(u)} title="Delete" disabled={isSelf(u)}
                          className="p-1.5 rounded border border-slate-200 text-red-500 hover:bg-red-50 transition disabled:opacity-30 disabled:cursor-not-allowed">
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
      </div>

      {/* Delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-5 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">Remove user?</h3>
            <p className="text-xs text-slate-500">
              "<span className="font-semibold text-slate-700">{confirmDel.full_name}</span>" will lose access permanently. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDel(null)} className="btn btn-outline py-1 px-3" disabled={deleting}>Cancel</button>
              <button onClick={doDelete} disabled={deleting} className="btn py-1 px-3 bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-wait">{deleting ? 'Removing…' : 'Remove'}</button>
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
