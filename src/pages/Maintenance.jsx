import React, { useState, useEffect } from 'react'
import { Plus, Wrench, Search, RefreshCw } from 'lucide-react'
import { getMaintenanceLogs, addMaintenanceLog, getVehicles } from '../db/database'
import Pagination from '../components/Pagination'
import Select from '../components/Select'
import VehicleAutocomplete from '../components/VehicleAutocomplete'
import { fmtDate } from '../utils/date'

const today = new Date().toISOString().split('T')[0]
const SERVICE_TYPES = ['General Service', 'Oil Change', 'Tyre Replacement', 'Engine Repair', 'Brake Work']

export default function Maintenance() {
  const [logs, setLogs] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [toast, setToast] = useState(null)
  // When true, the service type is a custom value typed by the user ("Other").
  const [typeIsOther, setTypeIsOther] = useState(false)
  const [form, setForm] = useState({
    vehicleNumber: '', serviceType: 'General Service', serviceDate: today,
    cost: '', odometer: '', nextServiceDate: '', notes: '',
  })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [saving, setSaving] = useState(false)     // blocks double-submit while a save is in flight

  const loadLogs = async () => setLogs(await getMaintenanceLogs())
  useEffect(() => {
    loadLogs()
    getVehicles().then(v => {
      setVehicles(v)
      setForm(f => ({ ...f, vehicleNumber: v[0]?.vehicle_number || '' }))
    })
  }, [])

  const filtered = logs.filter(l =>
    [l.vehicle_number, l.service_type, l.service_date, l.notes]
      .some(x => x?.toLowerCase().includes(search.toLowerCase()))
  )
  useEffect(() => { setPage(0) }, [search, rowsPerPage])
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return                       // ignore repeat clicks while saving
    if (!form.vehicleNumber) { showToast('Select a vehicle first!', 'error'); return }
    if (!form.serviceType.trim()) { showToast('Please type the service type!', 'error'); return }
    setSaving(true)
    try {
      setLogs(await addMaintenanceLog(form))
      showToast('✓ Maintenance log saved!')
      setTypeIsOther(false)
      setForm(f => ({ ...f, serviceType: 'General Service', cost: '', odometer: '', nextServiceDate: '', notes: '' }))
    } catch (err) { showToast('Error: ' + err.message, 'error') } finally { setSaving(false) }
  }

  const totalCost = logs.reduce((s, l) => s + (Number(l.cost) || 0), 0)

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Maintenance Logs</h1>
        <p className="text-xs text-slate-500 mt-0.5">Track servicing, repairs, and running costs per vehicle.</p>
      </div>

      <div className="card mb-4">
        <div className="card-header"><span className="card-title"><Plus size={15} /> Log Maintenance</span></div>
        <form onSubmit={handleSubmit} className="p-5">
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <label className="form-label">Vehicle *</label>
              <VehicleAutocomplete
                value={form.vehicleNumber}
                onChange={v => setForm(f => ({ ...f, vehicleNumber: v }))}
                options={vehicles.map(v => ({ value: v.vehicle_number, label: v.vehicle_number }))}
                placeholder={vehicles.length === 0 ? 'No vehicles' : 'Type or select vehicle'}
              />
            </div>
            <div>
              <label className="form-label">Service Type</label>
              <Select
                value={typeIsOther ? '__other__' : form.serviceType}
                onChange={v => {
                  if (v === '__other__') {
                    setTypeIsOther(true)
                    setForm(f => ({ ...f, serviceType: '' }))
                  } else {
                    setTypeIsOther(false)
                    setForm(f => ({ ...f, serviceType: v }))
                  }
                }}
                options={[
                  ...SERVICE_TYPES.map(t => ({ value: t, label: t })),
                  { value: '__other__', label: 'Other (type your own)' },
                ]}
              />
              {typeIsOther && (
                <input className="form-input mt-2" type="text" placeholder="Type custom service type" autoFocus
                  value={form.serviceType} onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))} />
              )}
            </div>
            <div>
              <label className="form-label">Service Date</label>
              <input className="form-input" type="date" value={form.serviceDate}
                onChange={e => setForm(f => ({ ...f, serviceDate: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Cost (₹)</label>
              <input className="form-input" type="number" min="0" placeholder="e.g. 3500"
                value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Odometer (km)</label>
              <input className="form-input" type="number" min="0" placeholder="e.g. 84000"
                value={form.odometer} onChange={e => setForm(f => ({ ...f, odometer: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Next Service Date</label>
              <input className="form-input" type="date" value={form.nextServiceDate}
                onChange={e => setForm(f => ({ ...f, nextServiceDate: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="form-label">Notes</label>
              <input className="form-input" type="text" placeholder="Optional notes"
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary disabled:opacity-60 disabled:cursor-wait" disabled={saving}>
            {saving ? 'Saving…' : 'Save Log'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title"><Wrench size={15} /> Service History</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Total spend: ₹{totalCost.toLocaleString('en-IN')}</span>
            <button onClick={loadLogs} title="Refresh"
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Toolbar: search */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="form-input pl-8 w-60 py-2" placeholder="Search vehicle, service, notes..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Wrench size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No maintenance logged yet.</p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['#','Vehicle','Service','Date','Cost','Odometer','Next Service','Notes'].map(h => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((l, i) => (
                  <tr key={l.id} className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3.5 py-2.5 text-slate-400">{page * rowsPerPage + i + 1}</td>
                    <td className="px-3.5 py-2.5 font-semibold text-blue-600">{l.vehicle_number}</td>
                    <td className="px-3.5 py-2.5"><span className="badge badge-gray">{l.service_type}</span></td>
                    <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(l.service_date)}</td>
                    <td className="px-3.5 py-2.5 font-semibold text-slate-800">₹{Number(l.cost).toLocaleString('en-IN')}</td>
                    <td className="px-3.5 py-2.5 text-slate-600">{l.odometer ? l.odometer + ' km' : '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-600 whitespace-nowrap">{l.next_service_date ? fmtDate(l.next_service_date) : '—'}</td>
                    <td className="px-3.5 py-2.5 text-slate-500 max-w-xs truncate">{l.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {filtered.length > 0 && (
          <Pagination
            total={filtered.length}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={setPage}
            onRowsPerPageChange={setRowsPerPage}
          />
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-5 left-5 px-4 py-2.5 rounded-lg text-white text-xs font-semibold shadow-lg toast-anim
          ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{toast.msg}</div>
      )}
    </div>
  )
}
