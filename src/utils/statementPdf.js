// Generates the monthly party STATEMENT as an A4-portrait PDF by rendering each
// discrete .a4-page-sheet onto its own PDF page.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import StatementDocument from '../components/StatementDocument'

export async function downloadStatementPdf({ bills, partyName, partyRole, periodLabel }) {
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '0'
  host.style.top = '0'
  host.style.width = '794px'
  host.style.background = '#ffffff'
  host.style.zIndex = '-9999'
  host.style.opacity = '0.01'
  host.style.pointerEvents = 'none'
  document.body.appendChild(host)

  const root = createRoot(host)
  root.render(React.createElement(StatementDocument, {
    bills, partyName, partyRole, periodLabel, id: 'pdfStatement',
  }))

  try {
    if (document.fonts?.ready) await document.fonts.ready
    await new Promise(r => setTimeout(r, 60))

    await Promise.all(
      Array.from(host.querySelectorAll('img')).map(img => {
        if (img.complete && img.naturalWidth > 0) return img.decode?.().catch(() => {})
        return new Promise(res => { img.onload = res; img.onerror = res })
      })
    )

    const sheets = Array.from(host.querySelectorAll('.a4-page-sheet'))
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()

    for (let i = 0; i < sheets.length; i++) {
      if (i > 0) pdf.addPage()
      const sheet = sheets[i]
      const canvas = await html2canvas(sheet, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      })
      const imgData = canvas.toDataURL('image/png')
      pdf.addImage(imgData, 'PNG', 0, 0, pageW, pageH)
    }

    const safeParty = (partyName || 'party').replace(/[^\w\-]+/g, '-').slice(0, 40)
    pdf.save(`Statement-${safeParty}.pdf`)
  } finally {
    root.unmount()
    document.body.removeChild(host)
  }
}
