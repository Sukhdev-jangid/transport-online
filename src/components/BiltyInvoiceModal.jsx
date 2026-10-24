import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X, MessageCircle, Download, Loader2, Zap, Check, AlertCircle } from 'lucide-react'
import { COMPANY } from '../config/company'
import { sendBiltyWhatsApp } from '../utils/whatsapp'
import { downloadBiltyPdf } from '../utils/biltyPdf'
import { getPrinterSettings } from '../db/database'
import BiltyDocument from './BiltyDocument'
import A5Page from './A5Page'

// Wait until React has re-rendered AND the browser has actually painted the new
// frame — so a silent print captures exactly what's on screen right now (e.g.
// the price already hidden), instead of guessing with a fixed delay a slow PC
// could miss. Two requestAnimationFrames = "the frame after this change has been
// painted"; on a visible window this ALWAYS fires and is the real signal.
//
// The timeout is only a last-resort net for the case rAF is throttled (window
// minimized/hidden), where it may never fire. It's set to 3s — far longer than
// any real paint even on a weak CPU — so the paint reliably wins the race first
// and a No-Price copy can never print with prices still showing. (No fixed
// short delay = no slow-CPU price leak.)
const waitForPaint = () => new Promise(resolve => {
  let done = false
  const finish = () => { if (!done) { done = true; resolve() } }
  requestAnimationFrame(() => requestAnimationFrame(finish))
  setTimeout(finish, 3000)   // safety net only — never beats a real paint
})

export default function BiltyInvoiceModal({ lrData, onClose }) {
  const [closing, setClosing] = useState(false)
  const [hidePrice, setHidePrice] = useState(false)
  const [busy, setBusy] = useState(null)   // status text while a print/PDF job runs
  const [feedback, setFeedback] = useState(null) // { type: 'success' | 'error', message: string }

  // Printer settings now come from Supabase (async). Default to safe values,
  // then fill in once loaded.
  const [printerSettings, setPrinterSettings] = useState({ defaultCopies: 1, directPrintEnabled: true, selectedPrinter: '' })
  const [copies, setCopies] = useState(1)
  useEffect(() => {
    getPrinterSettings().then(s => {
      setPrinterSettings(s)
      setCopies(s.defaultCopies || 1)
    }).catch(() => { /* keep defaults */ })
  }, [])
  const isDirectPrintEnabled = printerSettings.directPrintEnabled !== false && Boolean(window.electronAPI?.directPrintBilty)

  const cleanSelectedPrinter = (printerSettings.selectedPrinter || '').replace(/onenote|fax|xps/i, '').trim()

  if (!lrData) return null

  // Play the slide-out animation first, then actually unmount.
  const requestClose = () => {
    if (closing) return
    setClosing(true)
    setTimeout(onClose, 260)   // keep in sync with .drawer-anim-out (0.28s)
  }

  // Print via the Electron main process (open in PDF viewer)
  const doPrint = () => {
    if (window.electronAPI?.printBilty) return window.electronAPI.printBilty()
    window.print()
    return Promise.resolve()
  }

  // Normal Print (opens PDF Viewer / System Print Dialog)
  const handlePrint = () => {
    if (busy) return // debounce lock
    setFeedback(null)
    setBusy('Preparing bill — opening PDF viewer…')
    document.body.classList.add('printing-bilty')
    doPrint().finally(() => {
      document.body.classList.remove('printing-bilty')
      setBusy(null)
    })
  }

  // Direct Print: sends job silently straight to printer (no PDF viewer)
  const handleDirectPrint = async () => {
    if (busy) return // instant debounce lock: prevents 5-7 rapid clicks!
    setFeedback(null)
    setBusy(`Direct printing ${copies} cop${copies > 1 ? 'ies' : 'y'}…`)

    try {
      document.body.classList.add('printing-bilty')
      // Wait for the bill to be fully painted before sending to the printer.
      await waitForPaint()

      const res = await window.electronAPI.directPrintBilty({
        deviceName: cleanSelectedPrinter,
        copies: Number(copies) || 1,
      })

      if (res?.ok) {
        setFeedback({
          type: 'success',
          message: `Print request sent to "${res.printer}" (${res.copies} ${res.copies > 1 ? 'copies' : 'copy'})!`
        })
        setTimeout(() => setFeedback(null), 3500)
      } else {
        // Fallback to normal preview on error
        setFeedback({
          type: 'error',
          message: `Direct print error: ${res?.error || 'Unknown'}. Opening PDF viewer…`
        })
        setTimeout(() => {
          handlePrint()
        }, 1200)
        setTimeout(() => setFeedback(null), 5000)
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Error: ${err?.message || err}. Opening PDF viewer…`
      })
      setTimeout(() => {
        handlePrint()
      }, 1200)
      setTimeout(() => setFeedback(null), 5000)
    } finally {
      document.body.classList.remove('printing-bilty')
      setBusy(null)
    }
  }

  // Direct Print No Price: hides price, prints directly to printer, then restores price
  const handleDirectPrintNoPrice = async () => {
    if (busy) return // debounce lock
    setFeedback(null)
    setBusy(`Direct printing (No Price) ${copies} cop${copies > 1 ? 'ies' : 'y'}…`)
    setHidePrice(true)

    try {
      document.body.classList.add('printing-bilty')
      // Wait until the price is ACTUALLY hidden on screen (paint done) before
      // sending to the printer — never on a fixed guess a slow PC could miss.
      await waitForPaint()

      const res = await window.electronAPI.directPrintBilty({
        deviceName: cleanSelectedPrinter,
        copies: Number(copies) || 1,
      })

      if (res?.ok) {
        setFeedback({
          type: 'success',
          message: `No-Price print sent to "${res.printer}" (${res.copies} ${res.copies > 1 ? 'copies' : 'copy'})!`
        })
        setTimeout(() => setFeedback(null), 3500)
      } else {
        setFeedback({
          type: 'error',
          message: `Direct print error: ${res?.error || 'Unknown'}. Opening PDF viewer…`
        })
        setTimeout(() => {
          handlePrintNoPrice()
        }, 1200)
        setTimeout(() => setFeedback(null), 5000)
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Error: ${err?.message || err}. Opening PDF viewer…`
      })
      setTimeout(() => {
        handlePrintNoPrice()
      }, 1200)
      setTimeout(() => setFeedback(null), 5000)
    } finally {
      setHidePrice(false)
      document.body.classList.remove('printing-bilty')
      setBusy(null)
    }
  }

  // Print a copy with all details but no amounts.
  const handlePrintNoPrice = async () => {
    if (busy) return // debounce lock
    setFeedback(null)
    setBusy('Preparing bill (no price) — opening PDF viewer…')
    setHidePrice(true)
    document.body.classList.add('printing-bilty')
    // Wait until the price is ACTUALLY hidden on screen before capturing.
    await waitForPaint()
    try {
      await doPrint()
    } finally {
      setHidePrice(false)
      document.body.classList.remove('printing-bilty')
      setBusy(null)
    }
  }

  const handleWhatsApp = () => sendBiltyWhatsApp(lrData)

  const handleDownload = () => {
    if (busy) return // debounce lock
    setFeedback(null)
    setBusy('Preparing PDF…')
    document.body.classList.add('printing-bilty')
    const job = window.electronAPI?.saveBiltyPdf
      ? window.electronAPI.saveBiltyPdf(`Bilty-${lrData.lrNumber || 'receipt'}.pdf`)
      : downloadBiltyPdf(lrData)
    return Promise.resolve(job).finally(() => {
      document.body.classList.remove('printing-bilty')
      setBusy(null)
    })
  }

  // Render through a portal straight into <body>. Inside the normal page tree a
  // transformed/animated ancestor becomes the containing block for our
  // `fixed inset-0`, which pushed the drawer down below the 56px app header
  // (the top gap). Portalling to body makes `fixed` resolve to the real
  // viewport, so the drawer covers the full height from the very top.
  return createPortal(
    // Right-side drawer. Background is only lightly darkened (no blur) so the
    // list behind stays visible. On print, everything resets to static full width.
    <div className="fixed inset-0 z-[9999] print:static print:bg-white">
      {/* Dim backdrop (click to close) — light black, no blur */}
      <div className={`absolute inset-0 bg-black/30 print:hidden ${closing ? 'backdrop-anim-out' : 'backdrop-anim'}`}
           onClick={requestClose} />

      {/* The drawer panel, slides in from / out to the right */}
      <div className={`${closing ? 'drawer-anim-out' : 'drawer-anim'} absolute top-0 right-0 h-full w-[95vw] sm:w-[760px] md:w-[780px] max-w-[820px]
                      bg-white shadow-2xl flex flex-col print:static print:w-full print:max-w-none print:min-w-0 print:shadow-none print:h-auto`}>

        {/* Header bar — title + close only (hidden on print) */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-primary-700 text-white shrink-0 print:hidden">
          <span className="font-bold text-sm truncate">Lorry Receipt — {COMPANY.short}</span>
          <button onClick={requestClose} className="text-white/70 hover:text-white transition p-1"><X size={18} /></button>
        </div>

        {/* ── Printable Bilty on an A5-shaped page, scrolls within the drawer ── */}
        <div className="flex-1 overflow-auto bg-slate-100 p-3 sm:p-4 flex items-start justify-center print:overflow-visible print:bg-white print:p-0">
          <A5Page>
            <BiltyDocument lrData={lrData} hidePrice={hidePrice} />
          </A5Page>
        </div>

        {/* Busy status message */}
        {busy && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border-t border-blue-100 text-blue-700 text-xs font-semibold shrink-0 print:hidden">
            <Loader2 size={14} className="animate-spin shrink-0" /> {busy}
          </div>
        )}

        {/* Floating feedback toast — bottom-left fixed position */}
        {feedback && (
          <div className={`fixed bottom-5 left-5 z-[10000] px-4 py-3 rounded-lg shadow-2xl flex items-center gap-2.5 text-xs font-semibold toast-anim print:hidden max-w-md ${
            feedback.type === 'success' ? 'bg-green-700 text-white' : 'bg-red-600 text-white'
          }`}>
            {feedback.type === 'success' ? (
              <Check size={16} className="shrink-0 text-green-200" />
            ) : (
              <AlertCircle size={16} className="shrink-0 text-red-200" />
            )}
            <span className="leading-snug">{feedback.message}</span>
          </div>
        )}

        {/* Action bar at the bottom (hidden on print) */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-white border-t border-slate-200 shrink-0 print:hidden">
          {/* Copies picker */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 shrink-0">
            <span className="font-semibold text-slate-700">Copies:</span>
            <select
              value={copies}
              disabled={Boolean(busy)}
              onChange={(e) => setCopies(Number(e.target.value))}
              className="px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
            >
              <option value={1}>1 Copy</option>
              <option value={2}>2 Copies</option>
              <option value={3}>3 Copies</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button onClick={handleWhatsApp} disabled={Boolean(busy)}
              className="btn text-white flex items-center gap-1.5 text-xs py-1.5 px-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 shrink-0">
              <MessageCircle size={13} /> WhatsApp
            </button>
            <button onClick={handleDownload} disabled={Boolean(busy)}
              className="btn text-white flex items-center gap-1.5 text-xs py-1.5 px-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shrink-0">
              <Download size={13} /> PDF
            </button>
            {isDirectPrintEnabled ? (
              <>
                <button onClick={handlePrint} disabled={Boolean(busy)}
                  className="btn text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-1.5 text-xs py-1.5 px-2.5 disabled:opacity-50 shrink-0"
                  title="Preview in PDF Viewer and Print">
                  <Printer size={13} /> Preview
                </button>
                <button onClick={handleDirectPrintNoPrice} disabled={Boolean(busy)}
                  className="btn bg-slate-800 hover:bg-slate-900 text-white flex items-center gap-1.5 text-xs py-1.5 px-2.5 font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  title="Direct 1-Click Silent Print without amounts">
                  <Zap size={13} className="text-amber-400" />
                  <span className="whitespace-nowrap">Direct (No Price)</span>
                </button>
                <button onClick={handleDirectPrint} disabled={Boolean(busy)}
                  className="btn btn-primary bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 text-xs py-1.5 px-3 font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  title="Direct 1-Click Silent Print with prices">
                  <Zap size={14} className="fill-amber-300 text-amber-300" />
                  <span className="whitespace-nowrap">Direct Print</span>
                </button>
              </>
            ) : (
              <>
                <button onClick={handlePrintNoPrice} disabled={Boolean(busy)}
                  className="btn text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-1.5 text-xs py-1.5 px-2.5 disabled:opacity-50 shrink-0">
                  <Printer size={13} /> No Price
                </button>
                <button onClick={handlePrint} disabled={Boolean(busy)}
                  className="btn btn-primary bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 text-xs py-1.5 px-3 font-bold shadow-sm disabled:opacity-50 shrink-0"
                  title="Preview in PDF Viewer and Print">
                  <Printer size={13} /> Print
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
