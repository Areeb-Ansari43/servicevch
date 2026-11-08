import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** Human-readable card name shown in the fallback, e.g. "Bot Instructions". */
  name: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Isolates a single Settings card. If the card throws while rendering, only that
 * card is replaced with a short readable error; the rest of /settings keeps working.
 */
export class SettingsCardBoundary extends Component<Props, State> {
  public state: State = { error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[SettingsCardBoundary] "${this.props.name}" card failed:`,
      error,
      info.componentStack,
    );
  }

  private reset = () => this.setState({ error: null });

  public render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message = (error.message || "Unknown error").slice(0, 200);
    return (
      <div
        role="alert"
        data-settings-card-error={this.props.name}
        className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-red-300">
              {this.props.name} couldn&apos;t load
            </div>
            <div className="mt-1 break-words font-mono text-[11px] text-red-200/80">{message}</div>
            <div className="mt-1 text-[11px] text-[#9aa5b8]">
              The rest of Settings still works. Try again, or check /api/health.
            </div>
          </div>
          <button
            type="button"
            onClick={this.reset}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
