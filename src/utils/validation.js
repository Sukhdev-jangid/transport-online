// Input helpers shared across forms.

// Strips everything except digits and caps length (default 10 for phone numbers).
// Used in onChange so the field can never hold letters, spaces, +, or more than
// `max` digits — regardless of paste or keyboard.
export function onlyDigits(value, max = 10) {
  return String(value ?? '').replace(/\D/g, '').slice(0, max)
}

// A phone is valid when empty (optional field) or exactly 10 digits.
export function isValidPhone(value) {
  const v = onlyDigits(value)
  return v === '' || v.length === 10
}
