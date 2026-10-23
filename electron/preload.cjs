const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  saveDb: (buffer) => ipcRenderer.invoke('save-db', buffer),
  loadDb: () => ipcRenderer.invoke('load-db'),
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
  // Backup & restore
  backupNow: () => ipcRenderer.invoke('backup-now'),
  openBackupFolder: () => ipcRenderer.invoke('open-backup-folder'),
  listBackups: () => ipcRenderer.invoke('list-backups'),
  restoreBackup: () => ipcRenderer.invoke('restore-backup'),
  // Login / password hashing (done in main process with Node crypto)
  hashPassword: (password) => ipcRenderer.invoke('hash-password', password),
  verifyPassword: (password, stored) => ipcRenderer.invoke('verify-password', password, stored),
})
