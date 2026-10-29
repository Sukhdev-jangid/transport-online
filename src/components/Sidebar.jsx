import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Users, Truck,
  Map, Wrench, Warehouse,
  BookUser, Tag, Settings, ClipboardList, FileSpreadsheet,
  UserCog, Building2, UserCircle, BarChart3, ArrowLeftRight, Wallet
} from 'lucide-react'
import { useRole } from '../context/RoleContext'

// Each item may carry a `roles` list. If present, the item only shows for those
// roles; if absent, it shows for everyone. Staff are booking-only.
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
      { to: '/item-rates', icon: Tag, label: 'Item Rates Master', roles: ['admin', 'sub_admin'] },
      { to: '/locations', icon: Warehouse, label: 'Locations', roles: ['admin', 'sub_admin'] },
    ],
  },
  {
    label: 'Crossing',
    items: [
      { to: '/crossings', icon: ArrowLeftRight, label: 'Crossing Entry' },
      { to: '/transporters', icon: Truck, label: 'Transporters' },
      { to: '/transporter-accounts', icon: Wallet, label: 'Transporter Accounts' },
    ],
  },
  {
    label: 'Clients & Vendors',
    items: [
      { to: '/customers', icon: Users, label: 'Customer List' },
      { to: '/vendors', icon: BookUser, label: 'Vendor Directory', roles: ['admin', 'sub_admin'] },
    ],
  },
  {
    label: 'Fleet Management',
    roles: ['admin', 'sub_admin'],
    items: [
      { to: '/vehicles', icon: Truck, label: 'All Vehicle List', roles: ['admin', 'sub_admin'] },
      { to: '/all-drivers', icon: Users, label: 'All Drivers', roles: ['admin', 'sub_admin'] },
      { to: '/maintenance', icon: Wrench, label: 'Maintenance Logs', roles: ['admin', 'sub_admin'] },
    ],
  },
  {
    // Admin manages branches/users/reports from the full-screen Admin Home, so
    // this section is hidden for admin inside a branch — only sub_admin sees it
    // (and only their one allowed item, User Management).
    label: 'Administration',
    roles: ['sub_admin'],
    items: [
      { to: '/all-branches', icon: BarChart3, label: 'All Branches Report', roles: ['admin'] },
      { to: '/users', icon: UserCog, label: 'User Management', roles: ['admin', 'sub_admin'] },
      { to: '/branches', icon: Building2, label: 'Branches', roles: ['admin'] },
    ],
  },
  {
    label: 'Settings',
    roles: ['admin', 'sub_admin'],
    items: [
      { to: '/settings', icon: Settings, label: 'Company Settings', roles: ['admin', 'sub_admin'] },
    ],
  },
  {
    label: 'My Account',
    items: [
      { to: '/profile', icon: UserCircle, label: 'My Profile' },
    ],
  },
]

// Injected by Vite from package.json at build time (see vite.config.js).
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'

export default function Sidebar() {
  const { role } = useRole()
  const allowed = (item) => !item.roles || item.roles.includes(role)

  // Filter sections + their items by role; drop any section left empty.
  const visibleSections = sections
    .filter(allowed)
    .map(s => ({ ...s, items: s.items.filter(allowed) }))
    .filter(s => s.items.length > 0)

  return (
    <aside className="bg-white border-r border-slate-200 flex flex-col overflow-x-hidden">
      <div className="flex-1 overflow-y-auto no-scrollbar pb-2">
        {visibleSections.map((section, idx) => (
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
