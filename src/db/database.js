// src/db/database.js
// Transport SQLite Database Manager using sql.js
//
// Uses the asm.js build (all JS, no separate .wasm file) so the app runs
// 100% offline under Electron's file:// protocol — no CDN, no wasm fetch.
import initSqlJs from 'sql.js/dist/sql-asm.js'
import { applyCompanySettings } from '../config/company'
import { billTotal } from '../utils/billing'

let db = null
let SQL = null

export async function initDatabase() {
  if (db) return db

  SQL = await initSqlJs()

  const savedDb = await window.electronAPI?.loadDb()
  if (savedDb) {
    db = new SQL.Database(new Uint8Array(savedDb))
  } else {
    db = new SQL.Database()
  }

  createTables()      // ensure all tables/columns exist (new or existing db)
  applyCompanySettings(getCompanySettings())  // load saved branding into live COMPANY
  await saveDatabase()

  return db
}

// Hard refresh: throw away the in-memory database and re-read the actual
// transport.db file from disk, so the UI shows exactly what is persisted (not
// just whatever is currently in memory). Used by the header "Hard Refresh"
// button. Does NOT write anything — purely re-loads from the saved file.
export async function reloadDatabase() {
  if (!SQL) SQL = await initSqlJs()
  const savedDb = await window.electronAPI?.loadDb()
  if (db) { try { db.close() } catch (e) {} }
  db = savedDb ? new SQL.Database(new Uint8Array(savedDb)) : new SQL.Database()
  createTables()
  applyCompanySettings(getCompanySettings())
  return db
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      city TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      state TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS items_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_name TEXT UNIQUE NOT NULL,
      default_rate REAL DEFAULT 0,
      rate_type TEXT DEFAULT 'unit', -- 'unit' or 'kg'
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lr_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lr_number TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      from_city TEXT NOT NULL,
      to_city TEXT NOT NULL,
      consignor TEXT NOT NULL,
      consignor_phone TEXT,
      consignor_address TEXT,
      consignee TEXT NOT NULL,
      consignee_phone TEXT,
      consignee_address TEXT,
      items TEXT,
      freight REAL DEFAULT 0,
      b_charge REAL DEFAULT 0,
      hamali REAL DEFAULT 0,
      pickup REAL DEFAULT 0,
      delivery REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      advance_paid REAL DEFAULT 0,
      balance_due REAL DEFAULT 0,
      payment_type TEXT DEFAULT 'ToPay',
      status TEXT DEFAULT 'Pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shipment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER,
      item_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      rate REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      FOREIGN KEY (shipment_id) REFERENCES lr_entries(id)
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_number TEXT UNIQUE NOT NULL,
      vehicle_type TEXT DEFAULT 'Truck',
      model TEXT,
      capacity TEXT,
      ownership TEXT DEFAULT 'Owned',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      vehicle_number TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS maintenance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_number TEXT NOT NULL,
      service_type TEXT,
      service_date TEXT,
      cost REAL DEFAULT 0,
      odometer INTEGER DEFAULT 0,
      next_service_date TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      service_type TEXT,
      phone TEXT,
      city TEXT,
      gstin TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- A CHALLAN (loading sheet / manifest) is one truck trip. It references the
    -- bilties (lr_entries) loaded on that truck; the bilty details are read live
    -- at print time, so the challan itself stores only trip info + which bilties.
    CREATE TABLE IF NOT EXISTS challans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challan_number TEXT UNIQUE NOT NULL,
      manifest_date TEXT,
      vehicle_number TEXT,
      driver_name TEXT,
      driver_phone TEXT,
      from_centre TEXT,
      to_centre TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Link rows: which bilties are on a challan (ordered). Detail columns are
    -- NOT copied here — resolved from lr_entries at read/print time.
    CREATE TABLE IF NOT EXISTS challan_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challan_id INTEGER,
      lr_entry_id INTEGER,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (challan_id) REFERENCES challans(id)
    );

    CREATE TABLE IF NOT EXISTS statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_number TEXT UNIQUE NOT NULL,
      created_date TEXT NOT NULL,
      party_name TEXT NOT NULL,
      party_role TEXT DEFAULT 'consignor',
      period_label TEXT,
      total_bills INTEGER DEFAULT 0,
      total_packages INTEGER DEFAULT 0,
      total_amount REAL DEFAULT 0,
      bilty_ids TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  migrateSchema()
}

// Additive migrations for databases created before newer columns existed.
// Adds any column present in the current schema but missing from an older
// saved database, so upgrades never lose data or hit "no such column" errors.
function migrateSchema() {
  const addMissing = (table, columns) => {
    const existing = queryAll(`PRAGMA table_info(${table})`).map(c => c.name)
    columns.forEach(([name, ddl]) => {
      if (!existing.includes(name)) {
        try { db.run(`ALTER TABLE ${table} ADD COLUMN ${ddl}`) } catch (e) {}
      }
    })
  }

  addMissing('vehicles', [
    ['model', 'model TEXT'],
    ['capacity', 'capacity TEXT'],
    ['ownership', "ownership TEXT DEFAULT 'Owned'"],
  ])
  // Driver's assigned vehicle now lives directly on the driver row (the separate
  // Driver Assignments feature was removed).
  addMissing('drivers', [
    ['vehicle_number', 'vehicle_number TEXT'],
  ])
  // 'status' is no longer used on vehicles — drop it from older databases.
  try {
    const cols = queryAll('PRAGMA table_info(vehicles)').map(c => c.name)
    if (cols.includes('status')) db.run('ALTER TABLE vehicles DROP COLUMN status')
  } catch (e) { /* older SQLite without DROP COLUMN: harmless to leave the column */ }

  addMissing('lr_entries', [
    ['consignor_phone', 'consignor_phone TEXT'],
    ['consignor_address', 'consignor_address TEXT'],
    ['consignee_phone', 'consignee_phone TEXT'],
    ['consignee_address', 'consignee_address TEXT'],
    // Link each bill to a saved customer (account/ledger). NULL when the sender/
    // receiver was typed as a one-off (not picked from the customer list).
    ['consignor_id', 'consignor_id INTEGER'],
    ['consignee_id', 'consignee_id INTEGER'],
    ['b_charge', 'b_charge REAL DEFAULT 0'],
    ['hamali', 'hamali REAL DEFAULT 0'],
    ['pickup', 'pickup REAL DEFAULT 0'],
    ['delivery', 'delivery REAL DEFAULT 0'],
    ['total_amount', 'total_amount REAL DEFAULT 0'],
    ['advance_paid', 'advance_paid REAL DEFAULT 0'],
    ['balance_due', 'balance_due REAL DEFAULT 0'],
    ['payment_type', "payment_type TEXT DEFAULT 'ToPay'"],
    ['status', "status TEXT DEFAULT 'Pending'"],
    ['items', 'items TEXT'],
  ])

  addMissing('vendors', [
    ['address', 'address TEXT'],
  ])

  // Drop tables for removed features so older saved databases are cleaned up.
  ;['inventory', 'restock_requests'].forEach(t => {
    try { db.run(`DROP TABLE IF EXISTS ${t}`) } catch (e) {}
  })
}

export async function saveDatabase() {
  if (!db) return
  const data = db.export()
  if (window.electronAPI) {
    // The main process never throws across IPC; it returns { ok, error }.
    // Callers are fire-and-forget, so on failure we broadcast a global event
    // instead of relying on an (ignored) rejected promise — the app shows a
    // persistent warning so the user knows their change was NOT saved.
    const res = await window.electronAPI.saveDb(data)
    if (res && res.ok === false) {
      window.dispatchEvent(new CustomEvent('db-save-failed', { detail: res.error }))
      // Throw so callers that await this can block print/success on a real
      // disk failure (disk full, file locked by backup/antivirus) instead of
      // silently proceeding with an in-memory-only row that is never persisted.
      throw new Error(res.error || 'Database could not be saved to disk')
    }
    return res
  }
}

function queryAll(sql, params = []) {
  const result = db.exec(sql, params)
  if (!result.length) return []
  const [{ columns, values }] = result
  return values.map(row => Object.fromEntries(columns.map((col, i) => [col, row[i]])))
}

// LR numbers are a plain running counter the owner seeds once (start 2400 →
// 2400, 2401, …). The next number is the highest existing numeric LR + 1, or the
// configured start if none exist yet. Old non-numeric bills (e.g. "LR2608...")
// parse to NaN and are ignored, so seeding a start never collides with them.
function generateLRNumber() {
  const { startNumber } = getLRNumberSettings()
  const next = Math.max(Number(startNumber) || 1, getCurrentMaxLRNumber() + 1)
  return `${next}`
}

// The highest numeric LR number that has actually been used so far (0 if none).
// Old non-numeric bills parse to NaN and are ignored.
export function getCurrentMaxLRNumber() {
  const rows = queryAll('SELECT lr_number FROM lr_entries')
  let maxN = 0
  for (const r of rows) {
    const n = parseInt(String(r.lr_number), 10)
    if (!Number.isNaN(n) && n > maxN) maxN = n
  }
  return maxN
}

// ── Locations Master ───────────────────────────────────
export function getLocations() {
  return queryAll('SELECT * FROM locations ORDER BY name')
}

export function addLocation(name, state = 'Rajasthan') {
  db.run('INSERT INTO locations (name, state) VALUES (?,?)', [name, state])
  saveDatabase()
  return getLocations()
}

export function updateLocation(id, { name, state }) {
  db.run('UPDATE locations SET name = ?, state = ? WHERE id = ?', [name, state, id])
  saveDatabase()
  return getLocations()
}

export function deleteLocation(id) {
  db.run('DELETE FROM locations WHERE id = ?', [id])
  saveDatabase()
  return getLocations()
}

// ── Items Master Rates ─────────────────────────────────
export function getItemsMaster() {
  const master = queryAll('SELECT * FROM items_master ORDER BY item_name')
  try {
    const shipmentRows = queryAll(
      'SELECT DISTINCT item_name, rate FROM shipment_items WHERE item_name IS NOT NULL AND TRIM(item_name) != ""'
    )
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
  db.run('INSERT INTO items_master (item_name, default_rate, rate_type, category) VALUES (?,?,?,?)',
    [itemName, defaultRate, rateType, category])
  await saveDatabase()   // wait for disk; throws on failure so caller can alert
  return getItemsMaster()
}

export async function updateItemMaster(id, { itemName, defaultRate, rateType, category }) {
  db.run('UPDATE items_master SET item_name = ?, default_rate = ?, rate_type = ?, category = ? WHERE id = ?',
    [itemName, defaultRate, rateType, category, id])
  await saveDatabase()
  return getItemsMaster()
}

export async function deleteItemMaster(id) {
  db.run('DELETE FROM items_master WHERE id = ?', [id])
  await saveDatabase()
  return getItemsMaster()
}

// ── Customer CRUD ─────────────────────────────────────
export function getCustomers() {
  return queryAll('SELECT * FROM customers ORDER BY name')
}

export async function addCustomer({ name, phone, city, address }) {
  db.run('INSERT INTO customers (name, phone, city, address) VALUES (?,?,?,?)',
    [name, phone, city, address])
  await saveDatabase()   // wait for disk; throws on failure so caller can alert
  return getCustomers()
}

export async function updateCustomer(id, { name, phone, city, address }) {
  db.run('UPDATE customers SET name = ?, phone = ?, city = ?, address = ? WHERE id = ?',
    [name, phone, city, address, id])
  await saveDatabase()
  return getCustomers()
}

export async function deleteCustomer(id) {
  db.run('DELETE FROM customers WHERE id = ?', [id])
  await saveDatabase()
  return getCustomers()
}

// Find existing customer by ID, exact/normalized name, or phone.
// If missing/new, automatically creates a customer in the customers table.
// If existing customer is found but has empty fields (phone/city/address), enrich them.
// Guaranteed not to merge two different parties that share a driver/broker phone.
// Returns { id: number, wasCreated: boolean }
export async function findOrCreateCustomer({ name, phone, city, address, existingId }) {
  const cleanName = (name || '').trim()
  if (!cleanName) return { id: null, wasCreated: false }

  const norm = s => (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const targetNorm = norm(cleanName)
  const all = getCustomers()
  const cleanPhone = (phone || '').replace(/\D/g, '')

  // 1. If existingId is provided, verify it still matches the typed party name
  if (existingId) {
    const byId = all.find(c => c.id === Number(existingId))
    if (byId && norm(byId.name) === targetNorm) {
      let needsUpdate = false
      let newPhone = byId.phone
      let newCity = byId.city
      let newAddr = byId.address
      if (!newPhone && cleanPhone.length === 10) { newPhone = (phone || '').trim(); needsUpdate = true }
      if (!newCity && city?.trim()) { newCity = city.trim(); needsUpdate = true }
      if (!newAddr && address?.trim()) { newAddr = address.trim(); needsUpdate = true }
      if (needsUpdate) {
        db.run('UPDATE customers SET phone = ?, city = ?, address = ? WHERE id = ?',
          [newPhone || '', newCity || '', newAddr || '', byId.id])
        await saveDatabase()
      }
      return { id: byId.id, wasCreated: false }
    }
  }

  // 2. Search by exact or normalized party name (Primary entity identifier)
  const byName = all.find(c => norm(c.name) === targetNorm)
  if (byName) {
    let needsUpdate = false
    let newPhone = byName.phone
    let newCity = byName.city
    let newAddr = byName.address
    if (!newPhone && cleanPhone.length === 10) { newPhone = (phone || '').trim(); needsUpdate = true }
    if (!newCity && city?.trim()) { newCity = city.trim(); needsUpdate = true }
    if (!newAddr && address?.trim()) { newAddr = address.trim(); needsUpdate = true }
    if (needsUpdate) {
      db.run('UPDATE customers SET phone = ?, city = ?, address = ? WHERE id = ?',
        [newPhone || '', newCity || '', newAddr || '', byName.id])
      await saveDatabase()
    }
    return { id: byName.id, wasCreated: false }
  }

  // 3. Search by 10-digit mobile number ONLY if the name is compatible/alias
  // (Prevents merging two different businesses who share a broker or booking agent phone)
  if (cleanPhone.length >= 10) {
    const byPhone = all.find(c => (c.phone || '').replace(/\D/g, '') === cleanPhone)
    if (byPhone) {
      const phoneNameNorm = norm(byPhone.name)
      // Check if names are compatible/variations of each other
      const isCompatible = phoneNameNorm.includes(targetNorm) || targetNorm.includes(phoneNameNorm)
      if (isCompatible) {
        let needsUpdate = false
        let newCity = byPhone.city
        let newAddr = byPhone.address
        if (!newCity && city?.trim()) { newCity = city.trim(); needsUpdate = true }
        if (!newAddr && address?.trim()) { newAddr = address.trim(); needsUpdate = true }
        if (needsUpdate) {
          db.run('UPDATE customers SET city = ?, address = ? WHERE id = ?',
            [newCity || '', newAddr || '', byPhone.id])
          await saveDatabase()
        }
        return { id: byPhone.id, wasCreated: false }
      }
      // If names are completely distinct (e.g. "Ram Traders" vs "Shyam Steels"),
      // fall through to step 4 to create a separate customer record.
    }
  }

  // 4. Party is new -> insert new customer record into customers table
  db.run('INSERT INTO customers (name, phone, city, address) VALUES (?,?,?,?)',
    [cleanName, (phone || '').trim(), (city || '').trim(), (address || '').trim()])
  const res = db.exec('SELECT last_insert_rowid() as id')
  const newId = res[0]?.values[0][0]
  // Wait for the disk write. If it fails, undo the in-memory insert so we never
  // report a "new customer" that isn't actually persisted — then throw so the
  // caller can abort the bill and alert the user.
  try {
    await saveDatabase()
  } catch (saveErr) {
    try { db.run('DELETE FROM customers WHERE id = ?', [newId]) } catch (e) {}
    throw saveErr
  }
  return { id: newId, wasCreated: true }
}

// Customer ACCOUNT / LEDGER: every bill linked to this customer (by id, set when
// the sender/receiver was picked from the customer list), split by role. Returns
// counts (as sender / as receiver / as both), money totals, and the bill list so
// the customer detail page can show a full account at a glance.
//   asSender   — bills where this customer is the consignor
//   asReceiver — bills where this customer is the consignee
//   asBoth     — bills where they are BOTH sender and receiver (rare)
//   totalBills — distinct bills they appear on (both counted once)
export function getCustomerAccount(customerId) {
  const id = Number(customerId)
  const num = (v) => Number(v) || 0

  // All bills where this customer is on either side, newest first.
  const bills = queryAll(
    `SELECT * FROM lr_entries
      WHERE consignor_id = ? OR consignee_id = ?
      ORDER BY id DESC`,
    [id, id]
  ).map(e => {
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
    // Outstanding: unpaid bills carry a balance.
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
export function getLREntries() {
  return queryAll('SELECT * FROM lr_entries ORDER BY id DESC')
}

export function getShipmentItems(shipmentId) {
  return queryAll('SELECT * FROM shipment_items WHERE shipment_id = ?', [shipmentId])
}

// Mark a Lorry Receipt as fully Paid: flip the payment type and settle the
// money (advance = grand total, balance due = 0). Used by the one-click
// "Mark Paid" button on the Bilty Records list.
export function markLRPaid(id) {
  db.run(
    `UPDATE lr_entries
       SET payment_type = 'Paid',
           advance_paid = COALESCE(NULLIF(total_amount, 0), freight),
           balance_due  = 0
     WHERE id = ?`,
    [id]
  )
  saveDatabase()
  return getLREntries()
}

// Mark many Lorry Receipts Paid at once (e.g. after a party settles their whole
// month). One UPDATE + one disk write for the whole set — same settle formula as
// markLRPaid. `ids` is an array of lr_entries.id; empty is a no-op.
export function markLRsPaid(ids) {
  const list = (ids || []).filter(v => v != null)
  if (list.length === 0) return getLREntries()
  const placeholders = list.map(() => '?').join(',')
  db.run(
    `UPDATE lr_entries
       SET payment_type = 'Paid',
           advance_paid = COALESCE(NULLIF(total_amount, 0), freight),
           balance_due  = 0
     WHERE id IN (${placeholders})`,
    list
  )
  saveDatabase()
  return getLREntries()
}

// Set a Lorry Receipt's payment type to any of Paid / ToPay / TBB and settle the
// money accordingly. Used by the payment-status buttons on the Bill detail page.
//   Paid        → fully settled (advance = grand total, balance = 0)
//   ToPay / TBB → amount is outstanding. Keeps any real advance already recorded,
//                 but if the bill was previously fully settled it resets the
//                 advance so the full amount shows as due again.
export function setLRPaymentType(id, type) {
  const e = getLREntries().find(r => r.id === id)
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

  db.run(
    `UPDATE lr_entries SET payment_type = ?, advance_paid = ?, balance_due = ? WHERE id = ?`,
    [type, advance, balance, id]
  )
  saveDatabase()
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
  const lrNumber = generateLRNumber()
  const itemSummary = itemsList.map(i => `${i.itemName} (x${i.quantity})`).join(', ')

  // Insert the LR and all its items atomically: if any item insert fails, roll
  // back so we never leave a parent LR with partial/missing items in the DB.
  let shipmentId
  db.run('BEGIN')
  try {
    db.run(`INSERT INTO lr_entries
      (lr_number, date, from_city, to_city,
       consignor, consignor_phone, consignor_address, consignor_id,
       consignee, consignee_phone, consignee_address, consignee_id,
       items, freight, b_charge, hamali, pickup, delivery, total_amount,
       advance_paid, balance_due, payment_type)
      VALUES (?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?,?,?, ?,?,?)`,
      [lrNumber, date, fromCity, toCity,
       consignor, consignorPhone || '', consignorAddress || '', consignorId || null,
       consignee, consigneePhone || '', consigneeAddress || '', consigneeId || null,
       itemSummary, freight || 0,
       bCharge || 0, hamali || 0, pickup || 0, delivery || 0, totalAmount || 0,
       advancePaid || 0, balanceDue || 0, paymentType])

    const res = db.exec('SELECT last_insert_rowid() as id')
    shipmentId = res[0]?.values[0][0]

    if (shipmentId && itemsList && itemsList.length > 0) {
      itemsList.forEach(item => {
        db.run(`INSERT INTO shipment_items (shipment_id, item_name, quantity, rate, total_amount)
          VALUES (?,?,?,?,?)`,
          [shipmentId, item.itemName, item.quantity || 1, item.rate || 0, item.totalAmount || 0])
      })
    }
    db.run('COMMIT')
  } catch (err) {
    try { db.run('ROLLBACK') } catch (e) {}
    throw err
  }

  // Persist to disk and WAIT for it. If the disk write fails (disk full, file
  // locked by backup/antivirus), undo the in-memory insert so the bill is not
  // left as a memory-only row — otherwise it would print, bump the LR counter,
  // and then vanish on restart (the exact 3655→3660 data-loss bug). Undoing it
  // keeps the counter honest and lets the caller show a clear failure.
  try {
    await saveDatabase()
  } catch (saveErr) {
    try {
      db.run('BEGIN')
      db.run('DELETE FROM shipment_items WHERE shipment_id = ?', [shipmentId])
      db.run('DELETE FROM lr_entries WHERE id = ?', [shipmentId])
      db.run('COMMIT')
    } catch (e) { try { db.run('ROLLBACK') } catch (e2) {} }
    throw saveErr
  }

  return { lrNumber, shipmentId }
}

// Update an existing LR and replace all its items. The LR number is NEVER
// changed (it's the permanent bill identifier); everything else can be edited.
// Items are replaced wholesale: delete the old rows and insert the new ones, so
// added/removed/edited item rows all end up correct. Done atomically — a failure
// mid-way rolls back and leaves the original bill untouched.
export function updateLREntryWithItems(id, {
  date, fromCity, toCity,
  consignor, consignorPhone, consignorAddress, consignorId,
  consignee, consigneePhone, consigneeAddress, consigneeId,
  itemsList, freight,
  bCharge, hamali, pickup, delivery, totalAmount,
  advancePaid, balanceDue, paymentType
}) {
  const itemSummary = (itemsList || []).map(i => `${i.itemName} (x${i.quantity})`).join(', ')

  db.run('BEGIN')
  try {
    db.run(`UPDATE lr_entries SET
        date = ?, from_city = ?, to_city = ?,
        consignor = ?, consignor_phone = ?, consignor_address = ?, consignor_id = ?,
        consignee = ?, consignee_phone = ?, consignee_address = ?, consignee_id = ?,
        items = ?, freight = ?, b_charge = ?, hamali = ?, pickup = ?, delivery = ?,
        total_amount = ?, advance_paid = ?, balance_due = ?, payment_type = ?
      WHERE id = ?`,
      [date, fromCity, toCity,
       consignor, consignorPhone || '', consignorAddress || '', consignorId || null,
       consignee, consigneePhone || '', consigneeAddress || '', consigneeId || null,
       itemSummary, freight || 0, bCharge || 0, hamali || 0, pickup || 0, delivery || 0,
       totalAmount || 0, advancePaid || 0, balanceDue || 0, paymentType,
       id])

    // Replace the item rows: clear then re-insert from the edited list.
    db.run('DELETE FROM shipment_items WHERE shipment_id = ?', [id])
    if (itemsList && itemsList.length > 0) {
      itemsList.forEach(item => {
        db.run(`INSERT INTO shipment_items (shipment_id, item_name, quantity, rate, total_amount)
          VALUES (?,?,?,?,?)`,
          [id, item.itemName, item.quantity || 1, item.rate || 0, item.totalAmount || 0])
      })
    }
    db.run('COMMIT')
  } catch (err) {
    try { db.run('ROLLBACK') } catch (e) {}
    throw err
  }

  saveDatabase()
  return getLREntries()
}

// ── Vehicle CRUD ─────────────────────────────────────
export function getVehicles() {
  return queryAll('SELECT * FROM vehicles ORDER BY created_at DESC')
}

export function addVehicle({ vehicleNumber, vehicleType, model, capacity, ownership = 'Owned' }) {
  db.run('INSERT INTO vehicles (vehicle_number, vehicle_type, model, capacity, ownership) VALUES (?,?,?,?,?)',
    [vehicleNumber, vehicleType, model || '', capacity || '', ownership])
  saveDatabase()
  return getVehicles()
}

export function updateVehicle(id, { vehicleNumber, vehicleType, model, capacity, ownership }) {
  db.run('UPDATE vehicles SET vehicle_number = ?, vehicle_type = ?, model = ?, capacity = ?, ownership = ? WHERE id = ?',
    [vehicleNumber, vehicleType, model || '', capacity || '', ownership || 'Owned', id])
  saveDatabase()
  return getVehicles()
}

export function deleteVehicle(id) {
  db.run('DELETE FROM vehicles WHERE id = ?', [id])
  saveDatabase()
  return getVehicles()
}

// ── Maintenance Logs CRUD ─────────────────────────────
export function getMaintenanceLogs() {
  return queryAll('SELECT * FROM maintenance_logs ORDER BY service_date DESC, id DESC')
}

export function addMaintenanceLog({ vehicleNumber, serviceType, serviceDate, cost, odometer, nextServiceDate, notes }) {
  db.run(`INSERT INTO maintenance_logs
    (vehicle_number, service_type, service_date, cost, odometer, next_service_date, notes)
    VALUES (?,?,?,?,?,?,?)`,
    [vehicleNumber, serviceType || 'General Service', serviceDate, Number(cost) || 0,
     Number(odometer) || 0, nextServiceDate || '', notes || ''])
  saveDatabase()
  return getMaintenanceLogs()
}


// ── Drivers Master CRUD ───────────────────────────────
// Drivers are their own records (name, phone, address). Each row also carries
// the vehicle they are currently on, resolved from the latest active
// assignment that matches the driver by name.
export function getDrivers() {
  // The driver's vehicle now lives directly on the driver row.
  return queryAll('SELECT * FROM drivers ORDER BY name')
}

export function addDriver({ name, phone, address, vehicleNumber }) {
  db.run('INSERT INTO drivers (name, phone, address, vehicle_number) VALUES (?,?,?,?)',
    [name, phone || '', address || '', vehicleNumber || ''])
  saveDatabase()
  return getDrivers()
}

export function updateDriver(id, { name, phone, address, vehicleNumber }) {
  db.run('UPDATE drivers SET name = ?, phone = ?, address = ?, vehicle_number = ? WHERE id = ?',
    [name, phone || '', address || '', vehicleNumber || '', id])
  saveDatabase()
  return getDrivers()
}

export function deleteDriver(id) {
  db.run('DELETE FROM drivers WHERE id = ?', [id])
  saveDatabase()
  return getDrivers()
}

// ── Challan (Loading Sheet / Manifest) CRUD ───────────
// A challan is one truck trip listing the bilties loaded on it. Challan numbers
// are a plain running counter (highest existing + 1, min 1).
function generateChallanNumber() {
  const rows = queryAll('SELECT challan_number FROM challans')
  let maxN = 0
  for (const r of rows) {
    const n = parseInt(String(r.challan_number), 10)
    if (!Number.isNaN(n) && n > maxN) maxN = n
  }
  return `${maxN + 1}`
}

export function peekNextChallanNumber() {
  return generateChallanNumber()
}

// All challans, newest first, each with its linked bilties resolved live from
// lr_entries (so any later edit to a bilty is reflected on the challan).
export function getChallans() {
  const challans = queryAll('SELECT * FROM challans ORDER BY id DESC')
  return challans.map(c => ({ ...c, bilties: getChallanBilties(c.id) }))
}

export function getChallan(id) {
  const rows = queryAll('SELECT * FROM challans WHERE id = ?', [id])
  if (!rows[0]) return null
  return { ...rows[0], bilties: getChallanBilties(id) }
}

// Resolve the bilties on a challan: join the link rows to the live lr_entries so
// Bilty No / Qty / Goods / Consignee / Mobile / To-Pay come from the real bill.
export function getChallanBilties(challanId) {
  return queryAll(
    `SELECT e.*, ci.sort_order
       FROM challan_items ci
       JOIN lr_entries e ON e.id = ci.lr_entry_id
      WHERE ci.challan_id = ?
      ORDER BY ci.sort_order, ci.id`,
    [challanId]
  )
}

// Create a challan and its link rows atomically. `lrIds` = array of lr_entries.id
// in the order they should appear on the sheet.
export async function addChallan({ manifestDate, vehicleNumber, driverName, driverPhone, fromCentre, toCentre, lrIds }) {
  const challanNumber = generateChallanNumber()
  let challanId
  db.run('BEGIN')
  try {
    db.run(
      `INSERT INTO challans
        (challan_number, manifest_date, vehicle_number, driver_name, driver_phone, from_centre, to_centre)
       VALUES (?,?,?,?,?,?,?)`,
      [challanNumber, manifestDate || '', vehicleNumber || '', driverName || '',
       driverPhone || '', fromCentre || '', toCentre || '']
    )
    const res = db.exec('SELECT last_insert_rowid() as id')
    challanId = res[0]?.values[0][0]
    ;(lrIds || []).forEach((lrId, i) => {
      db.run('INSERT INTO challan_items (challan_id, lr_entry_id, sort_order) VALUES (?,?,?)',
        [challanId, lrId, i])
    })
    db.run('COMMIT')
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
  // Wait for the disk write. If it fails, undo the in-memory insert so the
  // challan number isn't consumed by a row that never reached disk (same
  // memory-only data-loss bug as bills). Then throw so the caller can alert.
  try {
    await saveDatabase()
  } catch (saveErr) {
    try {
      db.run('BEGIN')
      db.run('DELETE FROM challan_items WHERE challan_id = ?', [challanId])
      db.run('DELETE FROM challans WHERE id = ?', [challanId])
      db.run('COMMIT')
    } catch (e) { try { db.run('ROLLBACK') } catch (e2) {} }
    throw saveErr
  }
  return getChallans()
}

// Update a challan's trip info and replace its bilty set.
export async function updateChallan(id, { manifestDate, vehicleNumber, driverName, driverPhone, fromCentre, toCentre, lrIds }) {
  db.run('BEGIN')
  try {
    db.run(
      `UPDATE challans SET
         manifest_date = ?, vehicle_number = ?, driver_name = ?, driver_phone = ?,
         from_centre = ?, to_centre = ?
       WHERE id = ?`,
      [manifestDate || '', vehicleNumber || '', driverName || '', driverPhone || '',
       fromCentre || '', toCentre || '', id]
    )
    db.run('DELETE FROM challan_items WHERE challan_id = ?', [id])
    ;(lrIds || []).forEach((lrId, i) => {
      db.run('INSERT INTO challan_items (challan_id, lr_entry_id, sort_order) VALUES (?,?,?)',
        [id, lrId, i])
    })
    db.run('COMMIT')
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
  await saveDatabase()
  return getChallans()
}

export async function deleteChallan(id) {
  db.run('BEGIN')
  try {
    db.run('DELETE FROM challan_items WHERE challan_id = ?', [id])
    db.run('DELETE FROM challans WHERE id = ?', [id])
    db.run('COMMIT')
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
  await saveDatabase()
  return getChallans()
}

// ── Vendors CRUD ──────────────────────────────────────
export function getVendors() {
  return queryAll('SELECT * FROM vendors ORDER BY name')
}

export function addVendor({ name, serviceType, phone, city, address, gstin }) {
  db.run('INSERT INTO vendors (name, service_type, phone, city, address, gstin) VALUES (?,?,?,?,?,?)',
    [name, serviceType || '', phone || '', city || '', address || '', gstin || ''])
  saveDatabase()
  return getVendors()
}

export function updateVendor(id, { name, serviceType, phone, city, address, gstin }) {
  db.run('UPDATE vendors SET name = ?, service_type = ?, phone = ?, city = ?, address = ?, gstin = ? WHERE id = ?',
    [name, serviceType || '', phone || '', city || '', address || '', gstin || '', id])
  saveDatabase()
  return getVendors()
}

export function deleteVendor(id) {
  db.run('DELETE FROM vendors WHERE id = ?', [id])
  saveDatabase()
  return getVendors()
}

// ── App Settings (company branding) ───────────────────
// Company/bill defaults are stored as a single JSON blob under the 'company'
// key so the whole config round-trips in one read/write.
export function getCompanySettings() {
  try {
    const rows = queryAll("SELECT value FROM app_settings WHERE key = 'company'")
    if (rows[0]?.value) return JSON.parse(rows[0].value)
  } catch (e) { /* corrupt/missing → fall back to defaults */ }
  return null
}

export function saveCompanySettings(settings) {
  const json = JSON.stringify(settings || {})
  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('company', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [json]
  )
  saveDatabase()
  // Apply immediately so open screens reflect the change without a reload.
  applyCompanySettings(settings)
  return getCompanySettings()
}

// ── LR Number scheme (prefix + starting counter) ──────
// Stored as JSON under the 'lr_number' key. Defaults keep the app usable before
// the owner configures anything.
// No prefix by default — the bill already prints the static "LR. No :" label,
// so the number stands alone (2400, 2401 …).
const LR_NUMBER_DEFAULTS = { startNumber: 1 }

export function getLRNumberSettings() {
  try {
    const rows = queryAll("SELECT value FROM app_settings WHERE key = 'lr_number'")
    if (rows[0]?.value) return { ...LR_NUMBER_DEFAULTS, ...JSON.parse(rows[0].value) }
  } catch (e) { /* missing/corrupt → defaults */ }
  return { ...LR_NUMBER_DEFAULTS }
}

export function saveLRNumberSettings({ startNumber }) {
  const wanted = Math.max(1, Math.floor(Number(startNumber) || 1))
  // Guard: you can only move the counter FORWARD. If bills already exist, the
  // start number must be higher than the last used LR — otherwise the sequence
  // would silently stay where it is (max+1) and the setting would look ignored.
  const maxUsed = getCurrentMaxLRNumber()
  if (maxUsed > 0 && wanted <= maxUsed) {
    throw new Error(`Last LR number already used is ${maxUsed}. Start number must be at least ${maxUsed + 1}.`)
  }
  const clean = { startNumber: wanted }
  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('lr_number', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(clean)]
  )
  saveDatabase()
  return clean
}

// Preview of the number the NEXT bill will get (for the settings screen).
export function peekNextLRNumber() {
  return generateLRNumber()
}

// ── Printer & Direct Print Settings ───────────────────
const PRINTER_SETTINGS_DEFAULTS = {
  directPrintEnabled: true,
  selectedPrinter: '',
  defaultCopies: 1,
}

export function getPrinterSettings() {
  try {
    const rows = queryAll("SELECT value FROM app_settings WHERE key = 'printer_settings'")
    if (rows[0]?.value) return { ...PRINTER_SETTINGS_DEFAULTS, ...JSON.parse(rows[0].value) }
  } catch (e) { /* corrupt/missing → defaults */ }
  return { ...PRINTER_SETTINGS_DEFAULTS }
}

export function savePrinterSettings(settings) {
  const current = getPrinterSettings()
  const clean = {
    directPrintEnabled: settings?.directPrintEnabled !== undefined ? Boolean(settings.directPrintEnabled) : current.directPrintEnabled,
    selectedPrinter: typeof settings?.selectedPrinter === 'string' ? settings.selectedPrinter.trim() : current.selectedPrinter,
    defaultCopies: Math.max(1, Math.min(Number(settings?.defaultCopies) || 1, 5)),
  }
  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('printer_settings', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(clean)]
  )
  saveDatabase()
  return clean
}

// ── Login / Password ──────────────────────────────────
// Auth is stored as a single JSON blob under the 'auth' key:
//   { password: {salt, hash}, recovery: {salt, hash} }
// The plain password/recovery code are NEVER stored — only salted PBKDF2
// hashes computed in the main process. A random recovery code is generated at
// setup so the owner can reset a forgotten password.
function getAuth() {
  try {
    const rows = queryAll("SELECT value FROM app_settings WHERE key = 'auth'")
    if (rows[0]?.value) return JSON.parse(rows[0].value)
  } catch (e) { /* missing/corrupt */ }
  return null
}

function writeAuth(auth) {
  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('auth', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(auth || {})]
  )
  saveDatabase()
}

// Has the owner set a password yet? (false on a fresh install)
export function isPasswordSet() {
  const a = getAuth()
  return !!(a && a.password && a.password.hash)
}

// First-run: set the password and generate a one-time recovery code (returned
// once so the UI can show it — it is only stored as a hash).
export async function setupPassword(password) {
  const pw = await window.electronAPI.hashPassword(password)
  // Human-friendly recovery code, e.g. HTC-4F9C-2A7B
  const rnd = () => Math.random().toString(16).slice(2, 6).toUpperCase()
  const recoveryCode = `HTC-${rnd()}-${rnd()}`
  const rec = await window.electronAPI.hashPassword(recoveryCode)
  writeAuth({ password: pw, recovery: rec })
  return recoveryCode
}

// Verify the login password.
export async function checkPassword(password) {
  const a = getAuth()
  if (!a || !a.password) return false
  return await window.electronAPI.verifyPassword(password, a.password)
}

// Change password (requires the current one).
export async function changePassword(currentPassword, newPassword) {
  if (!(await checkPassword(currentPassword))) return { ok: false, error: 'Current password is wrong' }
  const a = getAuth() || {}
  a.password = await window.electronAPI.hashPassword(newPassword)
  writeAuth(a)
  return { ok: true }
}

// Reset with the recovery code; sets a new password and issues a new code.
export async function resetPasswordWithRecovery(recoveryCode, newPassword) {
  const a = getAuth()
  if (!a || !a.recovery) return { ok: false, error: 'No recovery code on file' }
  const ok = await window.electronAPI.verifyPassword(recoveryCode.trim(), a.recovery)
  if (!ok) return { ok: false, error: 'Recovery code is wrong' }
  const newCode = await setupPassword(newPassword)   // resets password + new recovery
  return { ok: true, recoveryCode: newCode }
}

// ── Dashboard Stats (all real values from the database) ───
export function getDashboardStats() {
  const one = (sql) => Number(db.exec(sql)?.[0]?.values[0][0] || 0)
  // Revenue uses the stored grand total when present, else freight.
  const revenueSql = 'SELECT COALESCE(SUM(CASE WHEN total_amount > 0 THEN total_amount ELSE freight END),0) FROM lr_entries'
  return {
    totalLR:        one('SELECT COUNT(*) FROM lr_entries'),
    paidLR:         one("SELECT COUNT(*) FROM lr_entries WHERE payment_type='Paid'"),
    toPayLR:        one("SELECT COUNT(*) FROM lr_entries WHERE payment_type='ToPay'"),
    tbbLR:          one("SELECT COUNT(*) FROM lr_entries WHERE payment_type='TBB'"),
    totalRevenue:   one(revenueSql),
    // Money totals split by payment type (uses grand total, else freight).
    paidAmount:     one("SELECT COALESCE(SUM(CASE WHEN total_amount > 0 THEN total_amount ELSE freight END),0) FROM lr_entries WHERE payment_type='Paid'"),
    tbbAmount:      one("SELECT COALESCE(SUM(CASE WHEN total_amount > 0 THEN total_amount ELSE freight END),0) FROM lr_entries WHERE payment_type='TBB'"),
    balanceDue:     one('SELECT COALESCE(SUM(balance_due),0) FROM lr_entries'),
    totalCustomers: one('SELECT COUNT(*) FROM customers'),
    totalVendors:   one('SELECT COUNT(*) FROM vendors'),
    totalVehicles:  one('SELECT COUNT(*) FROM vehicles'),
    totalDrivers:   one('SELECT COUNT(*) FROM drivers'),
  }
}

// ── Statements ──────────────────────────────────────────────────
export function generateStatementNumber() {
  const rows = queryAll('SELECT statement_number FROM statements')
  let maxN = 0
  for (const r of rows) {
    const match = String(r.statement_number || '').match(/\d+/)
    if (match) {
      const n = parseInt(match[0], 10)
      if (!Number.isNaN(n) && n > maxN) maxN = n
    }
  }
  return `STMT-${maxN + 1}`
}

export function peekNextStatementNumber() {
  return generateStatementNumber()
}

export function getStatements() {
  return queryAll('SELECT * FROM statements ORDER BY id DESC')
}

export function getStatement(id) {
  const rows = queryAll('SELECT * FROM statements WHERE id = ?', [id])
  if (!rows[0]) return null
  return rows[0]
}

export async function addStatement({ createdDate, partyName, partyRole, periodLabel, totalBills, totalPackages, totalAmount, biltyIds }) {
  const statementNumber = generateStatementNumber()
  let statementId
  db.run('BEGIN')
  try {
    db.run(
      `INSERT INTO statements (statement_number, created_date, party_name, party_role, period_label, total_bills, total_packages, total_amount, bilty_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        statementNumber,
        createdDate || todayISO(),
        partyName || 'All Parties',
        partyRole || 'all',
        periodLabel || 'All Time',
        totalBills || 0,
        totalPackages || 0,
        totalAmount || 0,
        JSON.stringify(biltyIds || [])
      ]
    )
    const res = db.exec('SELECT last_insert_rowid() as id')
    statementId = res[0]?.values[0][0]
    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  }
  // Wait for the disk write; undo the in-memory row and throw if it fails, so a
  // statement number is never consumed by a row that never reached disk.
  try {
    await saveDatabase()
  } catch (saveErr) {
    try { db.run('DELETE FROM statements WHERE id = ?', [statementId]) } catch (e) {}
    throw saveErr
  }
  return statementNumber
}

export async function deleteStatement(id) {
  db.run('BEGIN')
  try {
    db.run('DELETE FROM statements WHERE id = ?', [id])
    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  }
  await saveDatabase()
}
