// Generates the CHALLAN (loading sheet) as an A4-PORTRAIT PDF by rendering each
// discrete .a4-page-sheet onto its own PDF page.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import ChallanDocument from '../components/ChallanDocument'

export async function downloadChallanPdf(challan) {
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
  root.render(React.createElement(ChallanDocument, { challan, id: 'pdfChallan' }))

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

    const safeNo = String(challan?.challan_number || 'challan').replace(/[^\w\-]+/g, '-').slice(0, 40)
    pdf.save(`Challan-${safeNo}.pdf`)
  } finally {
    root.unmount()
    document.body.removeChild(host)
  }
}
