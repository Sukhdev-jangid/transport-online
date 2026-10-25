// src/context/RoleContext.jsx
// Loads the signed-in user's profile (role + branch) once after login and makes
// it available to the whole app. Also mirrors it into the session cache
// (src/db/session.js) so the data layer can stamp branch_id synchronously.
import React, { createContext, useContext, useEffect, useState } from 'react'
import { loadProfile, clearProfile } from '../db/session'
import { reloadDatabase } from '../db/database'

const RoleContext = createContext(null)

export function RoleProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    const p = await loadProfile()
    setProfile(p)
    // Now that we know the branch, re-load company branding for THAT branch
    // (boot-time load ran before the profile existed, so it used defaults).
    if (p) { try { await reloadDatabase() } catch (_) {} }
    setLoading(false)
    return p
  }

  useEffect(() => { refresh() }, [])

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
    clear: () => { clearProfile(); setProfile(null) },
  }

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

// Hook for any component that needs the current role/branch.
export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole must be used inside <RoleProvider>')
  return ctx
}
