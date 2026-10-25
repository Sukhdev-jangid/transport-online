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
      <div className="text-center mb-5">
        {COMPANY.logoDataUrl ? (
          <img src={COMPANY.logoDataUrl} alt={COMPANY.short} className="mx-auto w-12 h-12 rounded-lg object-contain mb-3" />
        ) : (
          <div className="mx-auto w-12 h-12 rounded-lg bg-primary-600 flex items-center justify-center text-white font-black text-sm mb-3">
            {COMPANY.short}
          </div>
        )}
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
      </div>

      {notice && (
        <div className="mb-3 flex items-start gap-1.5 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
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

function Shell({ children }) {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-100 font-sans">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-xl">
        {children}
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
