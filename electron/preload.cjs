const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  printBilty: () => ipcRenderer.invoke('print-bilty'),
  saveBiltyPdf: (suggestedName) => ipcRenderer.invoke('save-bilty-pdf', suggestedName),
  printStatement: () => ipcRenderer.invoke('print-statement'),
  saveStatementPdf: (suggestedName) => ipcRenderer.invoke('save-statement-pdf', suggestedName),
  printChallan: () => ipcRenderer.invoke('print-challan'),
  saveChallanPdf: (suggestedName) => ipcRenderer.invoke('save-challan-pdf', suggestedName),
  // Direct printing & printer management
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  directPrintBilty: (opts) => ipcRenderer.invoke('direct-print-bilty', opts),
})
