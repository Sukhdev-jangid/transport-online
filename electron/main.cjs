const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

// Force the app's locale to en-GB so native date inputs render as dd/mm/yyyy
// (day-month-year) regardless of the client's Windows regional settings.
// Must be set before the app is ready.
app.commandLine.appendSwitch('lang', 'en-GB')

// Remove default Electron menu bar
Menu.setApplicationMenu(null)

// Timestamp helper used to name exported PDF files (HTC-Bilty-YYYY-MM-DD_HHMM).
const pad = (n) => String(n).padStart(2, '0')
function stamp() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
}

// App / window icon (packaged: resources/build; dev: repo build dir)
const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
  : path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    icon: iconPath,
    // Paint the window white behind the page. Without this, Windows' DWM shows a
    // BLACK frame for a moment during minimize / show transitions (e.g. when we
    // minimize on Print) — the "black flash". A set background color removes it.
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    title: 'Hariom Transport Management System',
  })

  // Dev: load Vite dev server | Prod: load built files
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  } else {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  }

  mainWindow.once('ready-to-show', () => mainWindow.show())
}

app.whenReady().then(() => {
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ── IPC: open a URL in the system default handler (WhatsApp app / browser) ──
ipcMain.handle('open-external', (_, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url)
    return true
  }
  return false
})

// ── IPC: Print the Bilty ─────────────────────────────
// Chromium's built-in print PREVIEW UI is NOT implemented in Electron, so the
// renderer's window.print() (and webContents.print() with a dialog) shows
// "This app doesn't support print preview" on Windows with a blank preview.
//
// Instead we render the current page to an A5 PDF in the main process
// (printToPDF honours the @media print CSS, so ONLY the bill is captured), write
// it to a temp file, and open it in the OS default PDF viewer. There the user
// gets a real full preview of the bill and can print it from a working dialog.
ipcMain.handle('print-bilty', async () => {
  if (!mainWindow) return { ok: false, error: 'no window' }
  try {
    const data = await mainWindow.webContents.printToPDF({
      pageSize: 'A5',                              // 148 × 210 mm
      landscape: true,                             // A5 landscape (210 × 148 mm)
      printBackground: true,                       // keep shaded header cells
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: false,
    })
    const outPath = path.join(app.getPath('temp'), `HTC-Bilty-${stamp()}.pdf`)
    fs.writeFileSync(outPath, data)
    await shell.openPath(outPath)                  // opens in default PDF viewer
    return { ok: true, path: outPath }
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) }
  }
})

// ── IPC: Get available printers ───────────────────────
ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return []
  try {
    const list = await mainWindow.webContents.getPrintersAsync()
    return (list || [])
      .filter(p => !/onenote|fax|xps/i.test(p.name))
      .map(p => ({
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: Boolean(p.isDefault),
        status: p.status,
      }))
  } catch (err) {
    return []
  }
})

// ── IPC: Direct / Silent Print Bilty ───────────────────
// Sends print command directly to the Windows printer spooler without opening
// the PDF preview or print dialog.
// Protections:
//   • Strictly blocks OneNote, Fax, XPS virtual printers
//   • pageRanges: [{ from: 0, to: 0 }] strictly forces single-page output (Page 1 only)
//   • copies clamped to safe range (1..5)
//   • deviceName fallback to physical default printer if not specified
ipcMain.handle('direct-print-bilty', async (_, opts = {}) => {
  if (!mainWindow) return { ok: false, error: 'No active window' }
  const copies = Math.max(1, Math.min(Number(opts.copies) || 1, 5))
  const requestedPrinter = typeof opts.deviceName === 'string' ? opts.deviceName.trim() : ''

  try {
    const allPrinters = await mainWindow.webContents.getPrintersAsync()
    // STRICTLY filter out virtual software printers (OneNote, Fax, XPS)
    const physicalPrinters = (allPrinters || []).filter(p => !/onenote|fax|xps/i.test(p.name))

    if (physicalPrinters.length === 0) {
      return {
        ok: false,
        error: 'No physical printer connected. Please connect a USB printer.'
      }
    }

    let targetPrinter = null
    if (requestedPrinter && !/onenote|fax|xps/i.test(requestedPrinter)) {
      targetPrinter = physicalPrinters.find(p => p.name.toLowerCase() === requestedPrinter.toLowerCase())
    }

    if (!targetPrinter) {
      targetPrinter = physicalPrinters.find(p => p.isDefault) || physicalPrinters[0]
    }

    if (!targetPrinter) {
      return {
        ok: false,
        error: 'No physical printer connected. Please connect a USB printer.'
      }
    }

    return new Promise((resolve) => {
      mainWindow.webContents.print({
        silent: true,
        printBackground: true,
        deviceName: targetPrinter.name,
        copies: copies,
        pageSize: 'A5',
        landscape: true,
        margins: { marginType: 'none' },
        pageRanges: [{ from: 0, to: 0 }],
      }, (success, failureReason) => {
        if (!success) {
          resolve({ ok: false, error: failureReason || 'Print spooler error' })
        } else {
          resolve({ ok: true, printer: targetPrinter.name, copies })
        }
      })
    })
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) }
  }
})

// Download the Bilty as a PDF using the SAME rendering as print (printToPDF on
// the live page with print CSS), so the downloaded file is byte-for-byte the
// same layout as the printed one — not a separate html2canvas image. The only
// difference from print-bilty is we let the user choose where to save it.
ipcMain.handle('save-bilty-pdf', async (_, suggestedName) => {
  if (!mainWindow) return { ok: false, error: 'no window' }
  try {
    const data = await mainWindow.webContents.printToPDF({
      pageSize: 'A5',                              // 148 × 210 mm — same as print
      landscape: true,                             // A5 landscape (210 × 148 mm)
      printBackground: true,                       // keep shaded header cells
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: false,
    })
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Bilty PDF',
      defaultPath: path.join(app.getPath('downloads'), suggestedName || 'Bilty.pdf'),
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    fs.writeFileSync(res.filePath, data)
    return { ok: true, path: res.filePath }
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) }
  }
})

// Print the STATEMENT: render the live page to an A4-portrait PDF and open it in
// the OS default PDF viewer.
ipcMain.handle('print-statement', async () => {
  if (!mainWindow) return { ok: false, error: 'no window' }
  try {
    const data = await mainWindow.webContents.printToPDF({
      pageSize: 'A4',                              // 210 × 297 mm (A4 Portrait)
      landscape: false,                            // portrait
      printBackground: true,                       // keep shaded header/total cells
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: false,
    })
    const outPath = path.join(app.getPath('temp'), `HTC-Statement-${stamp()}.pdf`)
    fs.writeFileSync(outPath, data)
    await shell.openPath(outPath)
    return { ok: true, path: outPath }
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) }
  }
})

// Save the monthly party STATEMENT as an A4-portrait PDF. Same live-page
// printToPDF mechanism as the bilty, but A4 portrait (the statement's own
// `@page statement` CSS matches this) so a long list of bills paginates across
// pages. Kept separate from save-bilty-pdf so the A5 bilty path is untouched.
ipcMain.handle('save-statement-pdf', async (_, suggestedName) => {
  if (!mainWindow) return { ok: false, error: 'no window' }
  try {
    const data = await mainWindow.webContents.printToPDF({
      pageSize: 'A4',                              // 210 × 297 mm (A4 Portrait)
      landscape: false,                            // portrait
      printBackground: true,                       // keep shaded header/total cells
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: false,
    })
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Statement PDF',
      defaultPath: path.join(app.getPath('downloads'), suggestedName || 'Statement.pdf'),
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    fs.writeFileSync(res.filePath, data)
    return { ok: true, path: res.filePath }
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) }
  }
})

// Print the CHALLAN: render the live page to an A4-portrait PDF and open it in
// the OS default PDF viewer.
ipcMain.handle('print-challan', async () => {
  if (!mainWindow) return { ok: false, error: 'no window' }
  try {
    const data = await mainWindow.webContents.printToPDF({
      pageSize: 'A4',                              // 210 × 297 mm (A4 Portrait)
      landscape: false,                            // portrait
      printBackground: true,                       // keep shaded header/total cells
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: false,
    })
    const outPath = path.join(app.getPath('temp'), `HTC-Challan-${stamp()}.pdf`)
    fs.writeFileSync(outPath, data)
    await shell.openPath(outPath)                  // opens in default PDF viewer
    return { ok: true, path: outPath }
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) }
  }
})

// Save the CHALLAN (loading sheet) as an A4-PORTRAIT PDF. Multi-page support
// for long bill lists.
ipcMain.handle('save-challan-pdf', async (_, suggestedName) => {
  if (!mainWindow) return { ok: false, error: 'no window' }
  try {
    const data = await mainWindow.webContents.printToPDF({
      pageSize: 'A4',                              // 210 × 297 mm (A4 Portrait)
      landscape: false,                            // portrait
      printBackground: true,                       // keep shaded header/total cells
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: false,
    })
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Challan PDF',
      defaultPath: path.join(app.getPath('downloads'), suggestedName || 'Challan.pdf'),
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    fs.writeFileSync(res.filePath, data)
    return { ok: true, path: res.filePath }
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) }
  }
})

