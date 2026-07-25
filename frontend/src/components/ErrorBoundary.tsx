import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Custom fallback UI; when omitted a default panel with a Reload button renders. */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle exceptions in its subtree so one crashing surface
 * doesn't white-screen the app. Styled with plain Tailwind + dark: classes
 * (the old inline-style token shim it predates was retired in FE5.6).
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <div className="flex h-full min-h-[240px] w-full items-center justify-center p-6">
          <div className="max-w-md rounded-lg border border-neutral-300 bg-white p-6 text-center dark:border-neutral-700 dark:bg-neutral-900">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Something went wrong
            </h2>
            <p className="mt-2 break-words text-sm text-neutral-600 dark:text-neutral-400">
              {this.state.error.message || "An unexpected error occurred."}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
