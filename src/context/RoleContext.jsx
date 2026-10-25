// src/context/RoleContext.jsx
// Loads the signed-in user's profile (role + branch) once after login and makes
// it available to the whole app. Also mirrors it into the session cache
// (src/db/session.js) so the data layer can stamp branch_id synchronously.
import React, { createContext, useContext, useEffect, useState } from 'react'
import { loadProfile, clearProfile, getActiveBranchId, setActiveBranch } from '../db/session'
import { reloadDatabase } from '../db/database'
import { getBranches } from '../db/admin'

const RoleContext = createContext(null)

export function RoleProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState([])        // admin only: all branches for the switcher
  const [activeBranch, setActiveBranchState] = useState(null) // mirrors session.getActiveBranchId()

  const refresh = async () => {
    setLoading(true)
    const p = await loadProfile()
    setProfile(p)
    setActiveBranchState(getActiveBranchId())
    // Now that we know the branch, re-load company branding for THAT branch
    // (boot-time load ran before the profile existed, so it used defaults).
    if (p) { try { await reloadDatabase() } catch (_) {} }
    // Admins choose which branch to work in, so load the list for the switcher.
    if (p?.role === 'admin') {
      try { setBranches(await getBranches()) } catch (_) { setBranches([]) }
    } else {
      setBranches([])
    }
    setLoading(false)
    return p
  }

  useEffect(() => { refresh() }, [])

  // Switch the admin's active branch. `id` null = All Branches. Re-applies the
  // new branch's company branding. Pages key off `activeBranch` to refetch.
  const switchBranch = async (id) => {
    setActiveBranch(id)
    setActiveBranchState(getActiveBranchId())
    try { await reloadDatabase() } catch (_) {}
  }

  const role = profile?.role || null
  const value = {
    profile,
    loading,
    refresh,
    role,
    branchId: profile?.branch_id ?? null,
    isAdmin: role === 'admin',
    isSubAdmin: role === 'sub_admin',
    isStaff: role === 'staff',
    canManageUsers: role === 'admin' || role === 'sub_admin',
    canManageBranches: role === 'admin',
    canDelete: role === 'admin' || role === 'sub_admin',
    branches,
    activeBranch,          // null = All Branches (admin only)
    switchBranch,
    clear: () => { clearProfile(); setProfile(null); setActiveBranchState(null) },
  }

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

// Hook for any component that needs the current role/branch.
export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole must be used inside <RoleProvider>')
  return ctx
}
