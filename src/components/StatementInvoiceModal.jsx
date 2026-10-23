import { useState, useRef, useEffect } from 'react'
import { Printer, X, Download, Loader2 } from 'lucide-react'
import { COMPANY } from '../config/company'
import { downloadStatementPdf } from '../utils/statementPdf'
import StatementDocument from './StatementDocument'

// Right-side drawer preview for a STATEMENT (monthly account statement) — mirrors
// the Challan and Bilty invoice drawers. Renders the live <StatementDocument>
// (id="printableStatement") on an A4 page so both Print and Download use the
// exact same printToPDF capture of the on-screen document.
export default function StatementInvoiceModal({ statement, onClose }) {
  const [closing, setClosing] = useState(false)
  const [busy, setBusy] = useState(null)
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

  if (!statement) return null

  const safeParty = (statement.partyName || 'party').replace(/[^\w\-]+/g, '-').slice(0, 40)

  // Play slide-out animation first, then unmount
  const requestClose = () => {
    if (closing) return
    setClosing(true)
    setTimeout(onClose, 260)
  }

  const doPrint = () => {
    if (window.electronAPI?.printStatement) return window.electronAPI.printStatement()
    window.print()
    return Promise.resolve()
  }

  const handlePrint = () => {
    setBusy('Preparing statement — opening PDF viewer…')
    document.body.classList.add('printing-statement')
    Promise.resolve(doPrint()).finally(() => {
      document.body.classList.remove('printing-statement')
      setBusy(null)
    })
  }

  const handleDownload = () => {
    setBusy('Preparing PDF…')
    document.body.classList.add('printing-statement')
    const job = window.electronAPI?.saveStatementPdf
      ? window.electronAPI.saveStatementPdf(`Statement-${safeParty}.pdf`)
      : downloadStatementPdf(statement)
    Promise.resolve(job).finally(() => {
      document.body.classList.remove('printing-statement')
      setBusy(null)
    })
  }

  return (
    <div className="fixed inset-0 z-[9999] print:static print:bg-white">
      {/* Dim backdrop (click to close) */}
      <div
        className={`absolute inset-0 bg-black/30 print:hidden ${closing ? 'backdrop-anim-out' : 'backdrop-anim'}`}
        onClick={requestClose}
      />

      {/* The drawer panel, slides in from / out to the right */}
      <div
        className={`${closing ? 'drawer-anim-out' : 'drawer-anim'} absolute top-0 right-0 h-full w-[96vw] sm:w-[860px] md:w-[880px] lg:w-[900px] max-w-[940px]
                    bg-white shadow-2xl flex flex-col print:static print:w-full print:max-w-none print:min-w-0 print:shadow-none print:h-auto`}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-primary-700 text-white shrink-0 print:hidden">
          <span className="font-bold text-sm truncate">
            Statement: {statement.partyName || 'All Parties'} {statement.periodLabel ? `(${statement.periodLabel})` : ''} — {COMPANY.short}
          </span>
          <button onClick={requestClose} className="text-white/70 hover:text-white transition p-1">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable A4 Statement preview */}
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
              <StatementDocument {...statement} />
            </div>
          </div>
        </div>

        {/* Busy indicator */}
        {busy && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border-t border-blue-100 text-blue-700 text-xs font-semibold shrink-0 print:hidden">
            <Loader2 size={14} className="animate-spin shrink-0" /> {busy}
          </div>
        )}

        {/* Bottom action bar */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3 bg-white border-t border-slate-200 shrink-0 print:hidden">
          <button
            onClick={handleDownload}
            className="btn text-white flex items-center gap-1.5 text-xs py-2 px-4 bg-indigo-600 hover:bg-indigo-700"
          >
            <Download size={14} /> Download PDF
          </button>
          <button
            onClick={handlePrint}
            className="btn btn-primary bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 text-xs py-2 px-4"
          >
            <Printer size={14} /> Print
          </button>
        </div>
      </div>
    </div>
  )
}
