import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus, Trash2, Printer, Search, FileText, MapPin, User, Tag, Save, X,
  ArrowLeftRight, RefreshCw, Eye, Edit3, CheckCircle2, ShieldAlert, Clock
} from 'lucide-react'
import {
  getLREntries, addLREntryWithItems, updateLREntryWithItems, getShipmentItems,
  getLocations, addLocation,
  getItemsMaster,
  getCustomers, addCustomer, findOrCreateCustomer,
  peekNextLRNumber
} from '../db/database'
import BiltyInvoiceModal from '../components/BiltyInvoiceModal'
import { useRole } from '../context/RoleContext'
import { isValidPhone } from '../utils/validation'
import { normalizeItems, itemsFreight, itemsPackages } from '../utils/items'
import PhoneInput from '../components/PhoneInput'
import Select from '../components/Select'
import CityAutocomplete from '../components/CityAutocomplete'
import CustomerAutocomplete from '../components/CustomerAutocomplete'
import ItemAutocomplete from '../components/ItemAutocomplete'
import { fmtDate } from '../utils/date'
import { billTotal } from '../utils/billing'
import { playSound } from '../utils/sound'

const today = new Date().toISOString().split('T')[0]
const normName = s => (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')

export default function LREntry() {
  const { lrNumber: editLrParam } = useParams()
  const navigate = useNavigate()
  const [editId, setEditId] = useState(null)
  const isEditing = !!editLrParam

  const [entries, setEntries] = useState([])
  const [locations, setLocations] = useState([])
  const [itemsMaster, setItemsMaster] = useState([])
  const [customers, setCustomers] = useState([])
  const [nextLR, setNextLR] = useState('')

  // Admin on "All Branches" has no branch chosen, so a new bill would have no
  // home. We block booking until they pick a branch from the header switcher.
  const { isAdmin, activeBranch } = useRole()
  const noBranchChosen = isAdmin && activeBranch == null

  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)
  const [activeBilty, setActiveBilty] = useState(null)

  // Field refs for fast keyboard navigation
  const formRef = useRef(null)
  const fromCityRef = useRef(null)
  const toCityRef = useRef(null)
  const consignorNameRef = useRef(null)
  const consignorPhoneRef = useRef(null)
  const consignorAddressRef = useRef(null)
  const consigneeNameRef = useRef(null)
  const consigneePhoneRef = useRef(null)
  const consigneeAddressRef = useRef(null)
  const itemInputsRef = useRef([])
  const advanceInputRef = useRef(null)

  const focusItemField = (index, field) => {
    const row = itemInputsRef.current[index]
    if (!row) return
    if (field === 'name') row.name?.focus()
    else if (field === 'qty') row.qty?.focus()
    else if (field === 'rate') row.rate?.focus()
  }

  // Modals for inline creation
  const [showAddCity, setShowAddCity] = useState(false)
  const [newCityName, setNewCityName] = useState('')

  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [custTargetParty, setCustTargetParty] = useState('consignor') // 'consignor' | 'consignee'
  const [newCustForm, setNewCustForm] = useState({ name: '', phone: '', city: '', address: '' })

  // Guards against double-submit: while a save is in flight the button is
  // disabled and repeat clicks are ignored, so a bill / customer / city can
  // never be saved twice by rapid clicking.
  const [saving, setSaving] = useState(false)          // main LR booking submit
  const [savingCity, setSavingCity] = useState(false)  // inline add-city modal
  const [savingCust, setSavingCust] = useState(false)  // inline add-customer modal

  // Form State
  const [form, setForm] = useState({
    lrNumber: '',
    date: today,
    fromCity: '',
    toCity: '',
    consignor: '',
    consignorPhone: '',
    consignorAddress: '',
    consignorId: null,
    consignee: '',
    consigneePhone: '',
    consigneeAddress: '',
    consigneeId: null,
    paymentType: 'ToPay',
    advancePaid: 0,
    bCharge: 10,
    hamali: 0,
    pickup: 0,
    delivery: 0,
  })

  const [itemsList, setItemsList] = useState([
    { itemName: '', quantity: 1, rate: '', totalAmount: 0 }
  ])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    let active = true
    if (!editLrParam) {
      setEditId(null)
      peekNextLRNumber().then(nextNum => {
        if (!active) return
        setNextLR(nextNum)
        setForm(f => ({ ...f, lrNumber: nextNum }))
      })
      return () => { active = false }
    }
    ;(async () => {
      const rows = await getLREntries()
      const e = rows.find(r => r.lr_number === editLrParam)
      if (!active) return
      if (!e) { setEditId(null); return }
      setEditId(e.id)
      setForm({
        lrNumber: e.lr_number,
        date: e.date || today,
        fromCity: e.from_city || '',
        toCity: e.to_city || '',
        consignor: e.consignor || '',
        consignorPhone: e.consignor_phone || '',
        consignorAddress: e.consignor_address || '',
        consignorId: e.consignor_id ?? null,
        consignee: e.consignee || '',
        consigneePhone: e.consignee_phone || '',
        consigneeAddress: e.consignee_address || '',
        consigneeId: e.consignee_id ?? null,
        paymentType: e.payment_type || 'ToPay',
        advancePaid: e.advance_paid || 0,
        bCharge: e.b_charge || 0,
        hamali: e.hamali || 0,
        pickup: e.pickup || 0,
        delivery: e.delivery || 0,
      })
      const items = (await getShipmentItems(e.id)).map(it => ({
        itemName: it.item_name,
        quantity: it.quantity,
        rate: it.rate,
        totalAmount: it.total_amount,
      }))
      if (!active) return
      setItemsList(items.length ? items : [{ itemName: '', quantity: 1, rate: 0, totalAmount: 0 }])
    })()
    return () => { active = false }
  }, [editLrParam])

  // Keyboard shortcut: Ctrl+S to save and print
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        formRef.current?.requestSubmit()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Auto-focus From City when page loads in booking mode
  useEffect(() => {
    if (!isEditing) {
      setTimeout(() => fromCityRef.current?.focus(), 250)
    }
  }, [isEditing])

  const loadData = async () => {
    const [nextNum, lrs, locs, items, custs] = await Promise.all([
      peekNextLRNumber(), getLREntries(), getLocations(), getItemsMaster(), getCustomers(),
    ])
    setEntries(lrs)
    setNextLR(nextNum)
    setLocations(locs)
    setItemsMaster(items)
    setCustomers(custs)
    if (!editLrParam) {
      setForm(f => ({ ...f, lrNumber: f.lrNumber || nextNum }))
    }
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const resetBookingForm = async (autoFocus = true) => {
    const nextNum = await peekNextLRNumber()
    setNextLR(nextNum)
    setForm({
      lrNumber: nextNum,
      date: today,
      fromCity: '',
      toCity: '',
      consignor: '',
      consignorPhone: '',
      consignorAddress: '',
      consignorId: null,
      consignee: '',
      consigneePhone: '',
      consigneeAddress: '',
      consigneeId: null,
      paymentType: 'ToPay',
      advancePaid: 0,
      bCharge: 10,
      hamali: 0,
      pickup: 0,
      delivery: 0,
    })
    setItemsList([{ itemName: '', quantity: 1, rate: '', totalAmount: 0 }])
    if (autoFocus) {
      setTimeout(() => fromCityRef.current?.focus(), 150)
    }
  }

  const handleSwapRoute = () => {
    setForm(f => ({
      ...f,
      fromCity: f.toCity,
      toCity: f.fromCity,
    }))
  }

  // Active items pool: master items + any items typed in the current bill
  const activeItemsMaster = React.useMemo(() => {
    const list = [...itemsMaster]
    const existing = new Set(list.map(i => (i.item_name || '').trim().toLowerCase()))
    itemsList.forEach((row, idx) => {
      const name = (row.itemName || '').trim()
      if (name && !existing.has(name.toLowerCase())) {
        existing.add(name.toLowerCase())
        list.push({
          id: `curr_${idx}_${name}`,
          item_name: name,
          default_rate: Number(row.rate) || 0,
          rate_type: 'unit',
          category: 'Current',
        })
      }
    })
    return list
  }, [itemsMaster, itemsList])

  const handleItemChange = (index, typedName) => {
    const matchedMaster = itemsMaster.find(
      i => (i.item_name || '').toLowerCase() === (typedName || '').trim().toLowerCase()
    )
    setItemsList(prev => prev.map((row, i) => {
      if (i !== index) return row
      const qty = Number(row.quantity) || 1
      const rate = matchedMaster ? matchedMaster.default_rate : row.rate
      return {
        ...row,
        itemName: typedName,
        rate,
        totalAmount: qty * (Number(rate) || 0),
      }
    }))
  }

  const handleQtyWeightChange = (index, field, value) => {
    // Clamp as the user types: quantity -> whole >= 0, rate -> >= 0. Empty
    // string is allowed so the field can be cleared. normalizeItem() is the
    // final safety net at save/compute; this keeps the UI correct immediately.
    let clean = value
    if (value !== '') {
      if (field === 'quantity') clean = String(Math.max(0, Math.floor(Number(value) || 0)))
      else if (field === 'rate') clean = String(Math.max(0, Number(value) || 0))
    }
    setItemsList(prev => prev.map((row, i) => {
      if (i !== index) return row
      const updated = { ...row, [field]: clean }
      const qty = Number(field === 'quantity' ? clean : row.quantity) || 0
      const rate = Number(field === 'rate' ? clean : row.rate) || 0
      updated.totalAmount = qty * rate
      return updated
    }))
  }

  const addItemRow = () => {
    const nextIdx = itemsList.length
    setItemsList(prev => [
      ...prev,
      { itemName: '', quantity: 1, rate: '', totalAmount: 0 }
    ])
    setTimeout(() => focusItemField(nextIdx, 'name'), 60)
  }

  const removeItemRow = (index) => {
    if (itemsList.length === 1) return
    setItemsList(prev => prev.filter((_, i) => i !== index))
  }

  const handleRateEnter = (index) => {
    const currentRow = itemsList[index]
    if (index < itemsList.length - 1) {
      focusItemField(index + 1, 'name')
    } else if (currentRow?.itemName?.trim()) {
      // Completed this row -> auto-add next row and focus its item name
      const nextIdx = itemsList.length
      setItemsList(prev => [
        ...prev,
        { itemName: '', quantity: 1, rate: '', totalAmount: 0 }
      ])
      setTimeout(() => focusItemField(nextIdx, 'name'), 60)
    } else {
      advanceInputRef.current?.focus()
    }
  }

  const handleItemNameEnter = (index, pickedOrTyped) => {
    const text = (pickedOrTyped?.item_name || pickedOrTyped || itemsList[index]?.itemName || '').trim()
    if (!text) {
      // Empty item name and Enter pressed: clean up extra row if not the only one, and jump to advance
      if (index > 0 && itemsList.length > 1) {
        setItemsList(prev => prev.filter((_, i) => i !== index))
      }
      advanceInputRef.current?.focus()
    } else {
      focusItemField(index, 'qty')
    }
  }

  // Totals calculation — via the shared normalizer so blank-name ghost rows
  // (which may carry a stale totalAmount) never inflate freight or package
  // count. totalAmount is recomputed from qty*rate, never trusted raw.
  const totalFreight = itemsFreight(itemsList)
  const totalPackages = itemsPackages(itemsList)
  const bChargeNum = Number(form.bCharge) || 0
  const hamaliNum = Number(form.hamali) || 0
  const pickupNum = Number(form.pickup) || 0
  const deliveryNum = Number(form.delivery) || 0
  const extraCharges = bChargeNum + hamaliNum + pickupNum + deliveryNum
  const grandTotal = totalFreight + extraCharges
  const advancePaidNum = Number(form.advancePaid) || 0
  const balanceDue = Math.max(0, grandTotal - advancePaidNum)

  // Handle Add New City Inline
  const handleCreateCity = async (e) => {
    e.preventDefault()
    if (savingCity) return
    if (!newCityName.trim()) return
    setSavingCity(true)
    try {
      const updated = await addLocation(newCityName.trim())
      setLocations(updated)
      if (!form.fromCity) {
        setForm(f => ({ ...f, fromCity: newCityName.trim() }))
      } else if (!form.toCity) {
        setForm(f => ({ ...f, toCity: newCityName.trim() }))
      }
      showToast(`✓ Added city '${newCityName}'!`)
      setNewCityName('')
      setShowAddCity(false)
    } finally {
      setSavingCity(false)
    }
  }

  // Handle Add New Customer Inline
  const handleOpenAddCustomer = (party) => {
    setCustTargetParty(party)
    const isConsignor = party === 'consignor'
    setNewCustForm({
      name: isConsignor ? form.consignor : form.consignee,
      phone: isConsignor ? form.consignorPhone : form.consigneePhone,
      city: isConsignor ? form.fromCity : form.toCity,
      address: isConsignor ? form.consignorAddress : form.consigneeAddress,
    })
    setShowAddCustomer(true)
  }

  const handleCreateCustomer = async (e) => {
    e.preventDefault()
    if (savingCust) return
    if (!newCustForm.name.trim()) return
    if (!isValidPhone(newCustForm.phone)) {
      showToast('Phone must be exactly 10 digits!', 'error')
      return
    }
    setSavingCust(true)
    try {
      // addCustomer awaits the disk write — if it fails it throws and we land in
      // catch, so we never tell the user a party was saved when it wasn't.
      const updated = await addCustomer(newCustForm)
      setCustomers(updated)
      const created = updated.find(c => c.name === newCustForm.name && (c.phone || '') === (newCustForm.phone || ''))

      if (custTargetParty === 'consignor') {
        setForm(f => ({
          ...f,
          consignor: newCustForm.name,
          consignorId: created?.id ?? null,
          consignorPhone: newCustForm.phone,
          consignorAddress: newCustForm.address || f.consignorAddress,
        }))
      } else {
        setForm(f => ({
          ...f,
          consignee: newCustForm.name,
          consigneeId: created?.id ?? null,
          consigneePhone: newCustForm.phone,
          consigneeAddress: newCustForm.address || f.consigneeAddress,
        }))
      }

      showToast(`✓ Added customer '${newCustForm.name}' — saved to database!`)
      playSound(true)
      setNewCustForm({ name: '', phone: '', city: '', address: '' })
      setShowAddCustomer(false)
    } catch (err) {
      playSound(false)
      showToast('✗ CUSTOMER NOT SAVED! Disk error: ' + err.message + ' — try again.', 'error')
    } finally {
      setSavingCust(false)
    }
  }

  // Submit LR Booking Form
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return
    if (noBranchChosen) {
      showToast('Please select a branch from the top first — a new bill cannot be created in "All Branches".', 'error')
      return
    }
    if (!form.fromCity || !form.toCity) {
      showToast('Please select both From and To cities.', 'error')
      return
    }
    if (!form.consignor || !form.consignee) {
      showToast('Consignor and Consignee names are required!', 'error')
      return
    }
    if (!isValidPhone(form.consignorPhone)) {
      showToast('Consignor phone must be exactly 10 digits!', 'error')
      return
    }
    if (!isValidPhone(form.consigneePhone)) {
      showToast('Consignee phone must be exactly 10 digits!', 'error')
      return
    }

    // Same normalizer the form totals use — drops blank-name rows, clamps
    // qty/rate, recomputes totalAmount. Save payload therefore always matches
    // what is displayed and printed (no ghost-row freight mismatch).
    const validItems = normalizeItems(itemsList)
    if (validItems.length === 0) {
      showToast('Please add at least one item (item name is required).', 'error')
      return
    }

    setSaving(true)
    try {
      // Auto-match or auto-create Consignor & Consignee in customer master
      const consignorRes = await findOrCreateCustomer({
        name: form.consignor,
        phone: form.consignorPhone,
        city: form.fromCity,
        address: form.consignorAddress,
        existingId: form.consignorId,
      })

      const consigneeRes = await findOrCreateCustomer({
        name: form.consignee,
        phone: form.consigneePhone,
        city: form.toCity,
        address: form.consigneeAddress,
        existingId: form.consigneeId,
      })

      const finalConsignorId = consignorRes.id
      const finalConsigneeId = consigneeRes.id

      // Refresh customers state if any new party was created
      if (consignorRes.wasCreated || consigneeRes.wasCreated) {
        setCustomers(await getCustomers())
      }

      const charges = {
        bCharge: bChargeNum,
        hamali: hamaliNum,
        pickup: pickupNum,
        delivery: deliveryNum,
        totalAmount: grandTotal,
      }

      const lrPayload = {
        ...form,
        consignorId: finalConsignorId,
        consigneeId: finalConsigneeId,
        ...charges,
        itemsList: validItems,
        freight: totalFreight,
        advancePaid: advancePaidNum,
        balanceDue: balanceDue,
      }

      if (isEditing && editId) {
        await updateLREntryWithItems(editId, lrPayload)
        showToast(`✓ LR ${editLrParam} updated successfully!`)
        setTimeout(() => navigate(`/bilty/${encodeURIComponent(editLrParam)}`, { replace: true }), 500)
        return
      }

      // Save FIRST and wait for the disk write to succeed. If it fails, this
      // throws — we fall into catch, play the failure sound, and never open the
      // print modal, so a bill can only ever print AFTER it is safely on disk.
      const { lrNumber, shipmentId } = await addLREntryWithItems(lrPayload)

      const addedParties = []
      if (consignorRes.wasCreated) addedParties.push(`Sender (${form.consignor})`)
      if (consigneeRes.wasCreated) addedParties.push(`Receiver (${form.consignee})`)

      if (addedParties.length > 0) {
        showToast(`✓ LR ${lrNumber} saved! Added to Customers: ${addedParties.join(', ')}`)
      } else {
        showToast(`✓ LR ${lrNumber} saved successfully!`)
      }
      playSound(true)

      const newlySavedData = {
        ...lrPayload,
        lrNumber,
        shipmentId,
      }

      document.activeElement?.blur()
      setActiveBilty(newlySavedData)
      setEntries(await getLREntries())
      setNextLR(await peekNextLRNumber())
      resetBookingForm(false)
    } catch (err) {
      // Save failed: the bill was rolled back and is NOT on disk. Make this
      // impossible to miss — loud toast + failure buzzer. No print modal opens.
      playSound(false)
      showToast('✗ BILL NOT SAVED! Disk error: ' + err.message + ' — try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const filteredEntries = entries.filter(e =>
    [e.lr_number, e.consignor, e.consignee, e.from_city, e.to_city]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="p-3.5 max-w-[1550px] mx-auto space-y-3 font-sans">

      {/* Top Header Bar */}
      <div className="bg-white px-4 py-2.5 rounded-lg border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold">
            <FileText size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 leading-tight">
                {isEditing ? `Edit LR #${editLrParam}` : 'New LR Booking & Bilty'}
              </h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                Shortcuts: <kbd className="font-semibold text-slate-800">Enter</kbd> Next Field • <kbd className="font-semibold text-slate-800">Ctrl+S</kbd> Save & Print
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {isEditing
                ? 'Update shipment details, items and charges for this bill.'
                : 'Fast booking console with auto-suggest, live calculations, and instant bilty printing.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* LR Number Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white shadow-xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400">
              {isEditing ? 'LR No' : 'Next LR'}
            </span>
            <span className="font-mono text-sm font-bold text-emerald-400">
              #{isEditing ? editLrParam : (nextLR || '—')}
            </span>
          </div>

          {isEditing ? (
            <button
              type="button"
              onClick={() => navigate(`/bilty/${encodeURIComponent(editLrParam)}`)}
              className="btn btn-outline py-1 px-2.5 text-xs text-slate-600 cursor-pointer"
            >
              <X size={13} /> Cancel Edit
            </button>
          ) : (
            <button
              type="button"
              onClick={resetBookingForm}
              className="btn btn-outline py-1 px-2.5 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
              title="Clear all fields"
            >
              <RefreshCw size={13} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Admin on "All Branches": booking is blocked until a branch is picked. */}
      {noBranchChosen && (
        <div className="mb-2.5 flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-amber-800">
          <ShieldAlert size={16} className="shrink-0" />
          <span className="text-xs font-semibold">
            You are currently in "All Branches". Select a branch from the header above to create a new bill.
          </span>
        </div>
      )}

      {/* Main Booking Console Form */}
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-2.5">

        {/* Section 1: Core Logistics & Header (Clean Single Row) */}
        <div className="bg-white rounded-lg border border-slate-200/80 p-3 shadow-xs">
          <div className="grid grid-cols-12 gap-3 items-end">
            
            {/* Booking Date */}
            <div className="col-span-12 sm:col-span-3">
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                LR Date <span className="text-red-500">*</span>
              </label>
              <input
                className="form-input text-sm font-medium py-2 h-9.5"
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                required
              />
            </div>

            {/* From City */}
            <div className="col-span-12 sm:col-span-4">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  From (Origin) <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddCity(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                >
                  + Add City
                </button>
              </div>
              <CityAutocomplete
                value={form.fromCity}
                onChange={v => setForm(f => ({ ...f, fromCity: v }))}
                onNext={() => toCityRef.current?.focus()}
                inputRef={fromCityRef}
                disabled={!!activeBilty}
                locations={locations}
                placeholder="Type or select origin..."
                inputClassName="text-sm py-2 h-9.5 font-medium"
              />
            </div>

            {/* Route Swap Button */}
            <div className="col-span-12 sm:col-span-1 flex justify-center pb-0.5">
              <button
                type="button"
                onClick={handleSwapRoute}
                className="w-9 h-9.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-600 flex items-center justify-center transition shadow-2xs cursor-pointer"
                title="Swap Origin & Destination"
              >
                <ArrowLeftRight size={15} />
              </button>
            </div>

            {/* To City */}
            <div className="col-span-12 sm:col-span-4">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  To (Destination) <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddCity(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                >
                  + Add City
                </button>
              </div>
              <CityAutocomplete
                value={form.toCity}
                onChange={v => setForm(f => ({ ...f, toCity: v }))}
                onNext={() => consignorNameRef.current?.focus()}
                inputRef={toCityRef}
                disabled={!!activeBilty}
                locations={locations}
                placeholder="Type or select destination..."
                inputClassName="text-sm py-2 h-9.5 font-medium"
              />
            </div>

          </div>
        </div>

        {/* Section 2: Consignor & Consignee Parties (Side-by-Side 2-Col) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          
          {/* Consignor (Sender) Card */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Sender (Consignor)
                </span>
                {form.consignor?.trim() && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                    form.consignorId || customers.some(c => normName(c.name) === normName(form.consignor))
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {form.consignorId || customers.some(c => normName(c.name) === normName(form.consignor))
                      ? 'Saved Party'
                      : '+ Auto-saves to List'}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleOpenAddCustomer('consignor')}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline cursor-pointer"
              >
                <Plus size={13} /> New Party
              </button>
            </div>

            {/* Row 1: Name / Search */}
            <div>
              <CustomerAutocomplete
                value={form.consignor}
                customers={customers}
                inputRef={consignorNameRef}
                placeholder="Type sender name or mobile..."
                inputClassName="text-sm py-2 h-9.5 font-medium text-slate-800 placeholder:text-slate-400"
                onChange={val => setForm(f => ({ ...f, consignor: val, consignorId: null }))}
                onPick={c => setForm(f => ({
                  ...f,
                  consignor: c.name,
                  consignorId: c.id,
                  consignorPhone: c.phone || f.consignorPhone,
                  consignorAddress: c.address || f.consignorAddress,
                }))}
                onNext={picked => {
                  if (picked?.phone && picked?.address) {
                    consigneeNameRef.current?.focus()
                  } else if (picked?.phone) {
                    consignorAddressRef.current?.focus()
                  } else {
                    consignorPhoneRef.current?.focus()
                  }
                }}
              />
            </div>

            {/* Row 2: Phone & Address in 2 cols */}
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-5">
                <PhoneInput
                  value={form.consignorPhone}
                  onChange={v => setForm(f => ({ ...f, consignorPhone: v }))}
                  inputRef={consignorPhoneRef}
                  onNext={() => consignorAddressRef.current?.focus()}
                  inputClassName="text-sm py-2 h-9.5"
                  placeholder="10-digit mobile"
                />
              </div>
              <div className="col-span-7">
                <input
                  ref={consignorAddressRef}
                  className="form-input text-sm py-2 h-9.5"
                  type="text"
                  placeholder="Sender's pickup address..."
                  value={form.consignorAddress}
                  onChange={e => setForm(f => ({ ...f, consignorAddress: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      consigneeNameRef.current?.focus()
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Receiver (Consignee) Card */}
          <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-900"></span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Receiver (Consignee)
                </span>
                {form.consignee?.trim() && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                    form.consigneeId || customers.some(c => normName(c.name) === normName(form.consignee))
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {form.consigneeId || customers.some(c => normName(c.name) === normName(form.consignee))
                      ? 'Saved Party'
                      : '+ Auto-saves to List'}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleOpenAddCustomer('consignee')}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline cursor-pointer"
              >
                <Plus size={13} /> New Party
              </button>
            </div>

            {/* Row 1: Name / Search */}
            <div>
              <CustomerAutocomplete
                value={form.consignee}
                customers={customers}
                inputRef={consigneeNameRef}
                placeholder="Type receiver name or mobile..."
                inputClassName="text-sm py-2 h-9.5 font-medium text-slate-800 placeholder:text-slate-400"
                onChange={val => setForm(f => ({ ...f, consignee: val, consigneeId: null }))}
                onPick={c => setForm(f => ({
                  ...f,
                  consignee: c.name,
                  consigneeId: c.id,
                  consigneePhone: c.phone || f.consigneePhone,
                  consigneeAddress: c.address || f.consigneeAddress,
                }))}
                onNext={picked => {
                  if (picked?.phone && picked?.address) {
                    focusItemField(0, 'name')
                  } else if (picked?.phone) {
                    consigneeAddressRef.current?.focus()
                  } else {
                    consigneePhoneRef.current?.focus()
                  }
                }}
              />
            </div>

            {/* Row 2: Phone & Address in 2 cols */}
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-5">
                <PhoneInput
                  value={form.consigneePhone}
                  onChange={v => setForm(f => ({ ...f, consigneePhone: v }))}
                  inputRef={consigneePhoneRef}
                  onNext={() => consigneeAddressRef.current?.focus()}
                  inputClassName="text-sm py-2 h-9.5"
                  placeholder="10-digit mobile"
                />
              </div>
              <div className="col-span-7">
                <input
                  ref={consigneeAddressRef}
                  className="form-input text-sm py-2 h-9.5"
                  type="text"
                  placeholder="Receiver's delivery address..."
                  value={form.consigneeAddress}
                  onChange={e => setForm(f => ({ ...f, consigneeAddress: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      focusItemField(0, 'name')
                    }
                  }}
                />
              </div>
            </div>
          </div>

        </div>

        {/* Section 3: High-Density Goods & Items Table */}
        <div className="bg-white rounded-lg border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="bg-slate-50/80 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Tag size={13} className="text-blue-600" /> Goods & Shipment Items
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-600">
                {itemsList.length} {itemsList.length === 1 ? 'line' : 'lines'} • {totalPackages} pkgs
              </span>
            </div>
            <button
              type="button"
              onClick={addItemRow}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 px-2.5 py-1 rounded hover:bg-blue-50 transition cursor-pointer"
            >
              <Plus size={14} /> Add Item Row
            </button>
          </div>

          <div className="p-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-600 font-bold border-b border-slate-200 bg-slate-50/50">
                  <th className="text-left py-2 px-2.5 w-10 text-xs uppercase tracking-wider text-slate-400">#</th>
                  <th className="text-left py-2 px-2.5 text-xs uppercase tracking-wider">Item Description / Goods</th>
                  <th className="text-center py-2 px-2.5 w-28 text-xs uppercase tracking-wider">Qty / Pkgs</th>
                  <th className="text-right py-2 px-2.5 w-32 text-xs uppercase tracking-wider">Rate (₹)</th>
                  <th className="text-right py-2 px-3 w-36 text-xs uppercase tracking-wider">Freight (₹)</th>
                  <th className="text-center py-2 px-1 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itemsList.map((row, index) => (
                  <tr key={index} className="hover:bg-slate-50/50">
                    <td className="py-2 px-2.5 text-slate-400 font-mono text-xs text-center">
                      {index + 1}
                    </td>
                    <td className="py-2 px-2.5">
                      <ItemAutocomplete
                        value={row.itemName}
                        items={activeItemsMaster}
                        inputRef={el => {
                          if (!itemInputsRef.current[index]) itemInputsRef.current[index] = {}
                          itemInputsRef.current[index].name = el
                        }}
                        onNext={picked => handleItemNameEnter(index, picked)}
                        inputClassName="h-9 py-1.5 text-sm font-medium"
                        placeholder="Type item or pick master item..."
                        onChange={val => handleItemChange(index, val)}
                        onPick={i => {
                          const next = [...itemsList]
                          next[index].itemName = i.item_name
                          if (i.default_rate !== undefined && i.default_rate !== null) {
                            next[index].rate = i.default_rate
                            next[index].totalAmount = (Number(next[index].quantity) || 1) * Number(i.default_rate)
                          }
                          setItemsList(next)
                        }}
                      />
                    </td>
                    <td className="py-2 px-2.5">
                      <input
                        ref={el => {
                          if (!itemInputsRef.current[index]) itemInputsRef.current[index] = {}
                          itemInputsRef.current[index].qty = el
                        }}
                        className="form-input text-center h-9 py-1.5 text-sm font-bold"
                        type="number"
                        min="1"
                        placeholder="1"
                        value={row.quantity ?? ''}
                        onChange={e => handleQtyWeightChange(index, 'quantity', e.target.value)}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            focusItemField(index, 'rate')
                          }
                        }}
                      />
                    </td>
                    <td className="py-2 px-2.5">
                      <input
                        ref={el => {
                          if (!itemInputsRef.current[index]) itemInputsRef.current[index] = {}
                          itemInputsRef.current[index].rate = el
                        }}
                        className="form-input text-right h-9 py-1.5 text-sm font-bold text-slate-800"
                        type="number"
                        min="0"
                        placeholder="0"
                        value={row.rate ?? ''}
                        onChange={e => handleQtyWeightChange(index, 'rate', e.target.value)}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleRateEnter(index)
                          }
                        }}
                      />
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900 text-sm">
                      ₹{Number(row.totalAmount).toLocaleString('en-IN')}
                    </td>
                    <td className="py-2 px-1 text-center">
                      {itemsList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemRow(index)}
                          className="text-slate-400 hover:text-red-600 transition p-1.5 cursor-pointer rounded hover:bg-red-50"
                          title="Remove item"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 4: Charges, Payment & Live Financial Summary */}
        <div className="grid grid-cols-12 gap-3 items-stretch">
          
          {/* Left: Charges & Payment Modes (8 Cols) */}
          <div className="col-span-12 lg:col-span-8 bg-white rounded-lg border border-slate-200/80 p-3 shadow-xs space-y-3 flex flex-col justify-between">
            
            {/* 4 Extra Charges */}
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <span>Extra Charges (Added to Freight)</span>
              </div>
              <div className="grid grid-cols-4 gap-2.5">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">B. Charge (₹)</label>
                  <input
                    className="form-input text-sm py-1.5 h-8.5 font-medium"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.bCharge}
                    onChange={e => setForm(f => ({ ...f, bCharge: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Hamali (₹)</label>
                  <input
                    className="form-input text-sm py-1.5 h-8.5 font-medium"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.hamali}
                    onChange={e => setForm(f => ({ ...f, hamali: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Pick Up (₹)</label>
                  <input
                    className="form-input text-sm py-1.5 h-8.5 font-medium"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.pickup}
                    onChange={e => setForm(f => ({ ...f, pickup: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Delivery (₹)</label>
                  <input
                    className="form-input text-sm py-1.5 h-8.5 font-medium"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.delivery}
                    onChange={e => setForm(f => ({ ...f, delivery: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Payment Mode & Advance Paid */}
            <div className="pt-2.5 border-t border-slate-100 grid grid-cols-12 gap-3 items-center">
              <div className="col-span-7">
                <label className="text-xs font-bold text-slate-600 mb-1.5 block uppercase">Payment Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'ToPay', label: 'To Pay', desc: 'Destination', icon: Clock },
                    { id: 'Paid', label: 'Paid', desc: 'Prepaid', icon: CheckCircle2 },
                    { id: 'TBB', label: 'TBB', desc: 'To Be Billed', icon: FileText }
                  ].map(tab => {
                    const isSelected = form.paymentType === tab.id
                    const IconComponent = tab.icon
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, paymentType: tab.id }))}
                        className={`px-2.5 py-2 rounded-lg text-left border transition flex items-center gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/60 text-slate-600'
                        }`}>
                          <IconComponent size={13} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs leading-tight font-bold">{tab.label}</span>
                          <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                            {tab.desc}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="col-span-5">
                <label className="text-xs font-bold text-slate-600 mb-1.5 block uppercase">
                  Advance Paid (₹)
                </label>
                <input
                  ref={advanceInputRef}
                  className="form-input text-sm py-2 h-9 font-bold text-slate-900"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.advancePaid}
                  onChange={e => setForm(f => ({ ...f, advancePaid: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.target.blur()
                    }
                  }}
                />
              </div>
            </div>

          </div>

          {/* Right: Live Financial Summary & Save Actions (4 Cols) */}
          <div className="col-span-12 lg:col-span-4 bg-slate-950 text-white rounded-lg p-4 shadow-md border border-slate-800 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-800 flex items-center justify-between">
                <span>Bill Breakdown</span>
                <span className="bg-blue-600 text-white font-mono text-xs px-2.5 py-0.5 rounded font-bold uppercase tracking-wider">
                  {form.paymentType}
                </span>
              </div>

              <div className="flex justify-between text-sm text-slate-300">
                <span>Freight:</span>
                <span className="font-semibold text-white font-mono">₹{totalFreight.toLocaleString('en-IN')}</span>
              </div>

              <div className="flex justify-between text-sm text-slate-300">
                <span>Extra Charges:</span>
                <span className="font-semibold text-white font-mono">₹{extraCharges.toLocaleString('en-IN')}</span>
              </div>

              <div className="flex justify-between text-base font-bold text-white pt-2.5 border-t border-slate-800">
                <span>Grand Total:</span>
                <span className="font-mono text-lg text-white font-black">₹{grandTotal.toLocaleString('en-IN')}</span>
              </div>

              {advancePaidNum > 0 && (
                <div className="flex justify-between text-sm text-slate-300">
                  <span>Advance Paid:</span>
                  <span className="font-mono font-semibold text-slate-200">- ₹{advancePaidNum.toLocaleString('en-IN')}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-sm pt-2.5 border-t border-slate-800">
                <span className="font-semibold text-slate-300">Balance Due:</span>
                <span className="font-mono text-lg font-bold text-white">
                  ₹{balanceDue.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={saving || noBranchChosen}
                title={noBranchChosen ? 'Select a branch from the header first' : undefined}
                className="w-full py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait disabled:active:scale-100"
              >
                {noBranchChosen ? (
                  <>
                    <ShieldAlert size={16} /> Select a branch first
                  </>
                ) : saving ? (
                  <>
                    <Save size={16} className="animate-pulse" /> Saving…
                  </>
                ) : isEditing ? (
                  <>
                    <Save size={16} /> Update Bill (Ctrl+S)
                  </>
                ) : (
                  <>
                    <Printer size={16} /> Save & Print Bilty (Ctrl+S)
                  </>
                )}
              </button>
            </div>

          </div>

        </div>

      </form>

      {/* Inline Modal: Add New City */}
      {showAddCity && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                  <MapPin size={16} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Add New City / Hub</h3>
                  <p className="text-[11px] text-slate-500">Add origin or destination location</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCity(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  City Name <span className="text-red-500">*</span>
                </label>
                <input
                  className="form-input text-xs py-2.5 px-3 rounded-lg w-full font-medium"
                  type="text"
                  placeholder="e.g. Surat, Ahmedabad, Jaipur"
                  value={newCityName}
                  onChange={e => setNewCityName(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAddCity(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCity}
                disabled={savingCity}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              >
                <Plus size={14} /> {savingCity ? 'Adding…' : 'Add City'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Modal: Add New Party / Customer */}
      {showAddCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                  <User size={18} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">
                    Add New Party ({custTargetParty === 'consignor' ? 'Sender' : 'Receiver'})
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Save party master record for quick auto-suggestions in bilties.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCustomer(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreateCustomer}>
              <div className="p-6 space-y-4">
                {/* Party / Company Name */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Party / Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="form-input text-xs py-2.5 px-3 rounded-lg w-full font-medium"
                    type="text"
                    placeholder="e.g. Ambaji Steel Co. or Ramesh Kumar"
                    value={newCustForm.name}
                    onChange={e => setNewCustForm(f => ({ ...f, name: e.target.value }))}
                    required
                    autoFocus
                  />
                </div>

                {/* Mobile Number */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Mobile Number (10 Digits) <span className="text-red-500">*</span>
                  </label>
                  <PhoneInput
                    value={newCustForm.phone}
                    onChange={v => setNewCustForm(f => ({ ...f, phone: v }))}
                    inputClassName="text-xs py-2.5"
                    placeholder="10-digit mobile number"
                  />
                </div>

                {/* City & Address Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">City / Location</label>
                    <CityAutocomplete
                      value={newCustForm.city}
                      onChange={v => setNewCustForm(f => ({ ...f, city: v }))}
                      locations={locations}
                      placeholder="Type or select city..."
                      inputClassName="text-xs py-2.5 font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">Pickup / Delivery Address</label>
                    <input
                      className="form-input text-xs py-2.5 px-3 rounded-lg w-full font-medium"
                      type="text"
                      placeholder="Shop / Area / Street..."
                      value={newCustForm.address}
                      onChange={e => setNewCustForm(f => ({ ...f, address: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddCustomer(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCust}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                >
                  <Save size={14} /> {savingCust ? 'Saving…' : 'Save Party'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recent Booked LRs List (Compact High Density) */}
      <div className="bg-white rounded-lg border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-3.5 py-2 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-slate-600" />
            <span className="text-xs font-bold text-slate-900">Recent Lorry Receipts (LRs)</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="form-input pl-7 w-48 py-1 h-7 text-xs"
                placeholder="Search LR, party, city..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <span className="text-[10px] text-slate-400">
              Showing {Math.min(8, filteredEntries.length)} of {filteredEntries.length}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredEntries.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <FileText size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">No LR entries found.</p>
            </div>
          ) : (
            <table className="w-full text-[13.5px] border-collapse">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-500 font-bold">
                  <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider">#</th>
                  <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider">LR No</th>
                  <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider">Date</th>
                  <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider">Route</th>
                  <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider">Sender (Consignor)</th>
                  <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider">Receiver (Consignee)</th>
                  <th className="text-left px-3.5 py-2.5 text-[11px] uppercase tracking-wider">Mode</th>
                  <th className="text-right px-3.5 py-2.5 text-[11px] uppercase tracking-wider">Total</th>
                  <th className="text-center px-3.5 py-2.5 text-[11px] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.slice(0, 8).map((e, i) => (
                  <tr key={e.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-3.5 py-2.5 text-slate-400 font-mono text-xs">{i + 1}</td>
                    <td className="px-3.5 py-2.5 font-bold font-mono text-blue-600 whitespace-nowrap text-sm">
                      {e.lr_number}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap text-xs">
                      {fmtDate(e.date)}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-700 whitespace-nowrap font-medium text-xs">
                      {e.from_city} → {e.to_city}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-800 font-medium max-w-[150px] truncate">
                      {e.consignor}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-700 max-w-[150px] truncate">
                      {e.consignee}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        e.payment_type === 'Paid'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : e.payment_type === 'TBB'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-800 border border-slate-200'
                      }`}>
                        {e.payment_type || 'ToPay'}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-bold text-slate-900 font-mono text-sm">
                      ₹{billTotal(e).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3.5 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            const shipmentItems = await getShipmentItems(e.id)
                            setActiveBilty({
                              lrNumber: e.lr_number,
                              date: e.date,
                              fromCity: e.from_city,
                              toCity: e.to_city,
                              consignor: e.consignor,
                              consignorPhone: e.consignor_phone,
                              consignorAddress: e.consignor_address,
                              consignee: e.consignee,
                              consigneePhone: e.consignee_phone,
                              consigneeAddress: e.consignee_address,
                              items: e.items,
                              freight: e.freight,
                              bCharge: e.b_charge,
                              hamali: e.hamali,
                              pickup: e.pickup,
                              delivery: e.delivery,
                              totalAmount: e.total_amount,
                              advancePaid: e.advance_paid,
                              balanceDue: e.balance_due,
                              paymentType: e.payment_type,
                              itemsList: shipmentItems.map(it => ({
                                itemName: it.item_name,
                                quantity: it.quantity,
                                rate: it.rate,
                                totalAmount: it.total_amount,
                              })),
                            })
                          }}
                          className="p-1.5 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                          title="Print Bilty"
                        >
                          <Printer size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/lr-entry/${encodeURIComponent(e.lr_number)}`)}
                          className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                          title="Edit LR"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/bilty/${encodeURIComponent(e.lr_number)}`)}
                          className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                          title="View Bill Details"
                        >
                          <Eye size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Printable Bilty Modal */}
      {activeBilty && (
        <BiltyInvoiceModal
          lrData={activeBilty}
          onClose={() => {
            setActiveBilty(null)
            setTimeout(() => fromCityRef.current?.focus(), 150)
          }}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-5 left-5 rounded-lg text-white font-semibold shadow-xl toast-anim flex items-center z-50 ${
          toast.type === 'error'
            ? 'px-5 py-4 text-base gap-2.5 max-w-md border-2 border-red-300 ring-4 ring-red-500/30 bg-red-600'
            : 'px-3.5 py-2 text-xs gap-1.5 bg-emerald-600'
        }`}>
          {toast.type === 'error' ? <ShieldAlert size={22} className="shrink-0" /> : <CheckCircle2 size={14} />}
          <span>{toast.msg}</span>
        </div>
      )}

    </div>
  )
}
