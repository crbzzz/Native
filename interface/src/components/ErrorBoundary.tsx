import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  error?: Error;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('UI crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      const message = this.state.error?.message || String(this.state.error);
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-white text-gray-900">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <div className="text-lg font-medium">Une erreur a cassé l’interface</div>
            <div className="mt-2 text-sm text-gray-700">{message}</div>
            <div className="mt-4 text-xs text-gray-500">
              Ouvre la console (F12) pour voir la stack.
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
