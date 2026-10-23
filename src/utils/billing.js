// src/utils/billing.js
// Single source of truth for a bill's money totals.
//
// Grand total (charges-first): freight + all extra charges; if that sum is zero
// (older / partial rows), fall back to the stored total_amount, then bare
// freight. This is the SAME formula the money-settlement code
// (markLRPaid / setLRPaymentType in database.js) and the printed Bilty / Challan
// documents use — i.e. the amount a customer actually pays. Every screen that
// shows a bill total must call this so a future charge change is a one-line edit
// here, not a hunt across a dozen files.
//
// Reads BOTH row shapes so every caller can share it:
//   • DB rows (snake_case): b_charge, total_amount, payment_type
//   • form / lrData objects (camelCase): bCharge, totalAmount, paymentType
// (?? only falls through on null/undefined, so a genuine 0 is preserved.)

const n = (v) => Number(v) || 0

export function billTotal(e) {
  if (!e) return 0
  const freight  = n(e.freight)
  const charges  = freight
    + n(e.b_charge ?? e.bCharge)
    + n(e.hamali)
    + n(e.pickup)
    + n(e.delivery)
  const stored = n(e.total_amount ?? e.totalAmount)
  return charges || stored || freight
}

// To-Pay amount = the grand total, but zero once the bill is marked Paid.
export function toPayTotal(e) {
  if (!e) return 0
  const paid = (e.payment_type ?? e.paymentType) === 'Paid'
  return paid ? 0 : billTotal(e)
}
