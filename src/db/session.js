// src/db/session.js
// Caches the signed-in user's profile (role + branch) so the data layer and UI
// can read it synchronously without hitting the network on every call.
//
// The profile is loaded once right after login (loadProfile) and cleared on
// logout (clearProfile). database.js stamps every insert with currentBranchId()
// so the row passes the Row Level Security branch check.
import { supabase } from './supabaseClient'

let profile = null   // { id, full_name, role, branch_id, is_active } | null

// The branch an ADMIN is currently working in. Admins own every branch, so they
// pick one from the header switcher: new records are stamped with it and lists
// are filtered to it. `null` means "All Branches" (view everything; new records
// fall back to the admin's own home branch). Ignored for non-admins, who are
// always locked to their single home branch by their profile + RLS.
let activeBranchId = null
const ACTIVE_BRANCH_KEY = 'activeBranchId'

function readStoredActiveBranch() {
  try {
    const raw = localStorage.getItem(ACTIVE_BRANCH_KEY)
    if (raw == null || raw === '' || raw === 'all') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch (_) { return null }
}

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
  // Only admins get a free branch choice; restore their last selection.
  activeBranchId = data?.role === 'admin' ? readStoredActiveBranch() : null
  return profile
}

// Clear the cache on logout.
export function clearProfile() { profile = null; activeBranchId = null }

// Synchronous accessors (safe to call anywhere once loadProfile has resolved).
export function getProfile()      { return profile }
export function currentRole()     { return profile?.role || null }
export function currentUserId()   { return profile?.id || null }

// The user's own (home) branch from their profile.
export function homeBranchId() { return profile?.branch_id ?? null }

// The branch NEW records are stamped with (the write target).
// Admin: the SELECTED branch — `null` when they are on "All Branches", which
// means no branch is chosen, so writes must be blocked (the UI asks them to
// pick one first). Everyone else: always their single home branch.
export function currentBranchId() {
  if (isAdmin()) return activeBranchId   // null => All Branches => no write target
  return homeBranchId()
}

// Branch used only for DISPLAY fallbacks (e.g. which branch's company branding
// to show while an admin is on "All Branches"). Never used to stamp writes.
export function settingsBranchId() {
  return currentBranchId() ?? homeBranchId()
}

// The branch LIST reads are filtered to. `null` = no filter (show all branches)
// — only ever happens for an admin who selected "All Branches".
export function viewBranchId() {
  if (isAdmin()) return activeBranchId   // null => All Branches
  return homeBranchId()
}

// Admin's current switcher selection (null = All Branches).
export function getActiveBranchId() { return activeBranchId }

// Change the admin's active branch. `id` null = All Branches. No effect for
// non-admins. Persists across restarts.
export function setActiveBranch(id) {
  if (!isAdmin()) return
  activeBranchId = id == null ? null : Number(id)
  try {
    if (activeBranchId == null) localStorage.removeItem(ACTIVE_BRANCH_KEY)
    else localStorage.setItem(ACTIVE_BRANCH_KEY, String(activeBranchId))
  } catch (_) { /* storage blocked — selection still held in memory */ }
}

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
