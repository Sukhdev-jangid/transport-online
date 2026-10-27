// src/utils/items.js
// SINGLE SOURCE OF TRUTH for item counting across bill / challan / statement.
//
// Why this file exists: the three screens used to count a bill's PACKAGES and
// FREIGHT in 3-4 different places with 3-4 different parsers. When one diverged,
// a printed bill, challan and statement showed different numbers for the SAME
// bill. Every screen now calls these functions, so counting can never diverge.
//
// Pure JavaScript — no framework / DB dependency.

const n = (v) => Number(v) || 0

// Clean one item row: a blank-name row is DROPPED (returns null), quantity is a
// whole number >= 1, rate is >= 0, and totalAmount is ALWAYS recomputed from
// qty * rate (never trust a stale totalAmount sitting on the row).
export function normalizeItem(row) {
  const name = String(row?.itemName ?? '').trim()
  if (!name) return null            // ghost / blank-name row dies here
  const quantity = Math.max(1, Math.floor(n(row?.quantity) || 1))
  const rate = Math.max(0, n(row?.rate))
  return { ...row, itemName: name, quantity, rate, totalAmount: quantity * rate }
}

export function normalizeItems(list) {
  return (list || []).map(normalizeItem).filter(Boolean)
}

// Freight = sum of qty*rate over VALID rows only (ghost rows ignored).
export function itemsFreight(list) {
  return normalizeItems(list).reduce((s, it) => s + it.totalAmount, 0)
}

// Packages = sum of quantity over VALID rows only.
export function itemsPackages(list) {
  return normalizeItems(list).reduce((s, it) => s + it.quantity, 0)
}

// Challan / Statement do not carry a structured item array — they carry a
// SUMMARY STRING like "ENGINE (x2), TYRE (x4)". This counts packages out of it.
// Handles an array, a JSON-string, or plain text — all with one rule.
export function packagesFromSummary(items) {
  if (Array.isArray(items)) {
    const total = items.reduce((s, it) =>
      s + (Number(it?.quantity ?? it?.pkgs ?? it?.count ?? it?.qty ?? it?.packages ?? it?.pieces) || 0), 0)
    return total || items.length
  }
  const s = String(items || '')
  if (!s.trim()) return 0
  try { const p = JSON.parse(s); if (Array.isArray(p)) return packagesFromSummary(p) } catch (_) {}
  const marked = [...s.matchAll(/\(x\s*(\d+)\)/gi)]
  if (marked.length) return marked.reduce((acc, m) => acc + (Number(m[1]) || 0), 0)
  const unit = [...s.matchAll(/(\d+)\s*(?:nos|pcs|boxes|box|bags|bag|drums|drum|pkgs|pkg|cartons|ctn|parcels|items)/gi)]
  if (unit.length) return unit.reduce((acc, m) => acc + (Number(m[1]) || 0), 0)
  return s.split(',').filter(t => t.trim()).length
}

// Goods text: strip the "(xN)" quantity markers for a clean item name list.
export function goodsFromSummary(items) {
  return String(items || '').replace(/\s*\(x\s*\d+\)/gi, '').trim()
}
