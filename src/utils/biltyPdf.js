// Generates a Bilty PDF that is identical to the printed/preview layout by
// rendering the SAME <BiltyDocument> off-screen, capturing it with html2canvas,
// and placing that image into an A4 jsPDF. Fully offline (both libs bundled).
import React from 'react'
import { createRoot } from 'react-dom/client'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import BiltyDocument from '../components/BiltyDocument'

export async function downloadBiltyPdf(lr) {
  // Host element: rendered at top-left inside viewport behind everything (z-index -9999)
  // so Chromium keeps full DirectWrite subpixel hardware font rendering active.
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '0'
  host.style.top = '0'
  host.style.width = '1000px'
  host.style.background = '#ffffff'
  host.style.zIndex = '-9999'
  host.style.opacity = '0.01'
  host.style.pointerEvents = 'none'
  document.body.appendChild(host)

  const root = createRoot(host)
  root.render(React.createElement(BiltyDocument, { lrData: lr, id: 'pdfBilty' }))

  try {
    // Let React paint and fonts finish loading.
    if (document.fonts?.ready) await document.fonts.ready
    await new Promise(r => setTimeout(r, 60))
    const target = host.querySelector('#pdfBilty') || host

    // Wait for every image (the logo especially) to FULLY load before capturing.
    // html2canvas snapshots synchronously, so a not-yet-decoded logo would be
    // captured blank / stale — the cause of the wrong logo in the downloaded PDF.
    await Promise.all(
      Array.from(host.querySelectorAll('img')).map(img => {
        if (img.complete && img.naturalWidth > 0) return img.decode?.().catch(() => {})
        return new Promise(res => {
          img.onload = res
          img.onerror = res
        })
      })
    )

    const canvas = await html2canvas(target, {
      scale: 2,             // crisp text
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    })

    const pdf = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 8
    const imgW = pageW - margin * 2
    const imgH = (canvas.height * imgW) / canvas.width
    const img = canvas.toDataURL('image/png')

    if (imgH <= pageH - margin * 2) {
      pdf.addImage(img, 'PNG', margin, margin, imgW, imgH)
    } else {
      // Taller than one page: slice across pages.
      let remaining = imgH
      let position = margin
      while (remaining > 0) {
        pdf.addImage(img, 'PNG', margin, position, imgW, imgH)
        remaining -= (pageH - margin * 2)
        if (remaining > 0) { pdf.addPage(); position = margin - (imgH - remaining) }
      }
    }

    pdf.save(`Bilty-${lr.lrNumber || 'receipt'}.pdf`)
  } finally {
    root.unmount()
    document.body.removeChild(host)
  }
}
