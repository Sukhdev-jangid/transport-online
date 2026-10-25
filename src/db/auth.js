// src/db/auth.js
// Thin wrapper around Supabase Auth (email + password).
//
// Replaces the old local password gate. Sessions are persisted by the Supabase
// client (localStorage), so the user stays logged in across app restarts until
// they sign out.
import { supabase } from './supabaseClient'

// Current session (null if signed out). Resolves immediately from the cached
// session, so App can decide what to render without a flash.
export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session || null
}

// Subscribe to login/logout changes. Returns an unsubscribe function.
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session || null)
  })
  return () => data.subscription.unsubscribe()
}

// Sign in with email + password. Returns { ok, error }.
export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({
    email: (email || '').trim(),
    password,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Create a new account. Depending on the project's email-confirmation setting
// the user may need to confirm via email before they can sign in. Returns
// { ok, needsConfirmation, error }.
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email: (email || '').trim(),
    password,
  })
  if (error) return { ok: false, error: error.message }
  // When email confirmation is ON, Supabase returns a user but no active
  // session until they click the link in their inbox.
  const needsConfirmation = !data.session
  return { ok: true, needsConfirmation }
}

// Send a password-reset email.
export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail((email || '').trim())
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Change the signed-in user's password. Supabase does not require the current
// password here (the active session authorizes the change), but the UI still
// asks for it and we verify by re-authenticating first. Returns { ok, error }.
export async function changePassword(currentPassword, newPassword) {
  const { data } = await supabase.auth.getUser()
  const email = data?.user?.email
  if (!email) return { ok: false, error: 'Not signed in' }

  // Verify the current password by re-signing in.
  const check = await supabase.auth.signInWithPassword({ email, password: currentPassword })
  if (check.error) return { ok: false, error: 'Current password is wrong' }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// The signed-in user's email (null if signed out).
export async function getEmail() {
  const { data } = await supabase.auth.getUser()
  return data?.user?.email || null
}

// Sign out the current user.
export async function signOut() {
  await supabase.auth.signOut()
}
