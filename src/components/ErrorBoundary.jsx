import React from 'react'
import { AlertTriangle } from 'lucide-react'

// Catches any render/runtime error thrown by a child screen so ONE broken page
// never white-screens the whole app. The user's data is already safe on disk
// (every change is saved immediately); this just keeps the app usable — they can
// go back to the dashboard or reload instead of staring at a blank window.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Keep a record in the devtools console for diagnosis during support calls.
    console.error('Screen crashed:', error, info)
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 p-8 text-center">
          <AlertTriangle size={40} className="text-amber-500" />
          <div className="text-lg font-bold text-slate-800">Something went wrong on this screen</div>
          <p className="text-sm text-slate-500 max-w-md">
            Your saved data is safe. You can go back to the dashboard, or reload the app.
            If this keeps happening, restore from a backup in Settings.
          </p>
          <div className="text-[11px] text-slate-400 font-mono max-w-lg break-words">
            {String(this.state.error?.message || this.state.error)}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => { this.handleReset(); window.location.hash = '#/dashboard' }}
              className="btn btn-outline">
              Go to Dashboard
            </button>
            <button onClick={() => window.location.reload()} className="btn btn-primary">
              Reload App
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
