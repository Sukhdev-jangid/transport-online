import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Users, Truck,
  Map, Wrench, Warehouse,
  BookUser, Tag, Settings, ClipboardList, FileSpreadsheet
} from 'lucide-react'

const sections = [
  {
    label: 'Dashboard',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/lr-entry', icon: Map, label: 'New LR Booking' },
    ],
  },
  {
    label: 'Shipments',
    items: [
      { to: '/bilty', icon: FileText, label: 'Bilty Records' },
      { to: '/challans', icon: ClipboardList, label: 'Challans' },
      { to: '/statements', icon: FileSpreadsheet, label: 'Statements' },
      { to: '/item-rates', icon: Tag, label: 'Item Rates Master' },
      { to: '/locations', icon: Warehouse, label: 'Locations' },
    ],
  },
  {
    label: 'Clients & Vendors',
    items: [
      { to: '/customers', icon: Users, label: 'Customer List' },
      { to: '/vendors', icon: BookUser, label: 'Vendor Directory' },
    ],
  },
  {
    label: 'Fleet Management',
    items: [
      { to: '/vehicles', icon: Truck, label: 'All Vehicle List' },
      { to: '/all-drivers', icon: Users, label: 'All Drivers' },
      { to: '/maintenance', icon: Wrench, label: 'Maintenance Logs' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/settings', icon: Settings, label: 'Company Settings' },
    ],
  },
]

// Injected by Vite from package.json at build time (see vite.config.js).
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'

export default function Sidebar() {
  return (
    <aside className="bg-white border-r border-slate-200 flex flex-col overflow-x-hidden">
      <div className="flex-1 overflow-y-auto pb-2">
        {sections.map((section, idx) => (
          <div key={section.label} className={`px-2.5 ${idx === 0 ? 'pt-2.5' : 'pt-2'} pb-0.5`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2.5 mb-1">
              {section.label}
            </p>
            {section.items.map(item => (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium
                   no-underline transition-all duration-150 mb-0.5 whitespace-nowrap
                   ${isActive
                    ? 'bg-primary-50 text-primary-600 font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <item.icon size={15} className="shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      {/* Footer: app version */}
      <div className="shrink-0 border-t border-slate-100 px-3 py-1.5 text-center">
        <div className="text-[11px] font-semibold text-slate-400">Version {APP_VERSION}</div>
      </div>
    </aside>
  )
}
