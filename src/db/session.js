// src/db/session.js
// Caches the signed-in user's profile (role + branch) so the data layer and UI
// can read it synchronously without hitting the network on every call.
//
// The profile is loaded once right after login (loadProfile) and cleared on
// logout (clearProfile). database.js stamps every insert with currentBranchId()
// so the row passes the Row Level Security branch check.
import { supabase } from './supabaseClient'

let profile = null   // { id, full_name, role, branch_id, is_active } | null

// Fetch the current user's profile from the `profiles` table and cache it.
// Call this after a successful sign-in (and on app boot if a session exists).
export async function loadProfile() {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth?.user?.id
  if (!uid) { profile = null; return null }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, branch_id, is_active')
    .eq('id', uid)
    .single()

  if (error) { profile = null; return null }
  profile = data
  return profile
}

// Clear the cache on logout.
export function clearProfile() { profile = null }

// Synchronous accessors (safe to call anywhere once loadProfile has resolved).
export function getProfile()      { return profile }
export function currentRole()     { return profile?.role || null }
export function currentBranchId() { return profile?.branch_id ?? null }
export function currentUserId()   { return profile?.id || null }

// Role helpers for gating UI and actions.
export function isAdmin()    { return currentRole() === 'admin' }
export function isSubAdmin() { return currentRole() === 'sub_admin' }
export function isStaff()    { return currentRole() === 'staff' }

// Can this user manage other users? admin + sub_admin (sub_admin → staff only).
export function canManageUsers()    { return isAdmin() || isSubAdmin() }
// Can this user manage branches? admin only.
export function canManageBranches() { return isAdmin() }
// Can this user delete records? staff cannot.
export function canDelete()         { return isAdmin() || isSubAdmin() }
