// Copies text to the clipboard. Works both in Electron (secure context) and as
// a fallback via a hidden textarea + execCommand for older/edge cases.
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (e) { /* fall through to legacy path */ }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.focus(); ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch (e) {
    return false
  }
}

// Builds a clean, shareable multi-line block from labelled fields.
// Skips empty values so the copied text stays tidy.
export function buildShareText(title, fields) {
  const lines = [title, '─────────────']
  fields.forEach(([label, value]) => {
    const v = (value ?? '').toString().trim()
    if (v) lines.push(`${label}: ${v}`)
  })
  return lines.join('\n')
}
