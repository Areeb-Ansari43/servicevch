import { Link } from "@tanstack/react-router";

/**
 * Branded 404 / empty-state panel used by the router's notFoundComponent and by
 * valid-shaped-but-missing records (e.g. an unknown registration plate).
 */
export function NotFoundPanel({
  code = "404",
  title,
  subtitle,
  showVehiclesLink = false,
}: {
  code?: string;
  title: string;
  subtitle: string;
  showVehiclesLink?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-14 text-center backdrop-blur-xl">
      <div
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-72 w-72 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(255,106,0,0.55), transparent 65%)" }}
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-md flex-col items-center">
        <div className="vch-float mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-[#ff6a00]">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-8 w-8"
          >
            <path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm18 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
            <path d="M3 17v-5l2-5h14l2 5v5" />
          </svg>
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ff6a00]">
          Virtual Car Hire
        </div>
        <div className="mt-2 bg-gradient-to-b from-white to-white/40 bg-clip-text text-6xl font-black leading-none text-transparent">
          {code}
        </div>
        <h1 className="mt-4 text-xl font-semibold text-white">{title}</h1>
        <p className="mt-2 text-sm text-[#9aa5b8]">{subtitle}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Link
            to="/"
            className="rounded-full bg-[#ff6a00] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e05d00]"
          >
            Back to Dashboard
          </Link>
          {showVehiclesLink && (
            <Link
              to="/vehicles"
              className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.09]"
            >
              View all vehicles
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
