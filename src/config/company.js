// Central company / branding config. These are the DEFAULT values shipped with
// the app. They can be overridden at runtime from the Company Settings page,
// which persists changes to the database and applies them here via
// applyCompanySettings() so the header, dashboard and bilty receipt all update.
// App images live in src/assets/ as real files. Vite bundles them and these
// imports resolve to the final URLs. Add more images there and import the same way.
import htcAppLogo from '../assets/htc.jpeg'       // app UI logo: sidebar, login, header
import htcBillLogo from '../assets/htc_bill.png'  // logo printed on the Bilty receipt

export const COMPANY_DEFAULTS = {
  name: 'HARIOM TRANSPORT AND CARGO',
  short: 'HTC',
  shortLabel: 'Transport & Cargo',
  logoDataUrl: htcAppLogo,         // bundled app logo (sidebar/login/header); can be overridden from Company Settings
  billLogoDataUrl: htcBillLogo,    // bundled logo shown on the printed bilty
  tagline: 'डेली सर्विस :- जोधपुर से सांचोर (वाया जीवाणा,बगोड़ा,चितलवाना)',
  proprietor: 'Suresh Kallrana',
  phones: ['9928935529', '9001941822'],
  // Branch offices shown (right box of the bill header): each office name with
  // its own contact number below it.
  offices: [
    { name: 'Jodhpur Office', phone: '9928935529' },
    { name: 'Sanchore Office', phone: '9001941822' },
  ],
  address: 'Shop No. 04, Near Water Tank, Behind Police Station, MIA Basni 2nd Phase, Jodhpur',
  tptId: '08FPEPB2543R1ZJ',
  defaultFrom: 'JODHPUR',
  caution:
    "The Consignment will be detained diverted rerouted re-booked without Consignee Bank's written Permission will be delivered at the destination",
  notice:
    'The Consignment covered by this set or Special Lorry Receipt from sell the stored at the destination under the control of the transport operator & shall be delivered to the order of the consignee bank whose Name is mentioned in the Lorry Receipt. It will under no circumstances be delivered to any one without the written authority from the consignee bank or its order and closed on the consignee copy or an a separately.',
  breakageNote: 'Not Responsible for breakages, Damage, Leakage and S. Tax Problems',
}

// Live config object that the rest of the app imports. It is a mutable copy of
// the defaults; applyCompanySettings() merges saved values into it in place, so
// every module that imported COMPANY sees the update (same object reference).
export const COMPANY = { ...COMPANY_DEFAULTS }

// Merge saved settings into the live COMPANY object (in place).
export function applyCompanySettings(saved) {
  if (!saved || typeof saved !== 'object') return
  Object.assign(COMPANY, saved)
  // Only a genuinely uploaded logo (a base64 `data:` URL) is a valid saved logo.
  // A bundled-asset path (e.g. /assets/htc-<hash>.jpeg) is content-hashed by Vite
  // and changes on every rebuild, so it must never be trusted from the DB. Any
  // empty / non-data value falls back to the fresh bundled default from src/assets,
  // so the HTC image always shows unless the user uploaded a real one.
  const isUploaded = (v) => typeof v === 'string' && v.startsWith('data:')
  // App logo (sidebar/login/header): keep an uploaded one, else bundled htc.jpeg.
  if (!isUploaded(COMPANY.logoDataUrl)) COMPANY.logoDataUrl = COMPANY_DEFAULTS.logoDataUrl
  // Bill logo (printed bilty): keep an uploaded one, else bundled htc_bill.png.
  if (!isUploaded(COMPANY.billLogoDataUrl)) COMPANY.billLogoDataUrl = COMPANY_DEFAULTS.billLogoDataUrl
  // Guard: phones must always be an array of non-empty strings.
  if (!Array.isArray(COMPANY.phones)) {
    COMPANY.phones = String(COMPANY.phones || '').split(',').map(s => s.trim()).filter(Boolean)
  }
  COMPANY.phones = COMPANY.phones.filter(Boolean)
}
