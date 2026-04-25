import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="sf-callout-danger p-4 m-4 rounded-lg">
          <h3 className="sf-status-text-danger font-semibold text-sm mb-1">Something went wrong</h3>
          <p className="sf-status-text-danger text-xs font-mono">
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="sf-danger-button-solid mt-2 px-3 py-1 text-xs rounded"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
