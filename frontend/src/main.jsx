import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { installErrorTracker } from './errorTracker.js'

// Global error tracker — Sentry'ga muqobil (backend /api/errors/client'ga yuboradi)
installErrorTracker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
