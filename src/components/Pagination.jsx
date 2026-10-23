import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Select from './Select'

// Reusable table pagination footer, shared across list pages so they all look
// and behave the same. Parent owns `page` (0-based) and `rowsPerPage` state;
// this component just renders the controls and calls back on change.
export default function Pagination({
  total,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  options = [10, 20, 50, 100],
}) {
  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage))
  const start = total === 0 ? 0 : page * rowsPerPage + 1
  const end = Math.min(total, (page + 1) * rowsPerPage)

  const goPrev = () => onPageChange(Math.max(0, page - 1))
  const goNext = () => onPageChange(Math.min(totalPages - 1, page + 1))

  return (
    <div className="flex items-center justify-end gap-6 px-4 py-2.5 border-t border-slate-100 text-xs text-slate-600">
      <div className="flex items-center gap-2">
        <span>Rows per page:</span>
        <div className="w-24">
          <Select
            value={rowsPerPage}
            onChange={v => onRowsPerPageChange(Number(v))}
            options={options.map(o => ({ value: o, label: String(o) }))}
            className="py-1 text-xs font-semibold"
          />
        </div>
      </div>

      <span className="tabular-nums">{start}–{end} of {total}</span>

      <div className="flex items-center gap-1">
        <button
          onClick={goPrev}
          disabled={page <= 0}
          className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          title="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={goNext}
          disabled={page >= totalPages - 1}
          className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          title="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
