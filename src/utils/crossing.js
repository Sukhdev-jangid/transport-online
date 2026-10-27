// src/utils/crossing.js
// Single source of truth for crossing money math and validation. Both the data
// layer (to stamp net_amount) and the UI (to preview totals) use these, so a
// crossing's net can never differ between the form, the list, and the ledger.

const n = (v) => Number(v) || 0

// Direction constants. OUTWARD = we handed goods to another transporter and owe
// them (payable). INWARD = another transporter handed goods to us and owes us
// (receivable). One flag on one table keeps the transporter ledger unified.
export const OUTWARD = 'outward'
export const INWARD = 'inward'

export const DIRECTIONS = [
  { key: OUTWARD, label: 'Outward (we pay)',   short: 'Outward', prefix: 'OUT' },
  { key: INWARD,  label: 'Inward (we receive)', short: 'Inward',  prefix: 'IN'  },
]

export const FREIGHT_BASIS = [
  { key: 'paid',  label: 'Paid' },
  { key: 'topay', label: 'To Pay' },
  { key: 'tbb',   label: 'TBB' },
]

export const PAYMENT_MODES = ['Cash', 'UPI', 'Bank', 'Cheque']

export function dirLabel(dir)  { return (DIRECTIONS.find(d => d.key === dir) || {}).short || dir }
export function dirPrefix(dir) { return dir === INWARD ? 'IN' : 'OUT' }

// The eight money lines that make up a crossing, plus the one deduction (kata).
// Net = sum(charges) − kata. All amounts are clamped to ≥ 0; net never goes
// below 0 (a deduction larger than the charges just zeroes it out).
export const CHARGE_FIELDS = [
  { key: 'crossingFreight', label: 'Crossing Freight', hint: 'Main amount for the onward leg' },
  { key: 'hamali',          label: 'Hamali',           hint: 'Loading / unloading labour' },
  { key: 'labour',          label: 'Labour',           hint: 'Extra labour (if split from hamali)' },
  { key: 'commission',      label: 'Commission',       hint: 'Broker / dalali' },
  { key: 'mamul',           label: 'Mamul',            hint: 'Customary charge at crossing point' },
  { key: 'biltyCharge',     label: 'Bilty Charge',     hint: 'GR / documentation fee' },
  { key: 'otherCharges',    label: 'Other',            hint: 'Any other charge (add a note)' },
]

// Clamp a money value: non-negative number, never NaN.
export function money(v) { return Math.max(0, n(v)) }
// Clamp a whole count (packages): non-negative integer.
export function count(v) { return Math.max(0, Math.floor(n(v))) }

// Compute the net amount of a crossing from its charge lines. Accepts either
// camelCase (form state) or snake_case (DB row) keys so it works everywhere.
export function crossingNet(c) {
  if (!c) return 0
  const g = (camel, snake) => money(c[camel] ?? c[snake])
  const charges =
    g('crossingFreight', 'crossing_freight') +
    g('hamali', 'hamali') +
    g('labour', 'labour') +
    g('commission', 'commission') +
    g('mamul', 'mamul') +
    g('biltyCharge', 'bilty_charge') +
    g('otherCharges', 'other_charges')
  const kata = g('kata', 'kata')
  return Math.max(0, charges - kata)
}

// Validate a crossing form. Returns an array of human-readable error strings
// (empty = valid). English, per the app's notification language.
export function validateCrossing(form) {
  const errors = []
  if (form.direction !== OUTWARD && form.direction !== INWARD) errors.push('Select a direction (Outward or Inward).')
  if (!String(form.transporterId || '').trim()) errors.push('Select a transporter.')
  if (!String(form.crossingDate || '').trim()) errors.push('Crossing date is required.')
  if (!String(form.fromStation || '').trim()) errors.push('From station is required.')
  if (!String(form.toStation || '').trim()) errors.push('To station is required.')

  const pkgs = count(form.packages)
  const wt = money(form.weight)
  if (pkgs <= 0 && wt <= 0) errors.push('Enter packages or weight (at least one).')

  if (money(form.crossingFreight) <= 0) errors.push('Crossing freight must be greater than 0.')

  // Date sanity: crossing date should not be before the GR date.
  if (form.grDate && form.crossingDate && form.crossingDate < form.grDate) {
    errors.push('Crossing date cannot be before the GR date.')
  }
  return errors
}

// Build a transporter's account summary from their crossings + payments. Keeps
// payable (we owe) and receivable (they owe) as two running tallies, then nets
// them. Pure — the page and the accounts list both call this.
//
//   payable    = opening(payable)    + Σ(outward nets) − Σ(payments we made)
//   receivable = opening(receivable) + Σ(inward nets)  − Σ(payments we received)
//   net = receivable − payable   ( >0 they owe us, <0 we owe them )
export function summarizeAccount(transporter, crossings, payments) {
  const openingPayable    = (transporter?.opening_type === 'payable')    ? money(transporter.opening_balance) : 0
  const openingReceivable = (transporter?.opening_type === 'receivable') ? money(transporter.opening_balance) : 0

  let outwardTotal = 0, inwardTotal = 0
  for (const c of (crossings || [])) {
    const net = n(c.net_amount) || crossingNet(c)
    if (c.direction === INWARD) inwardTotal += net
    else outwardTotal += net
  }

  let paid = 0, received = 0
  for (const p of (payments || [])) {
    if (p.direction === 'receive') received += money(p.amount)
    else paid += money(p.amount)
  }

  const payable    = Math.max(0, openingPayable + outwardTotal - paid)
  const receivable = Math.max(0, openingReceivable + inwardTotal - received)
  const net = receivable - payable   // >0 receivable, <0 payable

  return {
    outwardTotal, inwardTotal,
    paid, received,
    openingPayable, openingReceivable,
    payable, receivable,
    net,
    netLabel: net > 0 ? 'They owe us' : net < 0 ? 'We owe them' : 'Settled',
    crossingCount: (crossings || []).length,
    paymentCount: (payments || []).length,
  }
}
