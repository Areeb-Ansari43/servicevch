import { BrandLogo } from "./brand-logo";

interface LogoLoaderProps {
  fullscreen?: boolean;
  message?: string;
  className?: string;
}

export function LogoLoader({ fullscreen = true, message, className = "" }: LogoLoaderProps) {
  const content = (
    <div className={`flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300 ${className}`}>
      <div className="relative flex items-center justify-center mb-4">
        {/* Pulsing subtle ambient halo using theme accent color */}
        <div className="absolute inset-0 rounded-full bg-[var(--vch-accent,#ff6a00)]/20 blur-xl animate-pulse" />

        {/* Logo container */}
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--vch-card-bg,rgba(255,255,255,0.05))] border border-[var(--vch-border,rgba(255,255,255,0.1))] shadow-lg p-2.5">
          <BrandLogo className="h-full w-full animate-pulse" />
        </div>
      </div>

      {message && (
        <p className="text-sm font-medium text-[var(--vch-text-muted,#94a3b8)] animate-pulse">
          {message}
        </p>
      )}
    </div>
  );

  if (!fullscreen) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--vch-bg,#0a0b10)] transition-colors duration-200">
      {content}
    </div>
  );
}
