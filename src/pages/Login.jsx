import React, { useState } from 'react'
import { Lock, Eye, EyeOff, Mail, ShieldCheck } from 'lucide-react'
import { COMPANY } from '../config/company'
import { signIn, resetPassword } from '../db/auth'

// The login gate, backed by Supabase Auth. Two modes:
//   'enter'   — sign in with email + password
//   'forgot'  — send a password-reset email
// There is no in-app sign-up: accounts are created by an admin (User
// Management) or in the Supabase dashboard. Public sign-up is disabled.
export default function Login({ onUnlock }) {
  const [mode, setMode] = useState('enter')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')   // success/info message (e.g. "check your email")

  const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim())

  const submitEnter = async (e) => {
    e.preventDefault()
    setError(''); setNotice('')
    if (!validEmail(email)) { setError('Enter a valid email address.'); return }
    setBusy(true)
    try {
      const res = await signIn(email, pw)
      if (res.ok) onUnlock()
      else setError(res.error || 'Wrong email or password.')
    } catch (err) {
      setError('Login failed: ' + err.message)
    }
    setBusy(false)
  }

  const submitForgot = async (e) => {
    e.preventDefault()
    setError(''); setNotice('')
    if (!validEmail(email)) { setError('Enter a valid email address.'); return }
    setBusy(true)
    try {
      const res = await resetPassword(email)
      if (res.ok) {
        setNotice('Password reset link sent. Check your email.')
        setMode('enter')
      } else setError(res.error)
    } catch (err) {
      setError('Reset failed: ' + err.message)
    }
    setBusy(false)
  }

  const title = mode === 'forgot' ? 'Reset password' : 'Welcome back'
  const subtitle = mode === 'forgot'
    ? 'Enter your email and we will send you a reset link.'
    : 'Sign in with your email to open the Transport System.'

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
      </div>

      {notice && (
        <div className="mb-4 flex items-start gap-1.5 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
          <ShieldCheck size={14} className="shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {/* ENTER mode */}
      {mode === 'enter' && (
        <form onSubmit={submitEnter} className="space-y-3">
          <EmailField value={email} onChange={setEmail} autoFocus />
          <PasswordField value={pw} onChange={setPw} show={show} setShow={setShow} placeholder="Password" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition disabled:opacity-50">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="flex items-center justify-end">
            <button type="button" onClick={() => { setMode('forgot'); setError(''); setNotice(''); setPw('') }}
              className="text-xs text-slate-500 hover:text-primary-600">
              Forgot password?
            </button>
          </div>
        </form>
      )}

      {/* FORGOT mode */}
      {mode === 'forgot' && (
        <form onSubmit={submitForgot} className="space-y-3">
          <EmailField value={email} onChange={setEmail} autoFocus />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition disabled:opacity-50">
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <button type="button" onClick={() => { setMode('enter'); setError(''); setNotice('') }}
            className="w-full text-center text-xs text-slate-500 hover:text-primary-600">
            Back to sign in
          </button>
        </form>
      )}
    </Shell>
  )
}

// Two-pane shell: left = brand panel, right = the form. Stacks on small screens.
function Shell({ children }) {
  return (
    <div className="flex h-screen font-sans bg-white">
      {/* LEFT — branding (hidden on small screens) */}
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-slate-900 text-white">
        {/* soft decorative blobs */}
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-white/5 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            {COMPANY.logoDataUrl ? (
              <img src={COMPANY.logoDataUrl} alt={COMPANY.short} className="w-14 h-14 rounded-xl object-contain" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-white/90 text-primary-700 flex items-center justify-center font-black">
                {COMPANY.short}
              </div>
            )}
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-white/70">{COMPANY.short}</div>
              <div className="text-sm font-medium text-white/90">{COMPANY.shortLabel}</div>
            </div>
          </div>

          <div>
            <h2 className="text-3xl font-black leading-tight">{COMPANY.name}</h2>
            {COMPANY.tagline && (
              <p className="mt-4 text-sm text-white/80 leading-relaxed max-w-md">{COMPANY.tagline}</p>
            )}
          </div>

          <div className="text-xs text-white/60 space-y-1">
            {COMPANY.address && <p>{COMPANY.address}</p>}
            {Array.isArray(COMPANY.phones) && COMPANY.phones.length > 0 && (
              <p>Ph: {COMPANY.phones.join(', ')}</p>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT — form */}
      <div className="flex w-full md:w-1/2 items-center justify-center p-6 sm:p-12 bg-slate-50">
        {/* small-screen logo (brand panel is hidden) */}
        <div className="w-full max-w-md">
          <div className="md:hidden flex justify-center mb-6">
            {COMPANY.logoDataUrl ? (
              <img src={COMPANY.logoDataUrl} alt={COMPANY.short} className="w-14 h-14 rounded-xl object-contain" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-primary-600 text-white flex items-center justify-center font-black">
                {COMPANY.short}
              </div>
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

function EmailField({ value, onChange, autoFocus }) {
  return (
    <div className="relative">
      <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="email"
        value={value}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        placeholder="Email address"
        autoComplete="email"
        className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/10"
      />
    </div>
  )
}

function PasswordField({ value, onChange, show, setShow, placeholder }) {
  return (
    <div className="relative">
      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-10 py-2.5 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/10"
      />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}
