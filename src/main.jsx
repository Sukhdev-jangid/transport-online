import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// HashRouter (not BrowserRouter): the packaged app loads over the file://
// protocol, where BrowserRouter can't match routes (the pathname is the .html
// file path) and clicking links navigates to non-existent files. HashRouter
// uses #/route which works under file:// and on the dev server alike.
// sql.js is bundled locally (see src/db/database.js) so the app is fully offline.
ReactDOM.createRoot(document.getElementById('root')).render(
  <HashRouter>
    <App />
  </HashRouter>
)
