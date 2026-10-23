// Shared date formatting so every screen shows dates the same way: dd-mm-yyyy.
//
// Two kinds of values flow through the app:
//   1. Plain form dates like "2026-07-30" (no time, no timezone) — from date
//      inputs (LR date, assigned_date, service_date). These must NOT be shifted
//      by timezone, so we reformat the parts directly.
//   2. SQLite timestamps like "2026-07-30 10:15:00" (stored in UTC) — the
//      created_at columns. For these we parse as UTC and render in local time.

const pad = (n) => String(n).padStart(2, '0')

// Format any date-ish value as dd-mm-yyyy. Returns '—' for empty values.
export function fmtDate(value) {
  if (!value) return '—'
  const str = String(value).trim()

  // Plain "YYYY-MM-DD" (optionally with a time part we ignore): reformat parts
  // directly to avoid any timezone shifting.
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`

  // Fallback: let Date parse it, then format locally.
  const d = new Date(str)
  if (isNaN(d)) return str
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
}

// Parse a SQLite UTC timestamp ("YYYY-MM-DD HH:MM:SS") into a Date in local time.
function parseSqlUtc(value) {
  const str = String(value).trim()
  // Normalise "YYYY-MM-DD HH:MM:SS" → ISO UTC so it's treated as UTC, not local.
  const iso = str.includes('T') ? str : str.replace(' ', 'T')
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z'
  const d = new Date(withZone)
  return isNaN(d) ? null : d
}

// Format a timestamp as dd-mm-yyyy hh:mm AM/PM (local time). Used where the time
// of day matters (e.g. Bilty records).
export function fmtDateTime(value) {
  if (!value) return '—'
  const d = parseSqlUtc(value)
  if (!d) return fmtDate(value)
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${fmtTime(value)}`
}

// Return a YYYY-MM-DD key in LOCAL time, for comparing against date-input
// bounds (which are local). Plain "YYYY-MM-DD" values are returned as-is; SQLite
// UTC timestamps ("YYYY-MM-DD HH:MM:SS") are converted to the local calendar day
// so a late-evening UTC row isn't filtered/labelled a day early in IST.
export function ymdKey(value) {
  if (!value) return ''
  const str = String(value).trim()
  // A bare date with no time part is already a local calendar day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  const d = parseSqlUtc(value)
  if (!d) return str.slice(0, 10)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Format just the time part of a timestamp as hh:mm AM/PM (local time).
export function fmtTime(value) {
  if (!value) return ''
  const d = parseSqlUtc(value)
  if (!d) return ''
  let h = d.getHours()
  const min = pad(d.getMinutes())
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${pad(h)}:${min} ${ampm}`
}
