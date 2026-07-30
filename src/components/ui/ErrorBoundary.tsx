import React from 'react'

import { AlertTriangle } from 'lucide-react'

interface Props {
  
  boundaryKey?: string;children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Deal Blast Pro ErrorBoundary caught:', error, errorInfo)
  }

  componentDidUpdate(prevProps: any) {
    if (this.props.boundaryKey && prevProps.boundaryKey !== this.props.boundaryKey && this.state.hasError) {
      this.setState({ hasError: false, error: undefined });
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="card p-8 m-6 text-center">
          <AlertTriangle size={40} className="mx-auto mb-4 text-amber-400" aria-hidden="true" />
          <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-[#8B92A3] mb-4">A component failed to render. Copy the error below so we can patch the exact file.</p>
          {this.state.error && (
            <div className="text-left text-xs font-mono bg-black/50 border border-red-500/40 p-3 rounded text-red-300 overflow-auto max-h-48 mb-4">
              <div className="font-bold mb-1">ERROR DETAILS</div>
              <div>{String(this.state.error?.message || this.state.error)}</div>
              <div className="mt-2 text-[#8B92A3]">{String(this.state.error?.stack || '').slice(0, 1200)}</div>
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <button onClick={this.reset} className="btn btn-ghost">Try Again</button>
            <button 
              onClick={() => window.location.reload()} 
              className="btn btn-primary"
            >
              Reload App
            </button>
          </div>
          {this.state.error && (
            <div className="mt-4 text-left text-xs font-mono bg-black/40 p-3 rounded text-red-400 overflow-auto max-h-32">
              {this.state.error.message}
            </div>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

export function SectionErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary boundaryKey={location.pathname + location.search} fallback={undefined}>
      {children}
    </ErrorBoundary>
  )
}


