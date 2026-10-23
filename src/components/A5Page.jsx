import { useState, useRef, useEffect } from 'react'

// A white "page" shaped exactly like A5 paper (148 × 210 mm) for the on-screen
// bill preview, so what the operator sees matches what prints on their A5 sheet.
//
// The Bilty document is authored at 1000px wide; on screen we scale it down to
// fit the A5 printable width dynamically so it NEVER cuts off on any laptop or small screen.
// On PRINT this on-screen scaling is switched off
// (see the `@media print` block in index.css: `.a5-page` / `.a5-page-inner`)
// so the real printing is handled by the @page A5 rule instead — no double scale.
export default function A5Page({ children }) {
  const containerRef = useRef(null)
  const [containerW, setContainerW] = useState(720)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const updateWidth = () => {
      const w = el.clientWidth
      if (w > 0) setContainerW(Math.min(740, Math.floor(w - 4)))
    }
    updateWidth()

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          const w = entry.contentRect.width
          if (w > 0) setContainerW(Math.min(740, Math.floor(w - 4)))
        }
      })
      ro.observe(el)
      return () => ro.disconnect()
    } else {
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }
  }, [])

  const PAGE_W = Math.max(300, containerW)
  const PAGE_H = Math.round(PAGE_W * 148 / 210)      // true A5-landscape ratio → ~507px at 720
  const MARGIN = Math.max(6, Math.round(PAGE_W * 6 / 210))  // 6mm margin, scaled → ~21px at 720
  const innerW = PAGE_W - MARGIN * 2
  const scale = innerW / 1000                        // fit the 1000px landscape bill in the page

  return (
    <div ref={containerRef} className="w-full flex justify-center overflow-x-hidden">
      <div
        className="a5-page bg-white shadow mx-auto overflow-hidden print:shadow-none"
        style={{ width: PAGE_W, height: PAGE_H, padding: MARGIN, maxWidth: '100%' }}
      >
        <div
          className="a5-page-inner"
          style={{ width: 1000, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
