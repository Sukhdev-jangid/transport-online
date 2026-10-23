import React, { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

// A themed confirmation dialog that replaces the browser's native window.confirm
// (which ignores the app's styling). Matches the look of the other inline modals
// (Add City / Add Customer): dark overlay, white rounded card, outline + primary
// buttons.
//
// Props:
//   open        whether the dialog is shown
//   title       bold heading
//   message     body text
//   confirmText label for the confirm button (default "Confirm")
//   cancelText  label for the cancel button (default "Cancel")
//   tone        "primary" (default) | "danger" — colours the confirm button
//   onConfirm   () => void — user confirmed
//   onCancel    () => void — user dismissed
export default function ConfirmModal({
  open,
  title = 'Are you sure?',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  tone = 'primary',
  onConfirm,
  onCancel,
}) {
  // Allow Esc to cancel and Enter to confirm while the dialog is open.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.()
      if (e.key === 'Enter') onConfirm?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onConfirm, onCancel])

  if (!open) return null

  const confirmClass =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'btn-primary'

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-[10000]"
         onMouseDown={onCancel}>
      <div className="bg-white rounded-lg p-5 max-w-sm w-full space-y-4 shadow-xl"
           onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center
            ${tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
            <AlertTriangle size={18} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            {message && <p className="text-xs text-slate-500 leading-relaxed">{message}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn btn-outline py-1.5 px-4">{cancelText}</button>
          <button onClick={onConfirm} className={`btn py-1.5 px-4 ${confirmClass}`} autoFocus>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
