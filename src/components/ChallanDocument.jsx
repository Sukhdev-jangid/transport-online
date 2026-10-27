import React from 'react'
import { Phone, MapPin, ArrowRight } from 'lucide-react'
import { COMPANY } from '../config/company'
import { fmtDate } from '../utils/date'
import { toPayTotal } from '../utils/billing'
import { packagesFromSummary, goodsFromSummary } from '../utils/items'
import { dirLabel } from '../utils/crossing'

const num = (v) => Number(v) || 0
const money = (v) => '₹' + num(v).toLocaleString('en-IN')

// Packages + goods come from the SHARED counter so a bill shows the same
// package count here, on the bilty, and on the statement (no divergence).
const qtyOf = packagesFromSummary
const goodsOf = goodsFromSummary

// Paginate rows across distinct A4 sheets
function paginateChallanRows(rows) {
  if (rows.length <= 18) {
    return [{ isFirst: true, isLast: true, rows }]
  }
  const pages = []
  let index = 0
  const firstPageCap = 20
  const middlePageCap = 26
  const lastPageCap = 18

  pages.push({
    isFirst: true,
    isLast: false,
    rows: rows.slice(0, firstPageCap)
  })
  index = firstPageCap

  while (index < rows.length) {
    const remaining = rows.length - index
    if (remaining <= lastPageCap) {
      pages.push({
        isFirst: false,
        isLast: true,
        rows: rows.slice(index)
      })
      break
    } else if (remaining <= middlePageCap) {
      const take = Math.ceil(remaining / 2)
      pages.push({
        isFirst: false,
        isLast: false,
        rows: rows.slice(index, index + take)
      })
      index += take
      pages.push({
        isFirst: false,
        isLast: true,
        rows: rows.slice(index)
      })
      break
    } else {
      pages.push({
        isFirst: false,
        isLast: false,
        rows: rows.slice(index, index + middlePageCap)
      })
      index += middlePageCap
    }
  }

  if (pages.length > 0) {
    pages[pages.length - 1].isLast = true
  }

  return pages
}

export default function ChallanDocument({ challan = {}, id = 'printableChallan' }) {
  const bilties = challan.bilties || []
  const allRows = bilties.map((e, i) => ({
    sr: i + 1,
    bilty: e.lr_number,
    qty: qtyOf(e.items),
    goods: goodsOf(e.items),
    consignee: e.consignee || '',
    mobile: e.consignee_phone || '',
    toPay: toPayTotal(e),
  }))

  const totalPkgs = allRows.reduce((s, r) => s + num(r.qty), 0)
  const totalToPay = allRows.reduce((s, r) => s + num(r.toPay), 0)

  const pages = paginateChallanRows(allRows)
  const totalPages = pages.length

  const INK = '#1e3a8a'      // brand deep blue
  const ACCENT = '#4f46e5'   // indigo accent
  const offices = COMPANY.offices?.length
    ? COMPANY.offices
    : (COMPANY.phones || []).map(p => ({ name: '', phone: p }))

  return (
    <div id={id} className="challan-doc-root flex flex-col gap-6 print:gap-0 print:block">
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
                    <span className="text-xs font-bold text-slate-700">Challan #{challan.challan_number} (Contd.)</span>
                  </div>
                  <div className="text-xs text-slate-500 font-semibold">
                    Vehicle: <span className="text-slate-900 uppercase font-bold">{challan.vehicle_number || '—'}</span> | Date: {challan.manifest_date ? fmtDate(challan.manifest_date) : '—'}
                  </div>
                </div>
              )}

              {/* ── Challan Manifest Meta Grid (on Page 1) ── */}
              {page.isFirst && (
                <div className="mt-4 mb-3">
                  <div className="flex items-center justify-between pb-2.5">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
                        Loading Sheet / Manifest
                      </div>
                      <div className="text-[20px] font-black leading-tight text-slate-900 flex items-center gap-2 mt-0.5">
                        <span>Challan</span>
                        <span className="text-red-600">#{challan.challan_number || '—'}</span>
                      </div>
                    </div>

                    {(challan.from_centre || challan.to_centre) && (
                      <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 px-3.5 py-1.5 rounded-lg text-[12px] font-bold text-slate-800">
                        <span>{challan.from_centre || '—'}</span>
                        <ArrowRight size={14} className="text-slate-400" />
                        <span style={{ color: INK }}>{challan.to_centre || '—'}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-3 py-2 border-y border-slate-900 text-[11.5px] mt-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Manifest Date</span>
                      <span className="font-bold text-slate-900">{challan.manifest_date ? fmtDate(challan.manifest_date) : '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Vehicle / Gadi No</span>
                      <span className="font-bold text-slate-900 uppercase">{challan.vehicle_number || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Driver Name</span>
                      <span className="font-bold text-slate-900">{challan.driver_name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Driver Phone</span>
                      <span className="font-bold text-slate-900">{challan.driver_phone || '—'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Bilty Table ── */}
              <div className="rounded-lg overflow-hidden border border-slate-200 mt-3">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr style={{ background: INK }} className="text-white">
                      <th className="px-2.5 py-2 text-center align-middle font-semibold w-[42px] text-[11px] leading-none uppercase tracking-wide border-r border-white/20">Sr</th>
                      <th className="px-3 py-2 text-center align-middle font-semibold w-[80px] text-[11px] leading-none uppercase tracking-wide border-r border-white/20">Bilty No</th>
                      <th className="px-2.5 py-2 text-center align-middle font-semibold w-[55px] text-[11px] leading-none uppercase tracking-wide border-r border-white/20">Qty</th>
                      <th className="px-3 py-2 text-left align-middle font-semibold text-[11px] leading-none uppercase tracking-wide border-r border-white/20">Receiver (Consignee)</th>
                      <th className="px-3 py-2 text-left align-middle font-semibold text-[11px] leading-none uppercase tracking-wide border-r border-white/20">Goods</th>
                      <th className="px-3 py-2 text-center align-middle font-semibold w-[100px] text-[11px] leading-none uppercase tracking-wide border-r border-white/20">Mobile</th>
                      <th className="px-3 py-2 text-right align-middle font-semibold w-[90px] text-[11px] leading-none uppercase tracking-wide">To Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.rows.map((r, i) => (
                      <tr
                        key={r.sr || i}
                        className={i % 2 ? 'bg-slate-50' : 'bg-white'}
                        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                      >
                        <td className="px-2.5 py-2 text-center align-middle text-slate-500 border-t border-r border-slate-200">{r.sr}</td>
                        <td className="px-3 py-2 text-center align-middle font-bold border-t border-r border-slate-200" style={{ color: ACCENT }}>{r.bilty}</td>
                        <td className="px-2.5 py-2 text-center align-middle font-semibold text-slate-700 border-t border-r border-slate-200 tabular-nums">{r.qty || '—'}</td>
                        <td className="px-3 py-2 align-middle text-slate-800 border-t border-r border-slate-200 font-medium">{r.consignee || '—'}</td>
                        <td className="px-3 py-2 align-middle text-slate-800 border-t border-r border-slate-200">{r.goods || '—'}</td>
                        <td className="px-3 py-2 text-center align-middle text-slate-600 whitespace-nowrap border-t border-r border-slate-200 tabular-nums">{r.mobile || '—'}</td>
                        <td className="px-3 py-2 text-right align-middle font-semibold text-slate-900 whitespace-nowrap border-t border-slate-200 tabular-nums">
                          {r.toPay ? money(r.toPay) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Footer Section (only on the last page) ── */}
            {page.isLast && (
              <div>
                {/* ── Crossing goods on this trip (only if any are linked) ── */}
                {(challan.crossings || []).length > 0 && (
                  <div className="mt-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1.5" style={{ color: ACCENT }}>
                      Crossing Goods on this Trip
                    </div>
                    <div className="rounded-lg overflow-hidden border border-slate-200">
                      <table className="w-full border-collapse text-[11.5px]">
                        <thead>
                          <tr style={{ background: INK }} className="text-white">
                            <th className="px-2.5 py-1.5 text-center font-semibold w-[42px] text-[10px] uppercase border-r border-white/20">Sr</th>
                            <th className="px-2.5 py-1.5 text-center font-semibold w-[70px] text-[10px] uppercase border-r border-white/20">Cr No</th>
                            <th className="px-2.5 py-1.5 text-center font-semibold w-[60px] text-[10px] uppercase border-r border-white/20">Dir</th>
                            <th className="px-3 py-1.5 text-left font-semibold text-[10px] uppercase border-r border-white/20">Transporter</th>
                            <th className="px-3 py-1.5 text-left font-semibold text-[10px] uppercase border-r border-white/20">GR No</th>
                            <th className="px-3 py-1.5 text-left font-semibold text-[10px] uppercase border-r border-white/20">Marka</th>
                            <th className="px-3 py-1.5 text-left font-semibold text-[10px] uppercase border-r border-white/20">Route</th>
                            <th className="px-2.5 py-1.5 text-center font-semibold w-[50px] text-[10px] uppercase">Pkgs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(challan.crossings || []).map((c, i) => (
                            <tr key={c.id} className={i % 2 ? 'bg-slate-50' : 'bg-white'}>
                              <td className="px-2.5 py-1.5 text-center text-slate-500 border-t border-r border-slate-200">{i + 1}</td>
                              <td className="px-2.5 py-1.5 text-center font-bold border-t border-r border-slate-200" style={{ color: ACCENT }}>{c.crossing_no}</td>
                              <td className="px-2.5 py-1.5 text-center text-slate-700 border-t border-r border-slate-200">{dirLabel(c.direction)}</td>
                              <td className="px-3 py-1.5 text-slate-800 border-t border-r border-slate-200 font-medium">{c.transporters?.name || '—'}</td>
                              <td className="px-3 py-1.5 text-slate-700 border-t border-r border-slate-200">{c.gr_no || '—'}</td>
                              <td className="px-3 py-1.5 text-slate-700 border-t border-r border-slate-200">{c.pvt_marka || '—'}</td>
                              <td className="px-3 py-1.5 text-slate-600 border-t border-r border-slate-200 whitespace-nowrap">{c.from_station} → {c.to_station}</td>
                              <td className="px-2.5 py-1.5 text-center text-slate-700 border-t border-slate-200 tabular-nums">{c.packages || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Summary totals */}
                <div className="flex justify-end mt-4">
                  <div className="flex items-stretch gap-3">
                    <div className="flex items-center justify-between gap-4 border-2 border-slate-900 rounded-lg px-4 py-2.5 bg-white">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900 leading-none">Total Bilties</span>
                      <span className="text-[16px] font-black tabular-nums text-slate-950 leading-none">{allRows.length}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-2 border-slate-900 rounded-lg px-4 py-2.5 bg-white">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900 leading-none">Total Pkgs</span>
                      <span className="text-[16px] font-black tabular-nums text-slate-950 leading-none">{totalPkgs}</span>
                    </div>
                    <div className="flex items-center justify-between gap-6 border-2 border-slate-900 rounded-lg px-5 py-2.5 min-w-[240px] bg-white">
                      <span className="text-[12px] font-bold uppercase tracking-wider text-slate-900 leading-none">Total To-Pay</span>
                      <span className="text-[18px] font-black tabular-nums text-slate-950 leading-none">{money(totalToPay)}</span>
                    </div>
                  </div>
                </div>

                {/* Signatures footer */}
                <div className="grid grid-cols-3 gap-8 text-[11px] font-semibold mt-10 pt-4">
                  <div className="text-center">
                    <div className="border-t border-slate-300 pt-1.5 text-slate-700">Received By (Destination)</div>
                  </div>
                  <div className="text-center">
                    <div className="border-t border-slate-300 pt-1.5 text-slate-700">Signature Driver</div>
                  </div>
                  <div className="text-center">
                    <div className="border-t border-slate-300 pt-1.5 text-slate-700">For {COMPANY.name}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Page number footer */}
            <div className="mt-4 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
              <span>{COMPANY.name} — Challan #{challan.challan_number || ''}</span>
              <span className="font-semibold text-slate-600">Page {pageIdx + 1} of {totalPages}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
