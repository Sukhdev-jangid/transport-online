// src/db/admin.js
// Branch + user (profile) management for admins and sub-admins.
//
// • Branches: admin-only CRUD (enforced by RLS on the `branches` table).
// • Users:    reads come straight from `profiles` (RLS scopes them). Creating a
//             user needs admin privileges on the server, so it goes through the
//             `admin-create-user` Edge Function (service_role, bypasses RLS).
//             Editing role/branch/active and deleting also go through policies.
import { supabase } from './supabaseClient'
import { currentRole, currentBranchId } from './session'

function unwrap({ data, error }) {
  if (error) throw new Error(error.message || 'Request failed')
  return data
}

// ── Branches ──────────────────────────────────────────
export async function getBranches() {
  return unwrap(await supabase.from('branches').select('*').order('name')) || []
}

export async function addBranch({ name, code, address, phone }) {
  unwrap(await supabase.from('branches').insert({
    name: (name || '').trim(),
    code: (code || '').trim(),
    address: (address || '').trim(),
    phone: (phone || '').trim(),
  }))
  return getBranches()
}

export async function updateBranch(id, { name, code, address, phone, isActive }) {
  const patch = {
    name: (name || '').trim(),
    code: (code || '').trim(),
    address: (address || '').trim(),
    phone: (phone || '').trim(),
  }
  if (isActive !== undefined) patch.is_active = Boolean(isActive)
  unwrap(await supabase.from('branches').update(patch).eq('id', id))
  return getBranches()
}

export async function deleteBranch(id) {
  // Will fail if rows still reference the branch (FK) — surfaced as an error.
  unwrap(await supabase.from('branches').delete().eq('id', id))
  return getBranches()
}

// ── Users (profiles) ──────────────────────────────────
// Returns profiles joined with their branch name. RLS decides visibility
// (admin = all, sub_admin = own branch).
export async function getUsers() {
  const rows = unwrap(await supabase
    .from('profiles')
    .select('id, full_name, role, branch_id, is_active, created_at, branches(name, code)')
    .order('created_at', { ascending: false })) || []
  return rows.map(r => ({
    ...r,
    branch_name: r.branches?.name || '',
    branch_code: r.branches?.code || '',
  }))
}

// Create a new user. Admin may pick any role + branch. Sub-admin may ONLY
// create staff, and the branch is forced to their own. Both guards are checked
// again server-side in the Edge Function — this is just UX.
export async function createUser({ email, password, fullName, role, branchId }) {
  const myRole = currentRole()
  if (myRole === 'sub_admin') {
    if (role !== 'staff') throw new Error('Sub-admin can only create staff users.')
    branchId = currentBranchId()
  } else if (myRole !== 'admin') {
    throw new Error('You do not have permission to create users.')
  }

  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: {
      email: (email || '').trim(),
      password,
      full_name: (fullName || '').trim(),
      role,
      branch_id: branchId,
    },
  })
  if (error) {
    // Edge Function returns a JSON { error } body on failure.
    let msg = error.message || 'Could not create user'
    try { const b = await error.context?.json?.(); if (b?.error) msg = b.error } catch (_) {}
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// Update an existing user's role / branch / active flag (admin, or sub-admin
// within own branch for staff). RLS enforces the real boundary.
export async function updateUser(id, { fullName, role, branchId, isActive }) {
  const patch = {}
  if (fullName !== undefined) patch.full_name = (fullName || '').trim()
  if (role !== undefined)     patch.role = role
  if (branchId !== undefined) patch.branch_id = branchId
  if (isActive !== undefined) patch.is_active = Boolean(isActive)
  unwrap(await supabase.from('profiles').update(patch).eq('id', id))
  return getUsers()
}

export async function deleteUser(id) {
  // Removes the profile row. The auth.users row is removed by the Edge Function
  // path when available; here we at least revoke access by deleting the profile.
  const { error } = await supabase.functions.invoke('admin-delete-user', {
    body: { user_id: id },
  })
  if (error) {
    // Fall back to deleting just the profile row (RLS: admin only).
    unwrap(await supabase.from('profiles').delete().eq('id', id))
  }
  return getUsers()
}
