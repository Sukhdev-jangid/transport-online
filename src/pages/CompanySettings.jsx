import React, { useState, useEffect, useRef } from 'react'
import { Save, RotateCcw, Upload, Trash2, Building2, Eye, Database, FolderOpen, HardDriveDownload, HardDriveUpload, Lock, X, Hash, Plus, Printer, Zap } from 'lucide-react'
import { getCompanySettings, saveCompanySettings, getLRNumberSettings, saveLRNumberSettings, peekNextLRNumber, getCurrentMaxLRNumber, getPrinterSettings, savePrinterSettings } from '../db/database'
import { changePassword } from '../db/auth'
import { COMPANY, COMPANY_DEFAULTS } from '../config/company'
import BiltyDocument from '../components/BiltyDocument'
import A5Page from '../components/A5Page'

const fmtSize = (b) => (b > 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB')
const p2 = (n) => String(n).padStart(2, '0')
// Backup timestamps arrive as epoch ms; show them as dd-mm-yyyy hh:mm AM/PM.
const fmtDate = (ms) => {
  const d = new Date(ms)
  if (isNaN(d)) return ''
  let h = d.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(h)}:${p2(d.getMinutes())} ${ampm}`
}

// Turn the live COMPANY object into editable form state (phones as text).
const toForm = (src) => ({
  name: src.name || '',
  short: src.short || '',
  shortLabel: src.shortLabel || '',
  logoDataUrl: src.logoDataUrl || '',
  billLogoDataUrl: src.billLogoDataUrl || '',
  tagline: src.tagline || '',
  proprietor: src.proprietor || '',
  // Offices shown in the bill header (name + phone each). Fall back to old
  // comma-separated phones for bills saved before offices existed.
  offices: (src.offices?.length
    ? src.offices
    : (src.phones || []).map(p => ({ name: '', phone: p }))
  ).map(o => ({ name: o.name || '', phone: o.phone || '' })),
  address: src.address || '',
  tptId: src.tptId || '',
  defaultFrom: src.defaultFrom || '',
  caution: src.caution || '',
  notice: src.notice || '',
  breakageNote: src.breakageNote || '',
})

// Convert form state back into a COMPANY-shaped object. Offices drop any blank
// rows; `phones` is kept in sync (derived from offices) so older code paths that
// still read COMPANY.phones keep working.
const fromForm = (f) => {
  const offices = (f.offices || [])
    .map(o => ({ name: (o.name || '').trim(), phone: (o.phone || '').trim() }))
    .filter(o => o.phone)
  return {
    ...f,
    offices,
    phones: offices.map(o => o.phone),
  }
}

// Sample data so the preview shows a realistic bill.
const SAMPLE_LR = {
  lrNumber: '2400', date: '2026-07-29', fromCity: '', toCity: 'Jaipur',
  consignor: 'Sample Consignor', consignorAddress: 'Sample area, City', consignorPhone: '9876543210',
  consignee: 'Sample Consignee', consigneeAddress: 'Sample area, City', consigneePhone: '9876500000',
  itemsList: [{ itemName: 'Gas Tank', quantity: 1, rate: 1500, totalAmount: 1500 }],
  freight: 1500, bCharge: 10, hamali: 0, pickup: 0, delivery: 0, paymentType: 'ToPay',
}

export default function CompanySettings() {
  const [form, setForm] = useState(toForm(COMPANY))
  const [toast, setToast] = useState(null)
  const [preview, setPreview] = useState(false)
  const [previewClosing, setPreviewClosing] = useState(false)
  const [previewTick, setPreviewTick] = useState(0)

  // Play the slide-out animation, then actually hide the drawer.
  const closePreview = () => {
    if (previewClosing) return
    setPreviewClosing(true)
    setTimeout(() => { setPreview(false); setPreviewClosing(false) }, 260)
  }
  const [backups, setBackups] = useState([])
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwBusy, setPwBusy] = useState(false)
  const [lrForm, setLrForm] = useState({ startNumber: 1 })
  const [nextLR, setNextLR] = useState('')
  const [maxLR, setMaxLR] = useState(0)
  const fileRef = useRef(null)         // app logo (sidebar/login/header) file picker
  const billFileRef = useRef(null)     // bill logo file picker

  const [printerForm, setPrinterForm] = useState({ directPrintEnabled: true, selectedPrinter: '', defaultCopies: 1 })
  const [printers, setPrinters] = useState([])

  useEffect(() => {
    let active = true
    ;(async () => {
      const [saved, lr, next, max, printer] = await Promise.all([
        getCompanySettings(),
        getLRNumberSettings(),
        peekNextLRNumber(),
        getCurrentMaxLRNumber(),
        getPrinterSettings(),
      ])
      if (!active) return
      if (saved) setForm(toForm({ ...COMPANY, ...saved }))
      setLrForm(lr)
      setNextLR(next)
      setMaxLR(max)
      setPrinterForm(printer)
    })()
    if (window.electronAPI?.getPrinters) {
      window.electronAPI.getPrinters().then(list => {
        if (!active) return
        const physical = (list || []).filter(p => !/onenote|fax|xps/i.test(p.name))
        setPrinters(physical)
      }).catch(() => {})
    }
    refreshBackups()
    return () => { active = false }
  }, [])

  const refreshBackups = async () => {
    if (!window.electronAPI?.listBackups) return
    try { setBackups(await window.electronAPI.listBackups()) } catch (e) { /* ignore */ }
  }

  const handleBackupNow = async () => {
    if (!window.electronAPI?.backupNow) { showToast('Backup only works in the desktop app.', 'error'); return }
    const dest = await window.electronAPI.backupNow()
    if (dest) { showToast('✓ Backup saved to TransportBackups folder!'); refreshBackups() }
    else showToast('Could not create backup.', 'error')
  }

  const handleOpenFolder = async () => {
    if (!window.electronAPI?.openBackupFolder) { showToast('Only available in the desktop app.', 'error'); return }
    await window.electronAPI.openBackupFolder()
  }

  const handleRestore = async () => {
    setConfirmRestore(false)
    if (!window.electronAPI?.restoreBackup) { showToast('Only available in the desktop app.', 'error'); return }
    const ok = await window.electronAPI.restoreBackup()
    if (ok) {
      showToast('✓ Backup restored! Reloading…')
      setTimeout(() => window.location.reload(), 1200)
    } else {
      showToast('Restore cancelled.', 'error')
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (pwForm.next.length < 4) { showToast('New password must be at least 4 characters.', 'error'); return }
    if (pwForm.next !== pwForm.confirm) { showToast('New passwords do not match.', 'error'); return }
    setPwBusy(true)
    try {
      const res = await changePassword(pwForm.current, pwForm.next)
      if (res.ok) { showToast('✓ Password changed!'); setPwForm({ current: '', next: '', confirm: '' }) }
      else showToast(res.error, 'error')
    } catch (err) { showToast('Error: ' + err.message, 'error') }
    setPwBusy(false)
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))

  // Office rows (bill header): update one field, add a blank row, remove a row.
  const setOffice = (i, field, value) =>
    setForm(f => ({ ...f, offices: f.offices.map((o, idx) => idx === i ? { ...o, [field]: value } : o) }))
  const addOffice = () =>
    setForm(f => ({ ...f, offices: [...f.offices, { name: '', phone: '' }] }))
  const removeOffice = (i) =>
    setForm(f => ({ ...f, offices: f.offices.filter((_, idx) => idx !== i) }))

  // Read an uploaded image, DOWNSCALE it, and store it as a compact base64 data
  // URL. `field` is 'logoDataUrl' (app logo) or 'billLogoDataUrl' (bill logo).
  //
  // Why downscale: this data URL is embedded in the DB and re-serialised +
  // fsynced on EVERY save (each customer/bill/challan). A big logo would make
  // every save heavy on a slow CPU. We shrink to max 400px on the longest side
  // and re-encode as PNG, so the stored blob stays small regardless of the
  // original file. Transparency is preserved (PNG), so logos look clean on the
  // white bill. Falls back to the raw file only if the image can't be decoded.
  const handleLogo = (field) => (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { showToast('Please choose an image file.', 'error'); return }

    const reader = new FileReader()
    reader.onload = () => {
      const raw = reader.result
      if (typeof raw !== 'string') return

      const img = new Image()
      img.onload = () => {
        try {
          const MAX = 400   // longest side, in px — plenty for a logo
          const scale = Math.min(1, MAX / Math.max(img.width, img.height))
          const w = Math.max(1, Math.round(img.width * scale))
          const h = Math.max(1, Math.round(img.height * scale))
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h)
          const out = canvas.toDataURL('image/png')
          // Guard against a pathologically large result (shouldn't happen after
          // downscale, but never store a multi-hundred-KB blob).
          if (out.length > 500 * 1024) {
            showToast('Logo too large — please use a simpler / smaller image.', 'error')
            return
          }
          set(field, out)
        } catch (err) {
          // Canvas failed for some reason — fall back to the original.
          if (raw.length <= 500 * 1024) set(field, raw)
          else showToast('Logo too large — please use an image under ~350 KB.', 'error')
        }
      }
      img.onerror = () => showToast('Could not read that image. Try another file.', 'error')
      img.src = raw
    }
    reader.readAsDataURL(file)
    e.target.value = ''   // allow re-selecting the same file later
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { showToast('Company name is required!', 'error'); return }
    try {
      const payload = fromForm(form)
      // Never persist a bundled default logo. Its filename is content-hashed by
      // Vite (e.g. htc-Dx9qmbvJ.jpeg) and changes on every rebuild, so a stored
      // path would break after the next build. Only a genuinely uploaded logo (a
      // base64 `data:` URL) is saved; anything else is cleared so the app falls
      // back to the fresh bundled default from src/assets at runtime. Applies to
      // both the app logo and the bill logo.
      if (!payload.logoDataUrl?.startsWith('data:')) payload.logoDataUrl = ''
      if (!payload.billLogoDataUrl?.startsWith('data:')) payload.billLogoDataUrl = ''
      await saveCompanySettings(payload)
      setPreviewTick(t => t + 1)   // force preview to re-render with new values
      showToast('✓ Company settings saved! Bills will use these details.')
    } catch (err) { showToast('Error: ' + err.message, 'error') }
  }

  const handleReset = () => {
    setForm(toForm(COMPANY_DEFAULTS))
    showToast('Restored default values — click Save to apply.', 'success')
  }

  const handleSaveLR = async (e) => {
    e.preventDefault()
    try {
      // No prefix — the bill already prints the static "LR. No :" label, so the
      // number stands alone (2400, 2401 …).
      const saved = await saveLRNumberSettings({ startNumber: lrForm.startNumber })
      setLrForm(saved)
      const next = await peekNextLRNumber()
      setNextLR(next)
      showToast(`✓ LR number saved! Next bill will be ${next}`)
    } catch (err) { showToast('Error: ' + err.message, 'error') }
  }

  const handleSavePrinter = async (e) => {
    e.preventDefault()
    try {
      const saved = await savePrinterSettings(printerForm)
      setPrinterForm(saved)
      showToast('✓ Printer & Direct Print settings saved!')
    } catch (err) { showToast('Error: ' + err.message, 'error') }
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Company Settings</h1>
          <p className="text-xs text-slate-500 mt-0.5">Edit the details that appear on every Bilty — logo, name, TPT ID, title, address, caution &amp; notice.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { if (preview) { closePreview() } else { setPreview(true); setPreviewTick(t => t + 1) } }}
            className="btn btn-outline">
            <Eye size={14} /> {preview ? 'Hide' : 'Preview'} Bill
          </button>
        </div>
      </div>

      {/* Login password */}
      <div className="card mb-4">
        <div className="card-header"><span className="card-title"><Lock size={15} /> Login Password</span></div>
        <form onSubmit={handleChangePassword} className="p-5">
          <p className="text-xs text-slate-500 mb-4">
            Change the password used to open the app. You'll need the current password to change it.
          </p>
          <div className="grid grid-cols-3 gap-4 mb-4 max-w-2xl">
            <div>
              <label className="form-label">Current Password</label>
              <input className="form-input" type="password" placeholder="Current password" autoComplete="current-password"
                value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">New Password</label>
              <input className="form-input" type="password" placeholder="New password" autoComplete="new-password"
                value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Confirm New Password</label>
              <input className="form-input" type="password" placeholder="Confirm new password" autoComplete="new-password"
                value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={pwBusy}>
            <Lock size={14} /> {pwBusy ? 'Changing…' : 'Change Password'}
          </button>
        </form>
      </div>

      {/* LR Number scheme */}
      <form onSubmit={handleSaveLR} className="card mb-4">
        <div className="card-header"><span className="card-title"><Hash size={15} /> LR Number Format</span></div>
        <div className="p-5">
          <p className="text-xs text-slate-500 mb-4">
            Set the starting number once. Every new bill then increases it automatically
            (e.g. start 2400 → 2400, 2401, 2402 …). The bill already prints “LR. No :” before it.
          </p>
          {maxLR > 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
              Last LR number already used: <span className="font-bold">{maxLR}</span>.
              You can only move the counter forward — the start number must be at least <span className="font-bold">{maxLR + 1}</span>.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 items-end max-w-md">
            <div>
              <label className="form-label">Start Number</label>
              <input className="form-input" type="number" min={maxLR + 1} value={lrForm.startNumber}
                onChange={e => setLrForm(f => ({ ...f, startNumber: e.target.value }))} placeholder="e.g. 2400" />
            </div>
            <div>
              <label className="form-label">Next bill will be</label>
              <div className="form-input bg-slate-50 font-bold text-blue-700">
                {Math.max(Math.max(1, Math.floor(Number(lrForm.startNumber) || 1)), maxLR + 1)}
              </div>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-400">
            Current next number (saved): <span className="font-semibold text-slate-600">{nextLR || '—'}</span>
          </div>
          <div className="mt-4">
            <button type="submit" className="btn btn-primary"><Save size={14} /> Save LR Number</button>
          </div>
        </div>
      </form>

      {/* Printer & Direct Print Settings */}
      <form onSubmit={handleSavePrinter} className="card mb-4">
        <div className="card-header flex items-center justify-between">
          <span className="card-title flex items-center gap-2"><Printer size={15} /> Bilty Printer &amp; Direct Print</span>
          {printerForm.directPrintEnabled && (
            <span className="badge badge-success text-[10px] flex items-center gap-1 font-bold">
              <Zap size={11} className="fill-current" /> Direct Print Active
            </span>
          )}
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500 mb-4">
            Configure direct 1-click printing for Bilty receipts. Direct Print sends the receipt silently straight to your physical printer without opening the PDF viewer or print preview dialog.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-4">
            {/* Toggle direct print */}
            <div className="flex flex-col justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Direct Print Mode</label>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Skip the PDF viewer and print directly to the printer in 1 click.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="directPrintToggle"
                  checked={printerForm.directPrintEnabled}
                  onChange={e => setPrinterForm(f => ({ ...f, directPrintEnabled: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer accent-blue-600"
                />
                <label htmlFor="directPrintToggle" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  {printerForm.directPrintEnabled ? 'Enabled (Fast 1-Click)' : 'Disabled (Always preview)'}
                </label>
              </div>
            </div>

            {/* Select printer */}
            <div>
              <label className="form-label">Default Bilty Printer</label>
              <select
                className="form-input text-xs"
                value={printerForm.selectedPrinter}
                onChange={e => setPrinterForm(f => ({ ...f, selectedPrinter: e.target.value }))}
              >
                <option value="">System Default Printer</option>
                {printers.map(p => (
                  <option key={p.name} value={p.name}>
                    {p.name} {p.isDefault ? '(Default)' : ''}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-400 mt-1 block">
                {printers.length > 0 ? `${printers.length} printer(s) detected` : 'Using Windows default printer'}
              </span>
            </div>

            {/* Default copies */}
            <div>
              <label className="form-label">Default Copies</label>
              <select
                className="form-input text-xs"
                value={printerForm.defaultCopies}
                onChange={e => setPrinterForm(f => ({ ...f, defaultCopies: Number(e.target.value) }))}
              >
                <option value={1}>1 Copy (Driver / Consignee)</option>
                <option value={2}>2 Copies (Office + Driver)</option>
                <option value={3}>3 Copies (Office + Consignor + Consignee)</option>
              </select>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Number of copies printed per bilty by default
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-[11px] text-blue-800 mb-4 flex items-start gap-2">
            <span className="font-bold text-blue-900 shrink-0">🛡️ Safety Protection:</span>
            <span>
              Single-page enforcement (<code className="font-mono font-bold">Page 1 only</code>) is automatically applied so extra blank pages never print. Buttons are automatically locked against multiple rapid clicks.
            </span>
          </div>

          <button type="submit" className="btn btn-primary"><Save size={14} /> Save Printer Settings</button>
        </div>
      </form>

      {/* Backup & Restore */}
      <div className="card mb-6">
        <div className="card-header"><span className="card-title"><Database size={15} /> Backup &amp; Restore</span></div>
        <div className="p-5">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800 mb-4">
            Your entire data (bills, customers, vehicles, settings) lives in one file. A backup is made
            automatically once a day into your <b>Documents → TransportBackups</b> folder. To keep it safe off this
            computer, open that folder and upload the latest file to Google Drive manually.
          </div>

          <div className="flex flex-wrap gap-2 mb-5">
            <button type="button" className="btn btn-primary" onClick={handleBackupNow}>
              <HardDriveDownload size={14} /> Backup Now
            </button>
            <button type="button" className="btn btn-outline" onClick={handleOpenFolder}>
              <FolderOpen size={14} /> Open Backup Folder
            </button>
            <button type="button" className="btn btn-outline text-amber-700 border-amber-200 hover:bg-amber-50"
              onClick={() => setConfirmRestore(true)}>
              <HardDriveUpload size={14} /> Restore from Backup
            </button>
          </div>

          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
            Recent backups {backups.length ? `(${backups.length})` : ''}
          </div>
          {backups.length === 0 ? (
            <p className="text-xs text-slate-400">No backups yet. Click “Backup Now” to create the first one.</p>
          ) : (
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {backups.map(b => (
                <div key={b.name} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="font-mono text-slate-700 truncate">{b.name}</span>
                  <span className="text-slate-400 whitespace-nowrap ml-3">{fmtDate(b.mtime)} · {fmtSize(b.size)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bill content — logo, name, contact, legal text shown on every Bilty */}
      <form onSubmit={handleSave}>
        <div className="card mb-4">
          <div className="card-header"><span className="card-title"><Building2 size={15} /> Bill Content</span></div>
          <div className="p-4 space-y-4">

            {/* Branding */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Branding</h3>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="col-span-2">
                  <label className="form-label">Company Name *</label>
                  <input className="form-input" type="text" value={form.name}
                    onChange={e => set('name', e.target.value)} placeholder="e.g. HARIOM TRANSPORT AND CARGO" />
                </div>
                <div>
                  <label className="form-label">Logo Initials (fallback)</label>
                  <input className="form-input" type="text" maxLength={4} value={form.short}
                    onChange={e => set('short', e.target.value)} placeholder="e.g. HTC" />
                </div>
                <div>
                  <label className="form-label">Logo Sub-label</label>
                  <input className="form-input" type="text" value={form.shortLabel}
                    onChange={e => set('shortLabel', e.target.value)} placeholder="e.g. Transport & Cargo" />
                </div>
                {/* App logo — shown in the sidebar, login and header. Falls back
                    to the bundled htc.jpeg when nothing is uploaded. */}
                <div className="col-span-3 grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">App Logo — sidebar &amp; login (optional)</label>
                    <div className="flex items-center gap-2.5">
                      <div className="w-11 h-11 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                        {(form.logoDataUrl || COMPANY.logoDataUrl)
                          ? <img src={form.logoDataUrl || COMPANY.logoDataUrl} alt="app logo" className="w-full h-full object-contain" />
                          : <span className="text-xs font-black text-blue-700">{form.short || 'LOGO'}</span>}
                      </div>
                      <div className="flex gap-2">
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogo('logoDataUrl')} />
                        <button type="button" className="btn btn-outline py-1.5 px-3" onClick={() => fileRef.current?.click()}>
                          <Upload size={13} /> Upload
                        </button>
                        {form.logoDataUrl && (
                          <button type="button" className="btn btn-outline text-red-600 py-1.5 px-3" onClick={() => set('logoDataUrl', '')}>
                            <Trash2 size={13} /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">PNG/JPG under 500 KB. Empty = default app logo.</p>
                  </div>

                  {/* Bill logo — printed on the Bilty receipt. Falls back to the
                      bundled htc_bill.png when nothing is uploaded. */}
                  <div>
                    <label className="form-label">Bill Logo — printed on bilty (optional)</label>
                    <div className="flex items-center gap-2.5">
                      <div className="w-11 h-11 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                        {(form.billLogoDataUrl || COMPANY.billLogoDataUrl)
                          ? <img src={form.billLogoDataUrl || COMPANY.billLogoDataUrl} alt="bill logo" className="w-full h-full object-contain" />
                          : <span className="text-xs font-black text-blue-700">{form.short || 'LOGO'}</span>}
                      </div>
                      <div className="flex gap-2">
                        <input ref={billFileRef} type="file" accept="image/*" className="hidden" onChange={handleLogo('billLogoDataUrl')} />
                        <button type="button" className="btn btn-outline py-1.5 px-3" onClick={() => billFileRef.current?.click()}>
                          <Upload size={13} /> Upload
                        </button>
                        {form.billLogoDataUrl && (
                          <button type="button" className="btn btn-outline text-red-600 py-1.5 px-3" onClick={() => set('billLogoDataUrl', '')}>
                            <Trash2 size={13} /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">PNG/JPG under 500 KB. Empty = default bill logo.</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="form-label">Title / Tagline (delivery line)</label>
                <input className="form-input" type="text" value={form.tagline}
                  onChange={e => set('tagline', e.target.value)} placeholder="Daily service line shown under the name" />
              </div>
            </div>

            {/* Contact & IDs */}
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Contact &amp; IDs</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="form-label">TPT ID</label>
                  <input className="form-input" type="text" value={form.tptId}
                    onChange={e => set('tptId', e.target.value)} placeholder="e.g. 08FPEPB2543R1ZJ" />
                </div>
                <div className="col-span-2">
                  <label className="form-label">Address</label>
                  <input className="form-input" type="text" value={form.address}
                    onChange={e => set('address', e.target.value)} placeholder="Full shop address" />
                </div>
              </div>

              {/* Offices — name + phone, shown in the bill header's right box */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="form-label mb-0">Offices (shown on the bill)</label>
                  <button type="button" onClick={addOffice}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                    <Plus size={12} /> Add Office
                  </button>
                </div>
                <div className="space-y-2">
                  {form.offices.length === 0 && (
                    <p className="text-[11px] text-slate-400">No offices added. Click “Add Office” to add one.</p>
                  )}
                  {form.offices.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input className="form-input flex-1" type="text" placeholder="Office name (e.g. Jodhpur Office)"
                        value={o.name} onChange={e => setOffice(i, 'name', e.target.value)} />
                      <input className="form-input w-44" type="text" placeholder="Phone (e.g. 9928935529)"
                        value={o.phone} onChange={e => setOffice(i, 'phone', e.target.value)} />
                      <button type="button" onClick={() => removeOffice(i)} title="Remove office"
                        className="p-2 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Legal text */}
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Caution &amp; Notice Text</h3>
              <div className="space-y-3">
                <div>
                  <label className="form-label">Caution Line</label>
                  <textarea className="form-input" rows={2} value={form.caution}
                    onChange={e => set('caution', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Notice Paragraph</label>
                  <textarea className="form-input" rows={4} value={form.notice}
                    onChange={e => set('notice', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Bottom Note</label>
                  <input className="form-input" type="text" value={form.breakageNote}
                    onChange={e => set('breakageNote', e.target.value)} />
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button type="submit" className="btn btn-primary"><Save size={14} /> Save Settings</button>
          <button type="button" className="btn btn-outline" onClick={handleReset}>
            <RotateCcw size={14} /> Restore Defaults
          </button>
        </div>
      </form>

      {/* Live preview of the bill using saved values — right-side drawer */}
      {preview && (
        <div className="fixed inset-0 z-[9999]">
          {/* Dim backdrop (click to close) — light black, no blur */}
          <div className={`absolute inset-0 bg-black/30 ${previewClosing ? 'backdrop-anim-out' : 'backdrop-anim'}`}
               onClick={closePreview} />

          {/* The drawer panel, slides in from / out to the right */}
          <div className={`${previewClosing ? 'drawer-anim-out' : 'drawer-anim'} absolute top-0 right-0 h-full w-[40%] min-w-[520px] max-w-[760px]
                          bg-white shadow-2xl flex flex-col`}>

            {/* Header bar — title + close */}
            <div className="flex items-center justify-between px-4 py-3 bg-primary-700 text-white shrink-0">
              <span className="font-bold text-sm truncate"><Eye size={15} className="inline mr-1.5" /> Bill Preview</span>
              <button onClick={closePreview} className="text-white/70 hover:text-white transition p-1"><X size={18} /></button>
            </div>

            {/* Preview document on an A5-shaped page, scrolls within the drawer */}
            <div className="flex-1 overflow-auto bg-slate-100 p-4">
              <A5Page>
                <BiltyDocument key={previewTick} lrData={SAMPLE_LR} id="settingsPreview" />
              </A5Page>
            </div>
          </div>
        </div>
      )}

      {/* Restore confirm */}
      {confirmRestore && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setConfirmRestore(false)}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-96" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Restore from a backup?</h3>
            <p className="text-xs text-slate-500 mb-4">
              This will <b>replace all current data</b> with the backup file you choose. A safety backup of the
              current data is made first. The app will reload after restoring.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmRestore(false)} className="btn btn-outline">Cancel</button>
              <button onClick={handleRestore} className="btn bg-amber-600 text-white hover:bg-amber-700">
                Choose File &amp; Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-5 left-5 px-4 py-2.5 rounded-lg text-white text-xs font-semibold shadow-lg toast-anim
          ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{toast.msg}</div>
      )}
    </div>
  )
}
