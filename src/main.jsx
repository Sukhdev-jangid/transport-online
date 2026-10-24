import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// HashRouter (not BrowserRouter): the packaged app loads over the file://
// protocol, where BrowserRouter can't match routes (the pathname is the .html
// file path) and clicking links navigates to non-existent files. HashRouter
// uses #/route which works under file:// and on the dev server alike.
// All data lives in Supabase (see src/db/database.js) — the app needs a network
// connection to read and write.
ReactDOM.createRoot(document.getElementById('root')).render(
  <HashRouter>
    <App />
  </HashRouter>
)
