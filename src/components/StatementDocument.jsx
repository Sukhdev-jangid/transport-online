import React from 'react'
import { Phone, MapPin } from 'lucide-react'
import { COMPANY } from '../config/company'
import { fmtDate } from '../utils/date'

const num = (v) => Number(v) || 0
const money = (v) => '₹' + num(v).toLocaleString('en-IN')

// Extract full piece/package count from a bill
const getPkgs = (b) => {
  if (b.packages !== undefined && b.packages !== null && b.packages !== '') {
    const p = num(b.packages)
    if (p > 0) return p
  }
  const s = String(b.goods || b.items || '')
  if (!s.trim()) return 0
  try {
    const parsed = JSON.parse(s)
    if (Array.isArray(parsed)) {
      const total = parsed.reduce((n, it) => n + num(it.quantity || it.pkgs || it.count || it.qty || it.packages || it.pieces), 0)
      if (total > 0) return total
    }
  } catch (_) {}
  const m = [...s.matchAll(/\(x\s*(\d+)\)/gi)]
  if (m.length) return m.reduce((n, x) => n + (Number(x[1]) || 0), 0)
  const m2 = [...s.matchAll(/(\d+)\s*(?:nos|pcs|boxes|box|bags|bag|drums|drum|pkgs|pkg|cartons|ctn|parcels|items)/gi)]
  if (m2.length) return m2.reduce((n, x) => n + (Number(x[1]) || 0), 0)
  return s.trim() ? s.split(',').filter(t => t.trim()).length : 0
}

// Paginate statement bills across distinct A4 sheets
function paginateStatementBills(bills) {
  if (bills.length <= 18) {
    return [{ isFirst: true, isLast: true, bills }]
  }
  const pages = []
  let index = 0
  const firstPageCap = 20
  const middlePageCap = 26
  const lastPageCap = 18

  pages.push({
    isFirst: true,
    isLast: false,
    bills: bills.slice(0, firstPageCap)
  })
  index = firstPageCap

  while (index < bills.length) {
    const remaining = bills.length - index
    if (remaining <= lastPageCap) {
      pages.push({
        isFirst: false,
        isLast: true,
        bills: bills.slice(index)
      })
      break
    } else if (remaining <= middlePageCap) {
      const take = Math.ceil(remaining / 2)
      pages.push({
        isFirst: false,
        isLast: false,
        bills: bills.slice(index, index + take)
      })
      index += take
      pages.push({
        isFirst: false,
        isLast: true,
        bills: bills.slice(index)
      })
      break
    } else {
      pages.push({
        isFirst: false,
        isLast: false,
        bills: bills.slice(index, index + middlePageCap)
      })
      index += middlePageCap
    }
  }

  if (pages.length > 0) {
    pages[pages.length - 1].isLast = true
  }

  return pages
}

export default function StatementDocument({
  bills = [],
  partyName = '',
  partyRole = 'consignor',
  periodLabel = '',
  id = 'printableStatement'
}) {
  const normalizedBills = bills.map((b, i) => ({
    ...b,
    srNo: b.srNo ?? i + 1,
    packages: getPkgs(b)
  }))

  const grandTotal = normalizedBills.reduce((s, b) => s + num(b.amount), 0)
  const totalPackages = normalizedBills.reduce((s, b) => s + num(b.packages), 0)

  const pages = paginateStatementBills(normalizedBills)
  const totalPages = pages.length

  const INK = '#1e3a8a'      // brand deep blue
  const ACCENT = '#4f46e5'   // indigo accent
  const offices = COMPANY.offices?.length
    ? COMPANY.offices
    : (COMPANY.phones || []).map(p => ({ name: '', phone: p }))

  return (
    <div id={id} className="statement-doc-root flex flex-col gap-6 print:gap-0 print:block">
      {pages.map((page, pageIdx) => (
        <div
          key={pageIdx}
          className="a4-page-sheet font-sans text-slate-900 bg-white shadow-xl mx-auto flex flex-col justify-between print:shadow-none print:my-0 print:mx-auto print:border-none my-2"
          style={{
            width: 794,
            minHeight: 1050,
            pageBreakAfter: pageIdx < totalPages - 1 ? 'always' : 'auto',
            breakAfter: pageIdx < totalPages - 1 ? 'page' : 'auto',
          }}
        >
          <div className="p-7 flex-1 flex flex-col justify-between">
            <div>
              {/* ── Page Header ── */}
              {page.isFirst ? (
                /* Full Brand header on Page 1 */
                <div className="flex items-center justify-between gap-4 pb-4" style={{ borderBottom: `3px solid ${INK}` }}>
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {COMPANY.billLogoDataUrl ? (
                      <img
                        src={COMPANY.billLogoDataUrl}
                        alt={COMPANY.short}
                        className="h-16 w-auto max-w-[130px] object-contain shrink-0"
                      />
                    ) : (
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center font-black text-lg text-white shrink-0"
                        style={{ background: INK }}
                      >
                        {COMPANY.short}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h1 className="text-[22px] font-black uppercase tracking-tight leading-none whitespace-nowrap" style={{ color: INK }}>
                        {COMPANY.name}
                      </h1>
                      <p className="text-[11px] text-slate-600 mt-1.5 flex items-center gap-1.5">
                        <MapPin size={12} className="shrink-0" strokeWidth={2} style={{ transform: 'translateY(0.5px)' }} />
                        <span className="leading-tight">{COMPANY.address}</span>
                      </p>
                      {COMPANY.tptId && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          <span className="font-semibold">TPT. ID:</span> {COMPANY.tptId}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px] flex flex-col gap-1.5 pl-4 border-l border-slate-200 text-right">
                    {offices.map((o, i) => (
                      <div key={i} className="text-right">
                        {o.name && <div className="font-bold text-slate-700 leading-tight">{o.name}</div>}
                        <div className="font-semibold text-slate-800 flex items-center justify-end gap-1.5 whitespace-nowrap mt-0.5">
                          <Phone size={12} className="shrink-0" strokeWidth={2} style={{ color: ACCENT, transform: 'translateY(0.5px)' }} />
                          <span className="leading-none">{o.phone}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Compact header on subsequent pages */
                <div className="flex items-center justify-between pb-3 mb-2" style={{ borderBottom: `2px solid ${INK}` }}>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-base uppercase" style={{ color: INK }}>{COMPANY.name}</span>
                    <span className="text-slate-400 text-xs">•</span>
                    <span className="text-xs font-bold text-slate-700">Account Statement: {partyName || 'All Parties'} (Contd.)</span>
                  </div>
                  <div className="text-xs text-slate-500 font-semibold">
                    Period: <span className="text-slate-900 font-bold">{periodLabel || '—'}</span>
                  </div>
                </div>
              )}

              {/* ── Statement title + party (on Page 1) ── */}
              {page.isFirst && (
                <div className="flex items-end justify-between mt-5 mb-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
                      Account Statement
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1.5">
                      {partyRole === 'consignee' ? 'Statement for Receiver (Consignee)' : partyRole === 'consignor' ? 'Statement for Sender (Consignor)' : partyRole === 'both' ? 'Statement for Both/Same (Sender & Receiver)' : 'Statement for All (Sender / Receiver)'}
                    </div>
                    <div className="text-[22px] font-black leading-tight text-slate-900">{partyName || 'All Parties'}</div>
                  </div>
                  <div className="flex gap-8 text-right">
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Period</div>
                      <div className="text-[13px] font-bold text-slate-800 mt-0.5 whitespace-nowrap">{periodLabel || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Bills</div>
                      <div className="text-[13px] font-bold text-slate-800 mt-0.5">{bills.length}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Bills table ── */}
              <div className="rounded-lg overflow-hidden border border-slate-200 mt-3">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr style={{ background: INK }} className="text-white">
                      <th className="px-3 py-2 text-center align-middle font-semibold w-[46px] text-[11px] leading-none uppercase tracking-wide border-r border-white/20">Sr</th>
                      <th className="px-3 py-2 text-center align-middle font-semibold w-[82px] text-[11px] leading-none uppercase tracking-wide border-r border-white/20">LR No</th>
                      <th className="px-3 py-2 text-center align-middle font-semibold w-[104px] text-[11px] leading-none uppercase tracking-wide border-r border-white/20">Date</th>
                      <th className="px-3 py-2 text-left align-middle font-semibold text-[11px] leading-none uppercase tracking-wide border-r border-white/20">Goods</th>
                      <th className="px-3 py-2 text-center align-middle font-semibold w-[76px] text-[11px] leading-none uppercase tracking-wide border-r border-white/20">Pkgs</th>
                      <th className="px-3 py-2 text-right align-middle font-semibold w-[116px] text-[11px] leading-none uppercase tracking-wide">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.bills.map((b, i) => (
                      <tr
                        key={b.lrNumber || i}
                        className={i % 2 ? 'bg-slate-50' : 'bg-white'}
                        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                      >
                        <td className="px-3 py-2 text-center align-middle text-slate-500 border-t border-r border-slate-200">{b.srNo ?? i + 1}</td>
                        <td className="px-3 py-2 text-center align-middle font-bold border-t border-r border-slate-200" style={{ color: ACCENT }}>{b.lrNumber}</td>
                        <td className="px-3 py-2 text-center align-middle text-slate-600 whitespace-nowrap border-t border-r border-slate-200">{fmtDate(b.date)}</td>
                        <td className="px-3 py-2 align-middle text-slate-800 border-t border-r border-slate-200">{b.goods || '—'}</td>
                        <td className="px-3 py-2 text-center align-middle font-semibold text-slate-700 border-t border-r border-slate-200 tabular-nums">{num(b.packages) || '—'}</td>
                        <td className="px-3 py-2 text-right align-middle font-semibold text-slate-900 whitespace-nowrap border-t border-slate-200 tabular-nums">{money(b.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Footer Section (only on last page) ── */}
            {page.isLast && (
              <div>
                {/* Grand total card */}
                <div className="flex justify-end mt-4">
                  <div className="flex items-stretch gap-3">
                    <div className="flex items-center justify-between gap-5 border-2 border-slate-900 rounded-lg px-4 py-2.5 bg-white">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900 leading-none">Total Pkgs</span>
                      <span className="text-[18px] font-black tabular-nums text-slate-950 leading-none">{totalPackages}</span>
                    </div>
                    <div className="flex items-center justify-between gap-8 border-2 border-slate-900 rounded-lg px-5 py-2.5 min-w-[260px] bg-white">
                      <span className="text-[13px] font-bold uppercase tracking-wider text-slate-900 leading-none">Grand Total</span>
                      <span className="text-[20px] font-black tabular-nums text-slate-950 leading-none">{money(grandTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer + signature */}
                <div className="mt-10 flex items-end justify-between text-[10px] text-slate-500">
                  <div>This is a computer-generated statement and does not require a signature.</div>
                  <div className="text-center">
                    <div className="pt-1 px-8 font-semibold text-slate-700" style={{ borderTop: '1px solid #94a3b8' }}>For {COMPANY.name}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Page number footer */}
            <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
              <span>{COMPANY.name} — Statement</span>
              <span className="font-semibold text-slate-600">Page {pageIdx + 1} of {totalPages}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
