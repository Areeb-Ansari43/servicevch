import React, { Component, type ReactNode } from "react";
import { T } from "@/routes/index";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RouteErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[RouteErrorBoundary] Caught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          className="relative flex min-h-screen items-center justify-center px-4 text-[#eef2f8]"
          style={{ background: T.bg }}
        >
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#10141d] p-6 text-center shadow-2xl backdrop-blur-xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15 text-red-400">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white">
              {this.props.fallbackTitle ?? "Something went wrong"}
            </h2>
            <p className="mt-2 text-xs text-[#aeb8c9]">
              {this.props.fallbackMessage ??
                (this.state.error?.message || "An unexpected error occurred during rendering.")}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="rounded-lg bg-[#ff6a00] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#e05d00]"
              >
                Reload Page
              </button>
              <a
                href="/login"
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-[#e7eaf0] transition hover:bg-white/10"
              >
                Go to Sign In
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
