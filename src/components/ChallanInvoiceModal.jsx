import { useState, useRef, useEffect } from 'react'
import { Printer, X, Download, Loader2 } from 'lucide-react'
import { COMPANY } from '../config/company'
import { downloadChallanPdf } from '../utils/challanPdf'
import ChallanDocument from './ChallanDocument'

// Right-side drawer preview for a CHALLAN (loading sheet) — mirrors the bilty
// invoice drawer. Renders the live <ChallanDocument> (id="printableChallan") on an
// A4 page so both Print (opens the A4-portrait PDF in the system viewer) and Download
// (save-as dialog) use the SAME printToPDF capture of the on-screen document.
export default function ChallanInvoiceModal({ challan, onClose }) {
  const [closing, setClosing] = useState(false)
  const [busy, setBusy] = useState(null)   // status text while a print/PDF job runs
  const containerRef = useRef(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const avail = el.clientWidth - 32
      if (avail > 0 && avail < 794) {
        setScale(Number((avail / 794).toFixed(3)))
      } else {
        setScale(1)
      }
    }
    update()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update)
      ro.observe(el)
      return () => ro.disconnect()
    } else {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
  }, [])

  if (!challan) return null

  const safeNo = String(challan.challan_number || 'challan').replace(/[^\w\-]+/g, '-').slice(0, 40)

  // Play the slide-out animation first, then actually unmount.
  const requestClose = () => {
    if (closing) return
    setClosing(true)
    setTimeout(onClose, 260)   // keep in sync with .drawer-anim-out (0.28s)
  }

  // Print via the Electron main process (printToPDF → open in system PDF viewer)
  // so Windows shows a real print dialog. Falls back to window.print() in a
  // plain browser (dev).
  const doPrint = () => {
    if (window.electronAPI?.printChallan) return window.electronAPI.printChallan()
    window.print()
    return Promise.resolve()
  }

  const handlePrint = () => {
    setBusy('Preparing challan — opening PDF viewer…')
    document.body.classList.add('printing-challan')
    Promise.resolve(doPrint()).finally(() => {
      document.body.classList.remove('printing-challan')
      setBusy(null)
    })
  }

  // Download uses the SAME renderer as Print (Electron printToPDF on the live
  // page), so the saved PDF is identical to the printed one. Falls back to the
  // html2canvas method only in a plain browser (dev) where Electron isn't there.
  const handleDownload = () => {
    setBusy('Preparing PDF…')
    document.body.classList.add('printing-challan')
    const job = window.electronAPI?.saveChallanPdf
      ? window.electronAPI.saveChallanPdf(`Challan-${safeNo}.pdf`)
      : downloadChallanPdf(challan)
    Promise.resolve(job).finally(() => {
      document.body.classList.remove('printing-challan')
      setBusy(null)
    })
  }

  return (
    // Right-side drawer. Background is only lightly darkened (no blur) so the
    // list behind stays visible. On print, everything resets to static full width.
    <div className="fixed inset-0 z-[9999] print:static print:bg-white">
      {/* Dim backdrop (click to close) — light black, no blur */}
      <div className={`absolute inset-0 bg-black/30 print:hidden ${closing ? 'backdrop-anim-out' : 'backdrop-anim'}`}
           onClick={requestClose} />

      {/* The drawer panel, slides in from / out to the right */}
      <div className={`${closing ? 'drawer-anim-out' : 'drawer-anim'} absolute top-0 right-0 h-full w-[96vw] sm:w-[860px] md:w-[880px] lg:w-[900px] max-w-[940px]
                      bg-white shadow-2xl flex flex-col print:static print:w-full print:max-w-none print:min-w-0 print:shadow-none print:h-auto`}>

        {/* Header bar — title + close only (hidden on print) */}
        <div className="flex items-center justify-between px-5 py-3 bg-primary-700 text-white shrink-0 print:hidden">
          <span className="font-bold text-sm truncate">Challan #{challan.challan_number} — {COMPANY.short}</span>
          <button onClick={requestClose} className="text-white/70 hover:text-white transition p-1"><X size={18} /></button>
        </div>

        {/* ── Printable challan preview, scrolls within the drawer ── */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-slate-200/60 p-3 sm:p-5 flex justify-center print:overflow-visible print:bg-white print:p-0">
          <div
            style={{
              width: scale < 1 ? Math.round(794 * scale) : 794,
              transform: scale < 1 ? `scale(${scale})` : 'none',
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease',
            }}
          >
            <div style={{ width: 794 }}>
              <ChallanDocument challan={challan} />
            </div>
          </div>
        </div>

        {/* Busy status message — shown while a print/PDF job is running so the
            user knows something is happening (printToPDF takes a moment, and the
            PDF viewer opens in front, minimizing this window). */}
        {busy && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border-t border-blue-100 text-blue-700 text-xs font-semibold shrink-0 print:hidden">
            <Loader2 size={14} className="animate-spin shrink-0" /> {busy}
          </div>
        )}

        {/* Action bar at the bottom (hidden on print) */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3 bg-white border-t border-slate-200 shrink-0 print:hidden">
          <button onClick={handleDownload}
            className="btn text-white flex items-center gap-1.5 text-xs py-2 px-4 bg-indigo-600 hover:bg-indigo-700">
            <Download size={14} /> Download PDF
          </button>
          <button onClick={handlePrint}
            className="btn btn-primary bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 text-xs py-2 px-4">
            <Printer size={14} /> Print
          </button>
        </div>
      </div>
    </div>
  )
}
