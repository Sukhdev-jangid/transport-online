// Builds a wa.me link for a Bilty and opens it in the system default handler
// (WhatsApp Desktop app / browser under Electron; a new tab in dev). The bill
// details are pre-filled as the message; the customer still attaches any PDF.
import { COMPANY } from '../config/company'
import { billTotal } from './billing'

const digits = (v) => (v || '').replace(/\D/g, '')

export function buildBiltyWhatsAppUrl(lr) {
  const phone = digits(lr.consigneePhone) || digits(lr.consignorPhone)
  const grandTotal = billTotal(lr)
  const goods =
    (lr.itemsList && lr.itemsList.length > 0
      ? lr.itemsList.map(i => i.itemName).join(', ')
      : lr.items) || ''
  const isPaid = lr.paymentType === 'Paid'

  const lines = [
    `*${COMPANY.name}*`,
    `Lorry Receipt / Bilty`,
    ``,
    `LR No: ${lr.lrNumber}`,
    `Date: ${lr.date}`,
    `From: ${lr.fromCity || COMPANY.defaultFrom}  To: ${lr.toCity}`,
    `Consignor: ${lr.consignor}`,
    `Consignee: ${lr.consignee}`,
    goods ? `Goods: ${goods}` : null,
    `Payment: ${isPaid ? 'Paid' : 'To Pay'}`,
    `Total: ${grandTotal ? `₹${grandTotal.toLocaleString('en-IN')}` : '—'}`,
    ``,
    `Thank you for choosing ${COMPANY.short}.`,
  ].filter(Boolean)

  const text = encodeURIComponent(lines.join('\n'))
  const target = phone ? `91${phone}` : ''
  return `https://wa.me/${target}?text=${text}`
}

export function sendBiltyWhatsApp(lr) {
  const url = buildBiltyWhatsAppUrl(lr)
  if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url)
  else window.open(url, '_blank')
}
