// supabase/functions/admin-create-user/index.ts
//
// Creates a new auth user + their profile row on behalf of an admin or
// sub-admin, WITHOUT disturbing the caller's own session (which a client-side
// signUp would replace).
//
// Security model:
//   • The caller must send their logged-in JWT (Authorization: Bearer <token>).
//   • We read the caller's profile with the service_role key and verify:
//       - admin      → may create any role in any branch.
//       - sub_admin  → may create ONLY 'staff', and only in their OWN branch.
//       - anyone else → rejected.
//   • The service_role key lives only here on the server. It is never shipped
//     to the desktop app.
//
// Deploy from the Supabase dashboard (Edge Functions → create → paste), or:
//   supabase functions deploy admin-create-user
//
// Required secrets (dashboard → Edge Functions → Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (usually auto-provided)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Admin client (bypasses RLS) — used for all privileged reads/writes.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // 1. Identify the caller from their bearer token.
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return json({ error: 'Not authenticated' }, 401)

  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) return json({ error: 'Invalid session' }, 401)
  const callerId = userData.user.id

  // 2. Load caller's profile (role + branch).
  const { data: caller, error: profErr } = await admin
    .from('profiles')
    .select('role, branch_id')
    .eq('id', callerId)
    .single()
  if (profErr || !caller) return json({ error: 'Profile not found' }, 403)

  // 3. Parse + validate the request.
  let payload: Record<string, unknown>
  try { payload = await req.json() } catch { return json({ error: 'Bad request body' }, 400) }

  const email = String(payload.email || '').trim()
  const password = String(payload.password || '')
  const fullName = String(payload.full_name || '').trim()
  const role = String(payload.role || '').trim()
  let branchId = payload.branch_id as number | null

  if (!email || !password) return json({ error: 'Email and password are required' }, 400)
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400)
  if (!['admin', 'sub_admin', 'staff'].includes(role)) return json({ error: 'Invalid role' }, 400)

  // 4. Authorize by caller role.
  if (caller.role === 'sub_admin') {
    if (role !== 'staff') return json({ error: 'Sub-admin can only create staff users' }, 403)
    branchId = caller.branch_id           // force own branch
  } else if (caller.role !== 'admin') {
    return json({ error: 'You do not have permission to create users' }, 403)
  }
  if (branchId == null) return json({ error: 'A branch is required' }, 400)

  // 5. Create the auth user (email pre-confirmed so they can log in at once).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (createErr || !created?.user) {
    return json({ error: createErr?.message || 'Could not create user' }, 400)
  }

  // 6. Create the matching profile row.
  const { error: insErr } = await admin.from('profiles').insert({
    id: created.user.id,
    full_name: fullName,
    role,
    branch_id: branchId,
    is_active: true,
  })
  if (insErr) {
    // Roll back the auth user so we never leave an account without a profile.
    await admin.auth.admin.deleteUser(created.user.id)
    return json({ error: insErr.message || 'Could not create profile' }, 400)
  }

  return json({ ok: true, id: created.user.id, email, role, branch_id: branchId })
})
