// supabase/functions/admin-delete-user/index.ts
//
// Deletes a user (auth account + profile row) on behalf of an admin, or a
// sub-admin removing a staff member in their own branch. The profile row is
// removed by the auth-user cascade (profiles.id references auth.users ON DELETE
// CASCADE).
//
// Deploy: supabase functions deploy admin-delete-user
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
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim()
  if (!token) return json({ error: 'Not authenticated' }, 401)

  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) return json({ error: 'Invalid session' }, 401)
  const callerId = userData.user.id

  const { data: caller } = await admin
    .from('profiles').select('role, branch_id').eq('id', callerId).single()
  if (!caller) return json({ error: 'Profile not found' }, 403)

  let payload: Record<string, unknown>
  try { payload = await req.json() } catch { return json({ error: 'Bad request body' }, 400) }
  const targetId = String(payload.user_id || '').trim()
  if (!targetId) return json({ error: 'user_id is required' }, 400)
  if (targetId === callerId) return json({ error: 'You cannot delete your own account' }, 400)

  // Load the target's profile to authorize.
  const { data: target } = await admin
    .from('profiles').select('role, branch_id').eq('id', targetId).single()
  if (!target) return json({ error: 'User not found' }, 404)

  if (caller.role === 'sub_admin') {
    if (target.role !== 'staff' || target.branch_id !== caller.branch_id) {
      return json({ error: 'Sub-admin can only remove staff in their own branch' }, 403)
    }
  } else if (caller.role !== 'admin') {
    return json({ error: 'You do not have permission to delete users' }, 403)
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(targetId)
  if (delErr) return json({ error: delErr.message || 'Could not delete user' }, 400)

  return json({ ok: true, id: targetId })
})
