import React from 'react'
import { onlyDigits } from '../utils/validation'

// Phone field with a fixed +91 (India) prefix. Accepts digits only, max 10.
// onChange receives the cleaned digit string (not the event). The +91 is
// visual only — the stored value stays a plain 10-digit number.
export default function PhoneInput({
  value,
  onChange,
  onNext,
  inputRef,
  onKeyDown,
  placeholder = '10-digit number',
  required = false,
  className = '',
  inputClassName = '',
}) {
  const handleKeyDown = (e) => {
    if (onKeyDown) onKeyDown(e)
    if (e.key === 'Enter') {
      e.preventDefault()
      if (onNext) onNext()
    }
  }

  return (
    <div className={`flex items-stretch ${className}`}>
      <span className="inline-flex items-center px-2.5 rounded-l-md border border-r-0 border-slate-300 bg-slate-100 text-slate-500 text-xs font-semibold select-none">
        +91
      </span>
      <input
        ref={inputRef}
        className={`form-input rounded-l-none flex-1 min-w-0 ${inputClassName}`}
        type="tel"
        inputMode="numeric"
        maxLength={10}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={e => onChange(onlyDigits(e.target.value))}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}
