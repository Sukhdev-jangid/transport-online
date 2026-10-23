import { Phone } from 'lucide-react'
import { COMPANY } from '../config/company'
import { fmtDate } from '../utils/date'
import { billTotal } from '../utils/billing'

const num = (v) => Number(v) || 0

// The printable Bilty — LANDSCAPE A5 layout (210 × 148 mm), authored at 1000px
// wide and scaled to fill the page on print (see @media print in index.css).
// Layout, top → bottom:
//   • Header band: logo | company name+address | branch offices & phones
//   • IDs band: owner's risk | TPT id | LR no + date | E-way
//   • Parties row: Consignor (left) and Consignee (right) — BIG text so the
//     driver can read name / address / phone easily
//   • Details row: items table (left) and charges (right)
//   • Signatures
// `id` lets callers target it; `hidePrice` blanks the amounts (No-Price print).
export default function BiltyDocument({ lrData, id = 'printableBilty', hidePrice = false }) {
  if (!lrData) return null

  // Per-item rows that actually have a name (used for the "qty X rate" table).
  const items = (lrData.itemsList || []).filter(i => i.itemName)
  const goods =
    (items.length > 0
      ? items.map(i => i.itemName).join(', ')
      : lrData.items) || ''
  const isPaid = lrData.paymentType === 'Paid'
  const isTBB = lrData.paymentType === 'TBB'
  // Anything that isn't Paid or TBB is treated as "To Pay" (the default).
  const isToPay = !isPaid && !isTBB
  const grandTotal = billTotal(lrData)
  const totalPackages =
    items.reduce((s, i) => s + (Number(i.quantity) || 0), 0) ||
    (lrData.itemsList || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0) ||
    (Number(lrData.packages) || (Number(lrData.totalPackages) || ''))

  // A single Paid / To Pay / TBB checkbox, reused three times.
  const Tick = ({ on, label }) => (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 border border-slate-900 rounded-[2px] bg-white shrink-0">
        {on && (
          <svg className="w-2.5 h-2.5 text-slate-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span> {label}
    </span>
  )

  return (
    // Fixed authored height so the bill fills the full A5-landscape page — the
    // card grows (flex-1) and the details row inside it grows too, so there's no
    // big empty band at the bottom regardless of how few items there are.
    <div id={id} className="p-4 font-sans text-slate-900 bg-white text-[12px] leading-tight flex flex-col" style={{ height: 685 }}>
      <div className="text-center text-[11px] font-semibold text-slate-500 mb-1">॥ श्री गणेशाय नमः ॥</div>

      <div className="border-2 border-slate-900 rounded flex-1 flex flex-col">
        {/* ── Header band: logo | titles | branch offices ── */}
        <div className="flex items-stretch border-b-2 border-slate-900">
          <div className="flex items-center justify-center p-2 border-r-2 border-slate-900 shrink-0">
            {COMPANY.billLogoDataUrl ? (
              <img src={COMPANY.billLogoDataUrl} alt={COMPANY.short}
                className="h-20 w-auto max-w-[150px] object-contain" />
            ) : (
              <div className="w-16 h-16 bg-blue-700 text-white rounded-full flex items-center justify-center font-black text-lg tracking-tighter">
                {COMPANY.short}
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-col justify-center text-center py-2 px-2">
            <h1 className="text-3xl font-black text-blue-800 uppercase tracking-tight leading-none">{COMPANY.name}</h1>
            <p className="text-[11px] text-slate-700 mt-1 leading-snug">{COMPANY.tagline}</p>
            <p className="text-[11px] font-semibold text-slate-800 mt-0.5">{COMPANY.address}</p>
          </div>
          <div className="flex flex-col justify-center px-3 border-l-2 border-slate-900 shrink-0 text-[11px] text-right gap-1.5">
            {(COMPANY.offices?.length
              ? COMPANY.offices
              : (COMPANY.phones || []).map(p => ({ name: '', phone: p }))
            ).map((o, i) => (
              <div key={i}>
                {o.name && <div className="font-bold text-slate-800">{o.name}</div>}
                <div className="text-[13px] font-semibold text-slate-800 flex items-center justify-end gap-1 whitespace-nowrap">
                  <Phone size={11} className="shrink-0" /> {o.phone}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── IDs band (single row): risk | E-way | TPT id | LR no | date.
            The old separate From/To + E-way row is removed; E-way now lives here
            and the route (From→To city) moves next to the consignor/consignee
            labels below so the driver reads it right where the parties are. ── */}
        <div className="grid grid-cols-[0.85fr_1fr_1.5fr_0.8fr_1fr] border-b-2 border-slate-900 text-[14px]">
          <div className="px-2 py-1.5 border-r border-slate-400 flex items-center">
            <span className="font-bold whitespace-nowrap">AT OWNER'S RISK</span>
          </div>
          <div className="px-2 py-1.5 border-r border-slate-400 flex items-center">
            <span className="font-bold mr-1">E-WAY No. :</span> {lrData.ewayBill || '—'}
          </div>
          <div className="px-2 py-1.5 border-r border-slate-400 flex items-center whitespace-nowrap">
            <span className="font-bold mr-1">TPT. ID :</span> {COMPANY.tptId}
          </div>
          <div className="px-2 py-1.5 border-r border-slate-400 flex items-center">
            <span className="font-bold text-red-700 mr-1">LR. No :</span> <span className="font-bold text-red-700">{lrData.lrNumber}</span>
          </div>
          <div className="px-2 py-1.5 flex items-center">
            <span className="font-bold mr-1">DATE :</span> {fmtDate(lrData.date)}
          </div>
        </div>

        {/* ── Parties row: Consignor (left) | Consignee (right) — BIG.
            Sizes to its content (no flex-1) so there's no empty band below the
            Mobile line; the details row below absorbs the remaining height. ── */}
        <div className="grid grid-cols-2 border-b-2 border-slate-900">
          {/* Consignor / Sender — the FROM city sits right on the label */}
          <div className="px-3 py-3 border-r-2 border-slate-900">
            <div className="flex items-baseline gap-2 flex-wrap mb-1.5">
              <span className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Sender (Consignor) —</span>
              <span className="text-[18px] font-black text-blue-800 leading-none">{lrData.fromCity || COMPANY.defaultFrom || ''}</span>
            </div>
            <div className="text-[20px] font-bold leading-tight"><span className="text-[13px] font-bold text-slate-500 mr-1">M/s</span>{lrData.consignor || '—'}</div>
            {lrData.consignorAddress && <div className="text-[15px] text-slate-700 mt-1.5 leading-snug">{lrData.consignorAddress}</div>}
            <div className="mt-2 text-[15px]">
              <span className="font-bold">Mobile :</span> {lrData.consignorPhone || '—'}
            </div>
          </div>
          {/* Consignee / Receiver — the TO city sits right on the label */}
          <div className="px-3 py-3">
            <div className="flex items-baseline gap-2 flex-wrap mb-1.5">
              <span className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Receiver (Consignee) —</span>
              <span className="text-[18px] font-black text-blue-800 leading-none">{lrData.toCity || ''}</span>
            </div>
            <div className="text-[20px] font-bold leading-tight"><span className="text-[13px] font-bold text-slate-500 mr-1">M/s</span>{lrData.consignee || '—'}</div>
            {lrData.consigneeAddress && <div className="text-[15px] text-slate-700 mt-1.5 leading-snug">{lrData.consigneeAddress}</div>}
            <div className="mt-2 text-[15px]">
              <span className="font-bold">Mobile :</span> {lrData.consigneePhone || '—'}
            </div>
          </div>
        </div>

        {/* ── Details row: items table (left) | charges (right).
            flex-1 so it grows to fill the page's remaining height — the items
            column's filler stretches down, removing the empty bottom band. ── */}
        <div className="grid grid-cols-2 border-b-2 border-slate-900 flex-1">
          {/* Left: packages + goods */}
          <div className="border-r-2 border-slate-900 flex flex-col">
            {/* Same py-2 + 13.5px + items-center as the Payment row on the right
                so both header cells are exactly the same height. */}
            <div className="grid grid-cols-[88px_1fr_90px] items-center border-b border-slate-400 text-[15px] font-bold bg-slate-50">
              <div className="px-2 py-2 border-r border-slate-400 text-center">Packages</div>
              <div className="px-2 py-2 border-r border-slate-400 text-center">Goods Said to Contain</div>
              <div className="px-2 py-2 text-center">Total</div>
            </div>

            {/* One row per item; no divider line between item rows. */}
            {items.length > 0 ? (
              items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-[88px_1fr_90px] text-[15px]">
                  <div className="px-2 py-1 border-r border-slate-400 text-center">{it.quantity || ''}</div>
                  <div className="px-2 py-1 border-r border-slate-400">{it.itemName}</div>
                  <div className="px-2 py-1 text-right whitespace-nowrap">
                    {hidePrice ? '' : (it.quantity && it.rate ? `${it.quantity} X ${it.rate}` : '')}
                  </div>
                </div>
              ))
            ) : (
              <div className="grid grid-cols-[88px_1fr_90px] text-[15px]">
                <div className="px-2 py-1 border-r border-slate-400 text-center">
                  {lrData.itemsList?.reduce((s, i) => s + (Number(i.quantity) || 0), 0) || ''}
                </div>
                <div className="px-2 py-1 border-r border-slate-400">{goods}</div>
                <div className="px-2 py-1" />
              </div>
            )}

            {/* Growing filler so the column dividers reach the bottom of the box. */}
            <div className="grid grid-cols-[88px_1fr_90px] flex-1 min-h-[48px]">
              <div className="border-r border-slate-400" />
              <div className="border-r border-slate-400" />
              <div />
            </div>

            {/* Total Packages bottom row matching the right column's TOTAL row */}
            <div className="grid grid-cols-[88px_1fr_90px] text-[16px] font-bold bg-slate-50 border-t border-slate-400">
              <div className="px-2 py-1.5 border-r border-slate-400 text-center">{totalPackages || ''}</div>
              <div className="px-2 py-1.5 border-r border-slate-400 text-slate-700">Total Packages</div>
              <div className="px-2 py-1.5 text-right" />
            </div>
          </div>

          {/* Right: payment ticks + charges */}
          <div className="flex flex-col">
            <div className="flex items-center gap-4 px-3 py-2 border-b border-slate-400 text-[15px] font-bold">
              <span>Payment</span>
              <Tick on={isPaid} label="Paid" />
              <Tick on={isToPay} label="To Pay" />
              <Tick on={isTBB} label="TBB" />
            </div>
            <div className="grid grid-cols-2 text-[14px] font-bold bg-slate-50 border-b border-slate-400">
              <div className="px-2 py-1.5 border-r border-slate-400">Charges</div>
              <div className="px-2 py-1.5">Amount (₹)</div>
            </div>
            {/* The charge rows themselves grow to fill the remaining height:
                the group is flex-1 and each row is flex-1, so all five rows
                stretch to the SAME height and reach down to the TOTAL row —
                no separate filler gap between Delivery and TOTAL. */}
            <div className="flex-1 flex flex-col">
              {[
                ['Freight', num(lrData.freight)],
                ['B. Charge', num(lrData.bCharge)],
                ['Hamali', num(lrData.hamali)],
                ['Pick Up', num(lrData.pickup)],
                ['Delivery', num(lrData.delivery)],
              ].map(([label, val], idx, arr) => (
                <div key={label} className={`grid grid-cols-2 text-[15px] flex-1 ${idx < arr.length - 1 ? 'border-b border-slate-300' : ''}`}>
                  <div className="px-2 py-1 border-r border-slate-400 flex items-center">{label}</div>
                  <div className="px-2 py-1 text-right flex items-center justify-end">{hidePrice ? '' : (val ? val.toLocaleString('en-IN') : '')}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 text-[16px] font-bold bg-slate-50 border-t border-slate-400">
              <div className="px-2 py-1.5 border-r border-slate-400">TOTAL</div>
              <div className="px-2 py-1.5 text-right">{hidePrice ? '' : `₹${grandTotal.toLocaleString('en-IN')}`}</div>
            </div>
          </div>
        </div>

        {/* ── Caution + Notice — split 50 / 50 with a divider so it's clear
            where CAUTION ends and NOTICE begins. ── */}
        <div className="grid grid-cols-2 text-[8px] text-slate-600 leading-snug">
          <div className="px-2 py-1 border-r border-slate-400">
            <span className="font-bold">CAUTION : </span><span className="italic">{COMPANY.caution}</span>
          </div>
          <div className="px-2 py-1">
            <span className="font-bold">NOTICE : </span>{COMPANY.notice}
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-6 pt-6 text-center text-[11px] font-semibold text-slate-700">
        <div className="border-t border-slate-400 pt-1">Sign of Consignor</div>
        <div className="border-t border-slate-400 pt-1">Sign of Booking Officer</div>
        <div className="border-t border-slate-400 pt-1">Sign of Receiver</div>
      </div>
    </div>
  )
}
