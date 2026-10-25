import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import Dashboard from './pages/Dashboard'
import LREntry from './pages/LREntry'
import Customers from './pages/Customers'
import CustomerAccount from './pages/CustomerAccount'
import Vehicles from './pages/Vehicles'
import ItemRates from './pages/ItemRates'
import Bilty from './pages/Bilty'
import BillDetail from './pages/BillDetail'
import Challans from './pages/Challans'
import Statements from './pages/Statements'
import Maintenance from './pages/Maintenance'
import AllDrivers from './pages/AllDrivers'
import Locations from './pages/Locations'
import Vendors from './pages/Vendors'
import CompanySettings from './pages/CompanySettings'
import UsersPage from './pages/UsersPage'
import Branches from './pages/Branches'
import Profile from './pages/Profile'
import Login from './pages/Login'
import BranchGate from './components/BranchGate'
import { initDatabase } from './db/database'
import { getSession, onAuthChange, signOut } from './db/auth'
import { RoleProvider, useRole } from './context/RoleContext'
import { clearProfile } from './db/session'

export default function App() {
  const location = useLocation()
  const [dbReady, setDbReady] = useState(false)
  const [error, setError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [authReady, setAuthReady] = useState(false)    // true once the session is resolved
  const [unlocked, setUnlocked] = useState(false)      // true while a Supabase session is active

  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch(err => setError(err.message))
  }, [])

  // Resolve the Supabase session on load and keep it in sync with login/logout
  // (including token refresh and sign-out from another tab/window).
  useEffect(() => {
    let unsub
    getSession()
      .then(session => {
        setUnlocked(!!session)
        setAuthReady(true)
      })
      .catch(() => setAuthReady(true))
    unsub = onAuthChange(session => setUnlocked(!!session))
    return () => { if (unsub) unsub() }
  }, [])

  // A persistent warning if any DB save fails (e.g. disk full or the file was
  // locked by antivirus). Without this, a failed save would be silent and the
  // user would think their data was saved when it wasn't.
  useEffect(() => {
    const onFail = (e) => setSaveError(e.detail || 'Unknown error')
    window.addEventListener('db-save-failed', onFail)
    return () => window.removeEventListener('db-save-failed', onFail)
  }, [])

  if (error) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 font-sans bg-white">
      <AlertTriangle size={40} className="text-red-600" />
      <div className="text-red-600 font-semibold">Database Error</div>
      <div className="text-slate-500 text-sm">{error}</div>
    </div>
  )

  if (!dbReady || !authReady) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 font-sans bg-white">
      <div className="spinner" />
      <div className="text-slate-500 text-sm font-medium">
        Transport System Loading...
      </div>
    </div>
  )

  // Gate the whole app behind a Supabase login (email + password).
  if (!unlocked) return (
    <Login onUnlock={() => setUnlocked(true)} />
  )

  // Once logged in, load the role/branch profile, then render the app.
  return (
    <RoleProvider>
      <AuthedApp
        location={location}
        saveError={saveError}
        setSaveError={setSaveError}
        onLock={() => { clearProfile(); signOut() }}
      />
    </RoleProvider>
  )
}

// The authenticated application. Routes and sidebar are gated by the user's
// role (admin / sub_admin / staff). Staff see booking-only screens.
function AuthedApp({ location, saveError, setSaveError, onLock }) {
  const { loading, role, canManageUsers, canManageBranches, isStaff, activeBranch } = useRole()

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 font-sans bg-white">
      <div className="spinner" />
      <div className="text-slate-500 text-sm font-medium">Loading your profile…</div>
    </div>
  )

  // A signed-in user with no profile row yet (e.g. created in the dashboard but
  // not linked). Block the app with a clear message rather than failing writes.
  if (!role) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 font-sans bg-white px-6 text-center">
      <AlertTriangle size={40} className="text-amber-500" />
      <div className="text-slate-800 font-semibold">Account not set up</div>
      <div className="text-slate-500 text-sm max-w-md">
        Your login works, but no role/branch has been assigned yet. Ask your
        admin to add you, or set your profile in the Supabase dashboard.
      </div>
      <button onClick={onLock} className="btn btn-secondary mt-2">Sign out</button>
    </div>
  )

  return (
    <Layout onLock={onLock}>
      {saveError && (
        <div className="fixed top-0 left-0 right-0 z-[10000] bg-red-600 text-white px-4 py-2.5 text-xs font-semibold flex items-center justify-between shadow-lg">
          <span className="flex items-center gap-1.5">
            <AlertTriangle size={14} className="shrink-0" />
            Save failed — your last change was NOT saved to disk ({saveError}). Close other programs and try again, or restart the app.
          </span>
          <button onClick={() => setSaveError(null)} className="ml-4 shrink-0 underline hover:no-underline">Dismiss</button>
        </div>
      )}
      {/* key on the route so navigating away from a crashed screen resets the
          boundary — one broken page never permanently breaks the whole app.
          Also key on the admin's active branch so switching branches remounts
          every page and they refetch data for the newly selected branch. */}
      <ErrorBoundary key={`${location.pathname}::${activeBranch ?? 'all'}`}>
        <Routes>
          {/* Branch-specific pages are wrapped in <BranchGate>: an admin must
              pick ONE branch from the header switcher before any of these
              render (on "All Branches" they show a "select a branch" prompt).
              Non-admins pass straight through — they have a single branch. */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<BranchGate><Dashboard /></BranchGate>} />
          <Route path="/lr-entry" element={<BranchGate><LREntry /></BranchGate>} />
          <Route path="/lr-entry/:lrNumber" element={<BranchGate><LREntry /></BranchGate>} />
          <Route path="/bilty" element={<BranchGate><Bilty /></BranchGate>} />
          <Route path="/bilty/:lrNumber" element={<BranchGate><BillDetail /></BranchGate>} />
          <Route path="/challans" element={<BranchGate><Challans /></BranchGate>} />
          <Route path="/statements" element={<BranchGate><Statements /></BranchGate>} />

          {/* Masters & settings — hidden from staff (booking-only). */}
          {!isStaff && <Route path="/item-rates" element={<BranchGate><ItemRates /></BranchGate>} />}
          {!isStaff && <Route path="/vehicles" element={<BranchGate><Vehicles /></BranchGate>} />}
          {!isStaff && <Route path="/all-drivers" element={<BranchGate><AllDrivers /></BranchGate>} />}
          {!isStaff && <Route path="/maintenance" element={<BranchGate><Maintenance /></BranchGate>} />}
          {!isStaff && <Route path="/locations" element={<BranchGate><Locations /></BranchGate>} />}
          {!isStaff && <Route path="/vendors" element={<BranchGate><Vendors /></BranchGate>} />}
          <Route path="/customers" element={<BranchGate><Customers /></BranchGate>} />
          <Route path="/customers/:id" element={<BranchGate><CustomerAccount /></BranchGate>} />
          {!isStaff && <Route path="/settings" element={<BranchGate><CompanySettings /></BranchGate>} />}

          {/* Everyone can see & edit their own profile / password. Not branch-
              specific, so NOT gated. */}
          <Route path="/profile" element={<Profile />} />

          {/* User & branch management — admin needs these on "All Branches" to
              create branches in the first place, so they are NOT gated. */}
          {canManageUsers && <Route path="/users" element={<UsersPage />} />}
          {canManageBranches && <Route path="/branches" element={<Branches />} />}

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ErrorBoundary>
    </Layout>
  )
}
