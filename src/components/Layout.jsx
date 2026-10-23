import React from 'react'
import Header from './Header'
import Sidebar from './Sidebar'

export default function Layout({ children, onLock }) {
  return (
    <div className="grid h-screen overflow-hidden" style={{ gridTemplateColumns: '240px 1fr', gridTemplateRows: '56px 1fr' }}>
      <Header onLock={onLock} />
      <Sidebar />
      <main className="overflow-y-auto bg-slate-100">
        {children}
      </main>
    </div>
  )
}
