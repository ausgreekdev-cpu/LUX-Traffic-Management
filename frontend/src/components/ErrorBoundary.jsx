import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-w-lg w-full space-y-3">
            <h2 className="text-lg font-bold text-red-500">Something went wrong</h2>
            <p className="text-sm text-gray-500">{this.state.error.message || String(this.state.error)}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
