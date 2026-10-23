// Waits for the Vite dev server to be listening, then launches Electron.
//
// Used by `npm start`. Instead of a fixed `sleep`, this polls the dev server
// port so Electron opens exactly when the page is ready (never a blank window
// from launching too early). It also strips ELECTRON_RUN_AS_NODE, which some
// terminals (e.g. VSCode) set and which otherwise makes Electron run as plain
// Node and never open a window.
const { spawn } = require('child_process')
const net = require('net')

const PORT = 5173
const HOST = 'localhost'
const TIMEOUT_MS = 30000

function checkPort() {
  return new Promise((resolve) => {
    const socket = net.connect(PORT, HOST)
    socket.on('connect', () => { socket.destroy(); resolve(true) })
    socket.on('error', () => { socket.destroy(); resolve(false) })
  })
}

async function waitForServer() {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await checkPort()) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

;(async () => {
  const ready = await waitForServer()
  if (!ready) {
    console.error(`Dev server did not start on ${HOST}:${PORT} within ${TIMEOUT_MS / 1000}s`)
    process.exit(1)
  }

  const electronPath = require('electron')   // path to the Electron binary
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  // Linux (Ubuntu) commonly needs these to open a window: --no-sandbox avoids
  // sandbox permission errors, --ozone-platform=x11 forces the X11 backend on
  // Wayland, --disable-gpu avoids GPU-driver crashes. Windows needs none, so
  // add them only on Linux — one codebase runs on both.
  const args = ['.']
  if (process.platform === 'linux') {
    args.push('--no-sandbox', '--ozone-platform=x11', '--disable-gpu')
  }

  const child = spawn(electronPath, args, { stdio: 'inherit', env })
  child.on('close', (code) => process.exit(code ?? 0))
})()
