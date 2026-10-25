// src/db/database.js
// Transport data layer — now backed by Supabase (PostgreSQL) instead of the old
// offline sql.js database. Every function talks to Supabase over the network,
// so they are ALL async. The public function names are kept identical to the
// old offline module so the pages only need to add `await`.
//
// There is no local file to save: Supabase persists every insert/update/delete
// on the server immediately. `saveDatabase()` / `reloadDatabase()` are kept as
// no-ops / light helpers so existing callers keep working.
import { supabase } from './supabaseClient'
import { applyCompanySettings } from '../config/company'
import { billTotal } from '../utils/billing'
import { currentBranchId, viewBranchId, settingsBranchId } from './session'

// Thrown when an admin tries to create a record while on "All Branches" (no
// branch chosen). The create pages catch this and show "pick a branch first".
export const NO_BRANCH_SELECTED = 'NO_BRANCH_SELECTED'

// The branch new records (and their server-generated numbers) belong to. Passed
// explicitly into the numbering RPCs so an admin working in a selected branch
// gets THAT branch's number series, not their home branch's. Null means the
// admin is on "All Branches" and must pick one before creating anything.
function targetBranchId() {
  const bid = currentBranchId()
  if (bid == null) throw new Error(NO_BRANCH_SELECTED)
  return bid
}

const todayISO = () => new Date().toISOString().slice(0, 10)

// Throw a clean Error from a Supabase { data, error } result; else return data.
function unwrap({ data, error }) {
  if (error) throw new Error(error.message || 'Database error')
  return data
}

// Stamp a new row with the branch it belongs to so it passes the RLS branch
// check. For staff/sub-admin that is always their home branch. For an admin it
// is the branch currently selected in the header switcher — and if they are on
// "All Branches" (no branch chosen) we refuse the write instead of guessing, so
// a record never lands in the wrong branch. Every INSERT goes through this.
function withBranch(obj) {
  return { ...obj, branch_id: targetBranchId() }
}

// Scope a SELECT query to the branch the user is currently viewing. RLS already
// hides other branches from staff/sub-admins; this additionally lets an admin
// narrow the view to one branch via the header switcher. When the admin picks
// "All Branches" (viewBranchId() === null) no filter is applied, so every
// branch's rows come through.
function scopeBranch(query) {
  const bid = viewBranchId()
  return bid == null ? query : query.eq('branch_id', bid)
}

// ── Init ──────────────────────────────────────────────
// Schema lives on Supabase (see supabase/schema.sql). Here we just load saved
// company branding into the live COMPANY object so the UI reflects it on boot.
export async function initDatabase() {
  try {
    const settings = await getCompanySettings()
    applyCompanySettings(settings)
  } catch (e) { /* not signed in yet / network — ignore, defaults apply */ }
  return true
}

// Kept for compatibility with pages' "Hard Refresh" buttons. With Supabase each
// read already fetches fresh server data, so this just re-applies branding.
export async function reloadDatabase() {
  try {
    const settings = await getCompanySettings()
    applyCompanySettings(settings)
  } catch (e) { /* ignore */ }
  return true
}

// No-op: Supabase writes are persisted server-side immediately. Kept so any
// stray caller does not break.
export async function saveDatabase() { return { ok: true } }

// ── Locations Master ───────────────────────────────────
export async function getLocations() {
  return unwrap(await scopeBranch(supabase.from('locations').select('*')).order('name')) || []
}

export async function addLocation(name, state = 'Rajasthan') {
  unwrap(await supabase.from('locations').insert(withBranch({ name, state })))
  return getLocations()
}

export async function updateLocation(id, { name, state }) {
  unwrap(await supabase.from('locations').update({ name, state }).eq('id', id))
  return getLocations()
}

export async function deleteLocation(id) {
  unwrap(await supabase.from('locations').delete().eq('id', id))
  return getLocations()
}

// ── Items Master Rates ─────────────────────────────────
export async function getItemsMaster() {
  const master = unwrap(await scopeBranch(supabase.from('items_master').select('*')).order('item_name')) || []
  try {
    // Include item names that only ever appeared on shipments (historical), so
    // the autocomplete/list still shows them even if never added to the master.
    const shipmentRows = unwrap(
      await scopeBranch(supabase.from('shipment_items').select('item_name, rate'))
    ) || []
    const existingNames = new Set(master.map(m => m.item_name?.trim().toLowerCase()))
    for (const row of shipmentRows) {
      const clean = row.item_name?.trim()
      if (clean && !existingNames.has(clean.toLowerCase())) {
        existingNames.add(clean.toLowerCase())
        master.push({
          id: 'hist_' + clean,
          item_name: clean,
          default_rate: Number(row.rate) || 0,
          rate_type: 'unit',
          category: 'General',
        })
      }
    }
  } catch (e) { /* ignore */ }
  return master
}

export async function addItemMaster({ itemName, defaultRate, rateType = 'unit', category = 'General' }) {
  unwrap(await supabase.from('items_master').insert(withBranch({
    item_name: itemName, default_rate: defaultRate, rate_type: rateType, category,
  })))
  return getItemsMaster()
}

export async function updateItemMaster(id, { itemName, defaultRate, rateType, category }) {
  unwrap(await supabase.from('items_master').update({
    item_name: itemName, default_rate: defaultRate, rate_type: rateType, category,
  }).eq('id', id))
  return getItemsMaster()
}

export async function deleteItemMaster(id) {
  unwrap(await supabase.from('items_master').delete().eq('id', id))
  return getItemsMaster()
}

// ── Customer CRUD ─────────────────────────────────────
export async function getCustomers() {
  return unwrap(await scopeBranch(supabase.from('customers').select('*')).order('name')) || []
}

export async function addCustomer({ name, phone, city, address }) {
  unwrap(await supabase.from('customers').insert(withBranch({ name, phone, city, address })))
  return getCustomers()
}

export async function updateCustomer(id, { name, phone, city, address }) {
  unwrap(await supabase.from('customers').update({ name, phone, city, address }).eq('id', id))
  return getCustomers()
}

export async function deleteCustomer(id) {
  unwrap(await supabase.from('customers').delete().eq('id', id))
  return getCustomers()
}

// Find existing customer by ID, exact/normalized name, or phone; create if new.
// Enriches blank fields on an existing match. Mirrors the old offline logic.
// Returns { id, wasCreated }.
export async function findOrCreateCustomer({ name, phone, city, address, existingId }) {
  const cleanName = (name || '').trim()
  if (!cleanName) return { id: null, wasCreated: false }

  const norm = s => (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const targetNorm = norm(cleanName)
  const all = await getCustomers()
  const cleanPhone = (phone || '').replace(/\D/g, '')

  const enrich = async (row, { withPhone }) => {
    let patch = {}
    if (withPhone && !row.phone && cleanPhone.length === 10) patch.phone = (phone || '').trim()
    if (!row.city && city?.trim()) patch.city = city.trim()
    if (!row.address && address?.trim()) patch.address = address.trim()
    if (Object.keys(patch).length) {
      unwrap(await supabase.from('customers').update(patch).eq('id', row.id))
    }
  }

  // 1. existingId still matches the typed name
  if (existingId) {
    const byId = all.find(c => c.id === Number(existingId))
    if (byId && norm(byId.name) === targetNorm) {
      await enrich(byId, { withPhone: true })
      return { id: byId.id, wasCreated: false }
    }
  }

  // 2. exact/normalized name match
  const byName = all.find(c => norm(c.name) === targetNorm)
  if (byName) {
    await enrich(byName, { withPhone: true })
    return { id: byName.id, wasCreated: false }
  }

  // 3. phone match ONLY if names are compatible (avoid merging two businesses
  //    that share a broker/booking-agent phone)
  if (cleanPhone.length >= 10) {
    const byPhone = all.find(c => (c.phone || '').replace(/\D/g, '') === cleanPhone)
    if (byPhone) {
      const phoneNameNorm = norm(byPhone.name)
      const isCompatible = phoneNameNorm.includes(targetNorm) || targetNorm.includes(phoneNameNorm)
      if (isCompatible) {
        await enrich(byPhone, { withPhone: false })
        return { id: byPhone.id, wasCreated: false }
      }
    }
  }

  // 4. new customer
  const rows = unwrap(await supabase.from('customers').insert(withBranch({
    name: cleanName, phone: (phone || '').trim(), city: (city || '').trim(), address: (address || '').trim(),
  })).select('id'))
  const newId = rows?.[0]?.id
  return { id: newId, wasCreated: true }
}

// Customer ACCOUNT / LEDGER: every bill linked to this customer (by id), split
// by role. Returns counts, money totals, and the bill list.
export async function getCustomerAccount(customerId) {
  const id = Number(customerId)
  const num = (v) => Number(v) || 0

  const rows = unwrap(await supabase
    .from('lr_entries')
    .select('*')
    .or(`consignor_id.eq.${id},consignee_id.eq.${id}`)
    .order('id', { ascending: false })) || []

  const bills = rows.map(e => {
    const isSender = e.consignor_id === id
    const isReceiver = e.consignee_id === id
    return {
      ...e,
      amount: billTotal(e),
      role: isSender && isReceiver ? 'Both' : isSender ? 'Sender' : 'Receiver',
    }
  })

  let asSender = 0, asReceiver = 0, asBoth = 0
  let totalAmount = 0, senderAmount = 0, receiverAmount = 0, toPay = 0
  for (const b of bills) {
    const sender = b.role === 'Sender' || b.role === 'Both'
    const receiver = b.role === 'Receiver' || b.role === 'Both'
    if (b.role === 'Both') asBoth++
    if (sender) asSender++
    if (receiver) asReceiver++
    totalAmount += b.amount
    if (sender) senderAmount += b.amount
    if (receiver && b.role !== 'Both') receiverAmount += b.amount
    if (b.payment_type !== 'Paid') toPay += num(b.balance_due) || b.amount
  }

  return {
    bills,
    totalBills: bills.length,
    asSender, asReceiver, asBoth,
    totalAmount, senderAmount, receiverAmount, toPay,
  }
}

// ── Multi-Item LR Entry CRUD ──────────────────────────
export async function getLREntries() {
  return unwrap(await scopeBranch(supabase.from('lr_entries').select('*')).order('id', { ascending: false })) || []
}

export async function getShipmentItems(shipmentId) {
  return unwrap(await supabase.from('shipment_items').select('*').eq('shipment_id', shipmentId)) || []
}

// The highest numeric LR number used so far (0 if none). Non-numeric parse to NaN.
export async function getCurrentMaxLRNumber() {
  let q = supabase.from('lr_entries').select('lr_number')
  const bid = currentBranchId()
  if (bid != null) q = q.eq('branch_id', bid)
  const rows = unwrap(await q) || []
  let maxN = 0
  for (const r of rows) {
    const n = parseInt(String(r.lr_number), 10)
    if (!Number.isNaN(n) && n > maxN) maxN = n
  }
  return maxN
}

// Mark one Lorry Receipt fully Paid (advance = grand total, balance = 0).
export async function markLRPaid(id) {
  const e = (await getLREntries()).find(r => r.id === id)
  const settle = e ? (Number(e.total_amount) || Number(e.freight) || 0) : 0
  unwrap(await supabase.from('lr_entries')
    .update({ payment_type: 'Paid', advance_paid: settle, balance_due: 0 })
    .eq('id', id))
  return getLREntries()
}

// Mark many Lorry Receipts Paid at once.
export async function markLRsPaid(ids) {
  const list = (ids || []).filter(v => v != null)
  if (list.length === 0) return getLREntries()
  const all = await getLREntries()
  // Each bill settles to its own grand total, so update them individually.
  await Promise.all(list.map(id => {
    const e = all.find(r => r.id === id)
    const settle = e ? (Number(e.total_amount) || Number(e.freight) || 0) : 0
    return supabase.from('lr_entries')
      .update({ payment_type: 'Paid', advance_paid: settle, balance_due: 0 })
      .eq('id', id)
  }))
  return getLREntries()
}

// Set payment type to Paid / ToPay / TBB and settle the money accordingly.
export async function setLRPaymentType(id, type) {
  const e = (await getLREntries()).find(r => r.id === id)
  if (!e) return getLREntries()

  const num = (v) => Number(v) || 0
  const grandTotal = billTotal(e)

  let advance, balance
  if (type === 'Paid') {
    advance = grandTotal
    balance = 0
  } else {
    advance = num(e.advance_paid) >= grandTotal ? 0 : num(e.advance_paid)
    balance = Math.max(0, grandTotal - advance)
  }

  unwrap(await supabase.from('lr_entries')
    .update({ payment_type: type, advance_paid: advance, balance_due: balance })
    .eq('id', id))
  return getLREntries()
}

export async function addLREntryWithItems({
  date, fromCity, toCity,
  consignor, consignorPhone, consignorAddress, consignorId,
  consignee, consigneePhone, consigneeAddress, consigneeId,
  itemsList, freight,
  bCharge, hamali, pickup, delivery, totalAmount,
  advancePaid, balanceDue, paymentType
}) {
  // Server-side atomic LR number for the target branch (two users never collide,
  // and each branch keeps its own series).
  const lrNumber = unwrap(await supabase.rpc('next_lr_number', { p_branch_id: targetBranchId() }))
  const itemSummary = (itemsList || []).map(i => `${i.itemName} (x${i.quantity})`).join(', ')

  const inserted = unwrap(await supabase.from('lr_entries').insert(withBranch({
    lr_number: lrNumber, date, from_city: fromCity, to_city: toCity,
    consignor, consignor_phone: consignorPhone || '', consignor_address: consignorAddress || '', consignor_id: consignorId || null,
    consignee, consignee_phone: consigneePhone || '', consignee_address: consigneeAddress || '', consignee_id: consigneeId || null,
    items: itemSummary, freight: freight || 0,
    b_charge: bCharge || 0, hamali: hamali || 0, pickup: pickup || 0, delivery: delivery || 0, total_amount: totalAmount || 0,
    advance_paid: advancePaid || 0, balance_due: balanceDue || 0, payment_type: paymentType,
  })).select('id'))
  const shipmentId = inserted?.[0]?.id

  if (shipmentId && itemsList && itemsList.length > 0) {
    const itemRows = itemsList.map(item => withBranch({
      shipment_id: shipmentId,
      item_name: item.itemName,
      quantity: item.quantity || 1,
      rate: item.rate || 0,
      total_amount: item.totalAmount || 0,
    }))
    try {
      unwrap(await supabase.from('shipment_items').insert(itemRows))
    } catch (err) {
      // Roll back the parent so we never leave a bill with missing items.
      await supabase.from('lr_entries').delete().eq('id', shipmentId)
      throw err
    }
  }

  return { lrNumber, shipmentId }
}

// Update an LR and replace all its items. LR number never changes.
export async function updateLREntryWithItems(id, {
  date, fromCity, toCity,
  consignor, consignorPhone, consignorAddress, consignorId,
  consignee, consigneePhone, consigneeAddress, consigneeId,
  itemsList, freight,
  bCharge, hamali, pickup, delivery, totalAmount,
  advancePaid, balanceDue, paymentType
}) {
  const itemSummary = (itemsList || []).map(i => `${i.itemName} (x${i.quantity})`).join(', ')

  unwrap(await supabase.from('lr_entries').update({
    date, from_city: fromCity, to_city: toCity,
    consignor, consignor_phone: consignorPhone || '', consignor_address: consignorAddress || '', consignor_id: consignorId || null,
    consignee, consignee_phone: consigneePhone || '', consignee_address: consigneeAddress || '', consignee_id: consigneeId || null,
    items: itemSummary, freight: freight || 0, b_charge: bCharge || 0, hamali: hamali || 0, pickup: pickup || 0, delivery: delivery || 0,
    total_amount: totalAmount || 0, advance_paid: advancePaid || 0, balance_due: balanceDue || 0, payment_type: paymentType,
  }).eq('id', id))

  // Replace item rows wholesale.
  unwrap(await supabase.from('shipment_items').delete().eq('shipment_id', id))
  if (itemsList && itemsList.length > 0) {
    unwrap(await supabase.from('shipment_items').insert(itemsList.map(item => withBranch({
      shipment_id: id,
      item_name: item.itemName,
      quantity: item.quantity || 1,
      rate: item.rate || 0,
      total_amount: item.totalAmount || 0,
    }))))
  }
  return getLREntries()
}

// Preview of the number the NEXT bill will get (for forms/settings).
export async function peekNextLRNumber() {
  return unwrap(await supabase.rpc('next_lr_number', { p_branch_id: targetBranchId() }))
}

// ── Vehicle CRUD ─────────────────────────────────────
export async function getVehicles() {
  return unwrap(await scopeBranch(supabase.from('vehicles').select('*')).order('created_at', { ascending: false })) || []
}

export async function addVehicle({ vehicleNumber, vehicleType, model, capacity, ownership = 'Owned' }) {
  unwrap(await supabase.from('vehicles').insert(withBranch({
    vehicle_number: vehicleNumber, vehicle_type: vehicleType, model: model || '', capacity: capacity || '', ownership,
  })))
  return getVehicles()
}

export async function updateVehicle(id, { vehicleNumber, vehicleType, model, capacity, ownership }) {
  unwrap(await supabase.from('vehicles').update({
    vehicle_number: vehicleNumber, vehicle_type: vehicleType, model: model || '', capacity: capacity || '', ownership: ownership || 'Owned',
  }).eq('id', id))
  return getVehicles()
}

export async function deleteVehicle(id) {
  unwrap(await supabase.from('vehicles').delete().eq('id', id))
  return getVehicles()
}

// ── Maintenance Logs CRUD ─────────────────────────────
export async function getMaintenanceLogs() {
  return unwrap(await scopeBranch(supabase.from('maintenance_logs').select('*'))
    .order('service_date', { ascending: false }).order('id', { ascending: false })) || []
}

export async function addMaintenanceLog({ vehicleNumber, serviceType, serviceDate, cost, odometer, nextServiceDate, notes }) {
  unwrap(await supabase.from('maintenance_logs').insert(withBranch({
    vehicle_number: vehicleNumber, service_type: serviceType || 'General Service', service_date: serviceDate,
    cost: Number(cost) || 0, odometer: Number(odometer) || 0, next_service_date: nextServiceDate || '', notes: notes || '',
  })))
  return getMaintenanceLogs()
}

// ── Drivers Master CRUD ───────────────────────────────
export async function getDrivers() {
  return unwrap(await scopeBranch(supabase.from('drivers').select('*')).order('name')) || []
}

export async function addDriver({ name, phone, address, vehicleNumber }) {
  unwrap(await supabase.from('drivers').insert(withBranch({
    name, phone: phone || '', address: address || '', vehicle_number: vehicleNumber || '',
  })))
  return getDrivers()
}

export async function updateDriver(id, { name, phone, address, vehicleNumber }) {
  unwrap(await supabase.from('drivers').update({
    name, phone: phone || '', address: address || '', vehicle_number: vehicleNumber || '',
  }).eq('id', id))
  return getDrivers()
}

export async function deleteDriver(id) {
  unwrap(await supabase.from('drivers').delete().eq('id', id))
  return getDrivers()
}

// ── Challan (Loading Sheet / Manifest) CRUD ───────────
export async function peekNextChallanNumber() {
  return unwrap(await supabase.rpc('next_challan_number', { p_branch_id: targetBranchId() }))
}

// All challans, newest first, each with its linked bilties resolved live.
export async function getChallans() {
  const challans = unwrap(await scopeBranch(supabase.from('challans').select('*')).order('id', { ascending: false })) || []
  return Promise.all(challans.map(async c => ({ ...c, bilties: await getChallanBilties(c.id) })))
}

export async function getChallan(id) {
  const rows = unwrap(await supabase.from('challans').select('*').eq('id', id)) || []
  if (!rows[0]) return null
  return { ...rows[0], bilties: await getChallanBilties(id) }
}

// Resolve the bilties on a challan from the live lr_entries (via the link rows).
export async function getChallanBilties(challanId) {
  const links = unwrap(await supabase
    .from('challan_items')
    .select('lr_entry_id, sort_order, lr_entries(*)')
    .eq('challan_id', challanId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })) || []
  return links
    .filter(l => l.lr_entries)
    .map(l => ({ ...l.lr_entries, sort_order: l.sort_order }))
}

export async function addChallan({ manifestDate, vehicleNumber, driverName, driverPhone, fromCentre, toCentre, lrIds }) {
  const challanNumber = unwrap(await supabase.rpc('next_challan_number', { p_branch_id: targetBranchId() }))
  const inserted = unwrap(await supabase.from('challans').insert(withBranch({
    challan_number: challanNumber, manifest_date: manifestDate || '', vehicle_number: vehicleNumber || '',
    driver_name: driverName || '', driver_phone: driverPhone || '', from_centre: fromCentre || '', to_centre: toCentre || '',
  })).select('id'))
  const challanId = inserted?.[0]?.id
  if (challanId && lrIds && lrIds.length) {
    try {
      unwrap(await supabase.from('challan_items').insert(
        lrIds.map((lrId, i) => withBranch({ challan_id: challanId, lr_entry_id: lrId, sort_order: i }))
      ))
    } catch (err) {
      await supabase.from('challans').delete().eq('id', challanId)
      throw err
    }
  }
  return getChallans()
}

export async function updateChallan(id, { manifestDate, vehicleNumber, driverName, driverPhone, fromCentre, toCentre, lrIds }) {
  unwrap(await supabase.from('challans').update({
    manifest_date: manifestDate || '', vehicle_number: vehicleNumber || '', driver_name: driverName || '',
    driver_phone: driverPhone || '', from_centre: fromCentre || '', to_centre: toCentre || '',
  }).eq('id', id))
  unwrap(await supabase.from('challan_items').delete().eq('challan_id', id))
  if (lrIds && lrIds.length) {
    unwrap(await supabase.from('challan_items').insert(
      lrIds.map((lrId, i) => withBranch({ challan_id: id, lr_entry_id: lrId, sort_order: i }))
    ))
  }
  return getChallans()
}

export async function deleteChallan(id) {
  // challan_items has ON DELETE CASCADE, but delete explicitly for older schemas.
  unwrap(await supabase.from('challan_items').delete().eq('challan_id', id))
  unwrap(await supabase.from('challans').delete().eq('id', id))
  return getChallans()
}

// ── Vendors CRUD ──────────────────────────────────────
export async function getVendors() {
  return unwrap(await scopeBranch(supabase.from('vendors').select('*')).order('name')) || []
}

export async function addVendor({ name, serviceType, phone, city, address, gstin }) {
  unwrap(await supabase.from('vendors').insert(withBranch({
    name, service_type: serviceType || '', phone: phone || '', city: city || '', address: address || '', gstin: gstin || '',
  })))
  return getVendors()
}

export async function updateVendor(id, { name, serviceType, phone, city, address, gstin }) {
  unwrap(await supabase.from('vendors').update({
    name, service_type: serviceType || '', phone: phone || '', city: city || '', address: address || '', gstin: gstin || '',
  }).eq('id', id))
  return getVendors()
}

export async function deleteVendor(id) {
  unwrap(await supabase.from('vendors').delete().eq('id', id))
  return getVendors()
}

// ── App Settings (company branding etc.) ──────────────
// Each setting is one JSON blob stored under a key in app_settings.
async function getSetting(key) {
  // RLS already restricts rows to the caller's branch; filter by branch too so
  // an admin (who can read all branches) still gets ONE branch's setting. Uses
  // the display fallback (selected branch, or home branch on "All Branches") so
  // company branding always resolves to something, even before a branch is
  // chosen.
  let q = supabase.from('app_settings').select('value').eq('key', key)
  const bid = settingsBranchId()
  if (bid != null) q = q.eq('branch_id', bid)
  const rows = unwrap(await q) || []
  if (rows[0]?.value) {
    try { return JSON.parse(rows[0].value) } catch (e) { /* corrupt */ }
  }
  return null
}

async function saveSetting(key, obj) {
  // Settings are per-branch. Save to the display-fallback branch (selected, or
  // home on "All Branches") rather than blocking, so settings never throw.
  unwrap(await supabase.from('app_settings').upsert(
    { key, value: JSON.stringify(obj || {}), branch_id: settingsBranchId() },
    { onConflict: 'branch_id,key' }
  ))
}

export async function getCompanySettings() {
  return getSetting('company')
}

export async function saveCompanySettings(settings) {
  await saveSetting('company', settings || {})
  applyCompanySettings(settings)
  return getCompanySettings()
}

// ── LR Number scheme (starting counter) ───────────────
const LR_NUMBER_DEFAULTS = { startNumber: 1 }

export async function getLRNumberSettings() {
  const saved = await getSetting('lr_number')
  return saved ? { ...LR_NUMBER_DEFAULTS, ...saved } : { ...LR_NUMBER_DEFAULTS }
}

export async function saveLRNumberSettings({ startNumber }) {
  const wanted = Math.max(1, Math.floor(Number(startNumber) || 1))
  // Guard: the counter can only move FORWARD.
  const maxUsed = await getCurrentMaxLRNumber()
  if (maxUsed > 0 && wanted <= maxUsed) {
    throw new Error(`Last LR number already used is ${maxUsed}. Start number must be at least ${maxUsed + 1}.`)
  }
  const clean = { startNumber: wanted }
  await saveSetting('lr_number', clean)
  return clean
}

// ── Printer & Direct Print Settings ───────────────────
const PRINTER_SETTINGS_DEFAULTS = {
  directPrintEnabled: true,
  selectedPrinter: '',
  defaultCopies: 1,
}

export async function getPrinterSettings() {
  const saved = await getSetting('printer_settings')
  return saved ? { ...PRINTER_SETTINGS_DEFAULTS, ...saved } : { ...PRINTER_SETTINGS_DEFAULTS }
}

export async function savePrinterSettings(settings) {
  const current = await getPrinterSettings()
  const clean = {
    directPrintEnabled: settings?.directPrintEnabled !== undefined ? Boolean(settings.directPrintEnabled) : current.directPrintEnabled,
    selectedPrinter: typeof settings?.selectedPrinter === 'string' ? settings.selectedPrinter.trim() : current.selectedPrinter,
    defaultCopies: Math.max(1, Math.min(Number(settings?.defaultCopies) || 1, 5)),
  }
  await saveSetting('printer_settings', clean)
  return clean
}

// ── Dashboard Stats ───────────────────────────────────
// Computed in JS from the fetched rows (simple + avoids many round-trips).
export async function getDashboardStats() {
  const rows = await getLREntries()
  const num = (v) => Number(v) || 0
  const revenue = (e) => (num(e.total_amount) > 0 ? num(e.total_amount) : num(e.freight))

  const stats = {
    totalLR: rows.length,
    paidLR: 0, toPayLR: 0, tbbLR: 0,
    totalRevenue: 0, paidAmount: 0, tbbAmount: 0, balanceDue: 0,
    totalCustomers: 0, totalVendors: 0, totalVehicles: 0, totalDrivers: 0,
  }
  for (const e of rows) {
    stats.totalRevenue += revenue(e)
    stats.balanceDue += num(e.balance_due)
    if (e.payment_type === 'Paid') { stats.paidLR++; stats.paidAmount += revenue(e) }
    else if (e.payment_type === 'ToPay') { stats.toPayLR++ }
    else if (e.payment_type === 'TBB') { stats.tbbLR++; stats.tbbAmount += revenue(e) }
  }

  const count = async (table) => {
    const { count: c } = await scopeBranch(
      supabase.from(table).select('*', { count: 'exact', head: true })
    )
    return c || 0
  }
  const [customers, vendors, vehicles, drivers] = await Promise.all([
    count('customers'), count('vendors'), count('vehicles'), count('drivers'),
  ])
  stats.totalCustomers = customers
  stats.totalVendors = vendors
  stats.totalVehicles = vehicles
  stats.totalDrivers = drivers
  return stats
}

// ── All-Branches Report (admin only) ──────────────────
// A cross-branch overview: one row of totals per branch plus a combined grand
// total. Unlike every other read in this module, it does NOT scope to the
// active branch — it pulls EVERY branch's rows in one go (admin RLS allows it)
// and groups them in JS. Used by the admin "All Branches" report page.
export async function getAllBranchesReport() {
  const num = (v) => Number(v) || 0
  const revenue = (e) => (num(e.total_amount) > 0 ? num(e.total_amount) : num(e.freight))

  // Pull everything (no branch filter) in parallel.
  const [branches, lrs, customers, challans] = await Promise.all([
    unwrap(await supabase.from('branches').select('*').order('name')),
    unwrap(await supabase.from('lr_entries').select('branch_id, total_amount, freight, balance_due, payment_type')),
    unwrap(await supabase.from('customers').select('branch_id')),
    unwrap(await supabase.from('challans').select('branch_id')),
  ].map(p => p || []))

  // Seed one bucket per branch so even branches with no data show up.
  const blank = () => ({
    totalLR: 0, paidLR: 0, toPayLR: 0, tbbLR: 0,
    totalRevenue: 0, paidAmount: 0, tbbAmount: 0, balanceDue: 0,
    totalCustomers: 0, totalChallans: 0,
  })
  const byId = new Map()
  for (const b of (branches || [])) {
    byId.set(b.id, { branchId: b.id, branchName: b.name, branchCode: b.code || '', ...blank() })
  }
  // Fallback bucket for rows whose branch was deleted / is unknown.
  const other = () => {
    if (!byId.has(null)) byId.set(null, { branchId: null, branchName: 'Unassigned', branchCode: '', ...blank() })
    return byId.get(null)
  }
  const bucket = (bid) => byId.get(bid) || other()

  for (const e of (lrs || [])) {
    const s = bucket(e.branch_id)
    s.totalLR++
    s.totalRevenue += revenue(e)
    s.balanceDue += num(e.balance_due)
    if (e.payment_type === 'Paid') { s.paidLR++; s.paidAmount += revenue(e) }
    else if (e.payment_type === 'ToPay') { s.toPayLR++ }
    else if (e.payment_type === 'TBB') { s.tbbLR++; s.tbbAmount += revenue(e) }
  }
  for (const c of (customers || [])) bucket(c.branch_id).totalCustomers++
  for (const c of (challans || [])) bucket(c.branch_id).totalChallans++

  const perBranch = Array.from(byId.values())
    // Keep real branches first (sorted by name); drop an empty "Unassigned".
    .filter(r => r.branchId !== null || r.totalLR > 0 || r.totalCustomers > 0 || r.totalChallans > 0)

  // Combined grand total across every branch.
  const total = perBranch.reduce((t, r) => {
    for (const k of Object.keys(blank())) t[k] += r[k]
    return t
  }, blank())

  return { perBranch, total, branchCount: (branches || []).length }
}

// ── Statements ────────────────────────────────────────
export async function peekNextStatementNumber() {
  return unwrap(await supabase.rpc('next_statement_number', { p_branch_id: targetBranchId() }))
}

export async function getStatements() {
  return unwrap(await scopeBranch(supabase.from('statements').select('*')).order('id', { ascending: false })) || []
}

export async function getStatement(id) {
  const rows = unwrap(await supabase.from('statements').select('*').eq('id', id)) || []
  return rows[0] || null
}

export async function addStatement({ createdDate, partyName, partyRole, periodLabel, totalBills, totalPackages, totalAmount, biltyIds }) {
  const statementNumber = unwrap(await supabase.rpc('next_statement_number', { p_branch_id: targetBranchId() }))
  unwrap(await supabase.from('statements').insert(withBranch({
    statement_number: statementNumber,
    created_date: createdDate || todayISO(),
    party_name: partyName || 'All Parties',
    party_role: partyRole || 'all',
    period_label: periodLabel || 'All Time',
    total_bills: totalBills || 0,
    total_packages: totalPackages || 0,
    total_amount: totalAmount || 0,
    bilty_ids: biltyIds || [],
  })))
  return statementNumber
}

export async function deleteStatement(id) {
  unwrap(await supabase.from('statements').delete().eq('id', id))
}
