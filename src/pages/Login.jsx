import React, { useState } from 'react'
import { Lock, Eye, EyeOff, KeyRound, ShieldCheck, Copy, Download, Check } from 'lucide-react'
import { COMPANY } from '../config/company'
import { setupPassword, checkPassword, resetPasswordWithRecovery } from '../db/database'

// The login gate. Three modes:
//   'setup'   — first run: owner creates a password (a recovery code is shown once)
//   'enter'   — returning: type the password to unlock
//   'forgot'  — reset the password using the recovery code
export default function Login({ needsSetup, onUnlock }) {
  const [mode, setMode] = useState(needsSetup ? 'setup' : 'enter')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [code, setCode] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [newCode, setNewCode] = useState('')   // recovery code to show once after setup/reset
  const [copied, setCopied] = useState(false)  // brief "Copied!" feedback on the copy button

  // Copy the recovery code to the clipboard, with a short visual confirmation.
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(newCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch (err) { /* clipboard blocked — user can still read/download it */ }
  }

  // Save the recovery code as a small text file so it isn't lost.
  const downloadCode = () => {
    const body = `${COMPANY.name}\nPassword Recovery Code\n\n${newCode}\n\n` +
      `Keep this safe. If you forget your password, this code is the only way to reset it.`
    const blob = new Blob([body], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${COMPANY.short}-recovery-code.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const submitSetup = async (e) => {
    e.preventDefault()
    setError('')
    if (pw.length < 4) { setError('Password must be at least 4 characters.'); return }
    if (pw !== pw2) { setError('Passwords do not match.'); return }
    setBusy(true)
    try {
      const recoveryCode = await setupPassword(pw)
      setNewCode(recoveryCode)   // show the recovery code screen before entering
    } catch (err) {
      setError('Could not set password: ' + err.message)
    }
    setBusy(false)
  }

  const submitEnter = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const ok = await checkPassword(pw)
      if (ok) onUnlock()
      else setError('Wrong password. Try again.')
    } catch (err) {
      setError('Login failed: ' + err.message)
    }
    setBusy(false)
  }

  const submitForgot = async (e) => {
    e.preventDefault()
    setError('')
    if (pw.length < 4) { setError('New password must be at least 4 characters.'); return }
    if (pw !== pw2) { setError('Passwords do not match.'); return }
    setBusy(true)
    try {
      const res = await resetPasswordWithRecovery(code, pw)
      if (res.ok) setNewCode(res.recoveryCode)
      else setError(res.error)
    } catch (err) {
      setError('Reset failed: ' + err.message)
    }
    setBusy(false)
  }

  // After setup/reset: show the recovery code once, then let them in.
  if (newCode) {
    return (
      <Shell>
        <div className="text-center mb-4">
          <div className="mx-auto w-11 h-11 rounded-full bg-green-50 flex items-center justify-center mb-3">
            <ShieldCheck size={22} className="text-green-600" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Save your recovery code</h1>
          <p className="text-xs text-slate-500 mt-1">
            If you ever forget your password, this code is the only way to reset it. Write it down and keep it safe — it won't be shown again.
          </p>
        </div>
        <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-4 text-center">
          <div className="text-xl font-mono font-bold tracking-widest text-slate-800">{newCode}</div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={copyCode}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition
              ${copied
                ? 'border-green-600 bg-green-50 text-green-700'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
            {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy code</>}
          </button>
          <button onClick={downloadCode}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">
            <Download size={14} /> Download
          </button>
        </div>
        <button onClick={onUnlock}
          className="mt-5 w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition">
          I've saved it — Continue
        </button>
      </Shell>
    )
  }

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
        <h1 className="text-lg font-bold text-slate-900">
          {mode === 'setup' ? 'Create a password' : mode === 'forgot' ? 'Reset password' : 'Welcome back'}
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          {mode === 'setup'
            ? 'Set a password to protect this app. Only people with the password can open it.'
            : mode === 'forgot'
              ? 'Enter your recovery code and choose a new password.'
              : 'Enter your password to open the Transport System.'}
        </p>
      </div>

      {/* ENTER mode */}
      {mode === 'enter' && (
        <form onSubmit={submitEnter} className="space-y-3">
          <PasswordField value={pw} onChange={setPw} show={show} setShow={setShow} placeholder="Password" autoFocus />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition disabled:opacity-50">
            {busy ? 'Checking…' : 'Unlock'}
          </button>
          <button type="button" onClick={() => { setMode('forgot'); setError(''); setPw(''); setPw2('') }}
            className="w-full text-center text-xs text-slate-500 hover:text-primary-600">
            Forgot password?
          </button>
        </form>
      )}

      {/* SETUP mode */}
      {mode === 'setup' && (
        <form onSubmit={submitSetup} className="space-y-3">
          <PasswordField value={pw} onChange={setPw} show={show} setShow={setShow} placeholder="New password" autoFocus />
          <PasswordField value={pw2} onChange={setPw2} show={show} setShow={setShow} placeholder="Confirm password" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition disabled:opacity-50">
            {busy ? 'Saving…' : 'Set password'}
          </button>
        </form>
      )}

      {/* FORGOT mode */}
      {mode === 'forgot' && (
        <form onSubmit={submitForgot} className="space-y-3">
          <div className="relative">
            <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={code} onChange={e => setCode(e.target.value)} autoFocus
              placeholder="Recovery code (HTC-XXXX-XXXX)"
              className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-600/10" />
          </div>
          <PasswordField value={pw} onChange={setPw} show={show} setShow={setShow} placeholder="New password" />
          <PasswordField value={pw2} onChange={setPw2} show={show} setShow={setShow} placeholder="Confirm new password" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition disabled:opacity-50">
            {busy ? 'Resetting…' : 'Reset password'}
          </button>
          <button type="button" onClick={() => { setMode('enter'); setError(''); setPw(''); setPw2(''); setCode('') }}
            className="w-full text-center text-xs text-slate-500 hover:text-primary-600">
            Back to login
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

function PasswordField({ value, onChange, show, setShow, placeholder, autoFocus }) {
  return (
    <div className="relative">
      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type={show ? 'text' : 'password'}
        value={value}
        autoFocus={autoFocus}
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
