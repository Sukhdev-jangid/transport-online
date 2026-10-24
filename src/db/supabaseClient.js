// src/db/supabaseClient.js
// Single shared Supabase client for the whole app.
//
// Credentials come from the build-time env (.env → Vite's import.meta.env).
// They are the public URL + anon/publishable key, which are safe to ship in
// the client bundle. Row Level Security on the database is what actually
// protects the data — never put the service_role key here.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Fail loudly during development/build so a missing .env is obvious instead
  // of producing confusing "fetch failed" errors deep inside the app.
  // eslint-disable-next-line no-console
  console.error(
    'Supabase env missing: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  )
}

export const supabase = createClient(url || '', anonKey || '', {
  auth: {
    // Keep the user signed in across app restarts (session stored in
    // localStorage) and refresh the token automatically.
    persistSession: true,
    autoRefreshToken: true,
  },
})
