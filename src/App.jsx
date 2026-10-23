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
import Login from './pages/Login'
import { initDatabase, isPasswordSet } from './db/database'

export default function App() {
  const location = useLocation()
  const [dbReady, setDbReady] = useState(false)
  const [error, setError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [needsSetup, setNeedsSetup] = useState(false)   // true on first run (no password yet)
  const [unlocked, setUnlocked] = useState(false)       // true once the correct password is entered

  useEffect(() => {
    initDatabase()
      .then(() => {
        setNeedsSetup(!isPasswordSet())
        setDbReady(true)
      })
      .catch(err => setError(err.message))
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

  if (!dbReady) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 font-sans bg-white">
      <div className="spinner" />
      <div className="text-slate-500 text-sm font-medium">
        Transport System Loading...
      </div>
    </div>
  )

  // Gate the whole app behind the password (set it on first run).
  if (!unlocked) return (
    <Login needsSetup={needsSetup} onUnlock={() => setUnlocked(true)} />
  )

  return (
    <Layout onLock={() => setUnlocked(false)}>
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
          boundary — one broken page never permanently breaks the whole app. */}
      <ErrorBoundary key={location.pathname}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/lr-entry" element={<LREntry />} />
          <Route path="/lr-entry/:lrNumber" element={<LREntry />} />
          <Route path="/bilty" element={<Bilty />} />
          <Route path="/bilty/:lrNumber" element={<BillDetail />} />
          <Route path="/challans" element={<Challans />} />
          <Route path="/statements" element={<Statements />} />
          <Route path="/item-rates" element={<ItemRates />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/all-drivers" element={<AllDrivers />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerAccount />} />
          <Route path="/settings" element={<CompanySettings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ErrorBoundary>
    </Layout>
  )
}
